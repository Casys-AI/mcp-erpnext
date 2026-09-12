/**
 * Buy source capture: bounded repeated-read of closed ERPNext documents.
 *
 * `canonicalText` is the canonical serialized capture payload. It includes
 * `schemaVersion`, `sourceInstance`, `capturedAt`, `documents`, and
 * `consistency`. It excludes the MCP transport wrapper (`canonicalText`,
 * `fingerprint`, `byteCount`, and the duplicate wrapper `schemaVersion`).
 *
 * Consistency is two fresh `get(..., { skipCache: true })` reads compared on
 * `modified` and the commercial projection fingerprint. This is not a
 * transactional ERP snapshot and not a historical asOf query.
 */

import type { FrappeClient } from "../api/frappe-client.ts";
import { FrappeAPIError } from "../api/frappe-client.ts";
import type { FrappeDoc } from "../api/types.ts";
import { BuyCaptureError } from "./errors.ts";
import {
  BUY_CAPTURE_DOCTYPE,
  BUY_CAPTURE_MAX_CANONICAL_BYTES,
  BUY_CAPTURE_MAX_DOCUMENTS,
  BUY_CAPTURE_MAX_NAME_LENGTH,
  BUY_CONSISTENCY_KIND,
  BUY_CONSISTENCY_READS,
  BUY_DOCTYPE_SOURCE_CATEGORY,
  BUY_SOURCE_CAPTURE_SCHEMA,
  BUY_SOURCE_INSTANCE_KIND,
  type BuyCaptureDoctype,
} from "./identities.ts";
import {
  boundedArray,
  canonicalJson,
  canonicalTimestamp,
  exactRecord,
  fingerprint,
  frappeDatetime,
  literal,
  nonEmpty,
  oneOf,
  positiveInteger,
  record,
  sha256FingerprintOfUtf8,
  utf8ByteCount,
} from "./json.ts";
import {
  BUY_DOCTYPE_FIELD_SPECS,
  type BuyCapturedDocument,
  isBuyCaptureDoctype,
  parseClosedWireChildren,
  parseClosedWireFields,
  projectBuyDocument,
} from "./projection.ts";
import { type BuySourceInstance, sourceInstanceFromClient } from "./site.ts";

const CALLER_AUTHORITY_KEYS = [
  "sourceInstance",
  "capturedAt",
  "fingerprint",
  "canonicalText",
  "byteCount",
  "endpoint",
  "uri",
  "credentials",
  "baseUrl",
  "siteId",
  "attestedTimestamp",
  "digest",
] as const;

export interface BuyCaptureDocumentRef {
  readonly doctype: BuyCaptureDoctype;
  readonly name: string;
  readonly expectedModified?: string;
}

export interface BuyCaptureInput {
  readonly documents: readonly BuyCaptureDocumentRef[];
}

export interface BuyCaptureConsistency {
  readonly kind: typeof BUY_CONSISTENCY_KIND;
  readonly reads: typeof BUY_CONSISTENCY_READS;
  readonly consistent: true;
}

/**
 * Canonical capture payload. This object — not the MCP wrapper — is the
 * preimage of `canonicalText` / `fingerprint` / `byteCount`.
 */
export interface BuySourceCapture {
  readonly schemaVersion: typeof BUY_SOURCE_CAPTURE_SCHEMA;
  readonly sourceInstance: BuySourceInstance;
  readonly capturedAt: string;
  readonly documents: readonly BuyCapturedDocument[];
  readonly consistency: BuyCaptureConsistency;
}

export interface BuyCaptureWrapper {
  readonly schemaVersion: typeof BUY_SOURCE_CAPTURE_SCHEMA;
  readonly capture: BuySourceCapture;
  readonly canonicalText: string;
  readonly fingerprint: string;
  readonly byteCount: number;
}

export interface BuyCaptureDeps {
  readonly client: Pick<FrappeClient, "get" | "normalizedSiteUrl">;
  readonly now?: () => Date;
}

export function parseBuyCaptureInput(value: unknown): BuyCaptureInput {
  const root = asRecord(value, "buy capture input");
  for (const key of CALLER_AUTHORITY_KEYS) {
    if (key in root) {
      throw new BuyCaptureError(
        "BUY_CAPTURE_CALLER_AUTHORITY_REJECTED",
        `buy capture input must not include caller-supplied ${key}.`,
        {
          recovery:
            "Omit sourceInstance, capturedAt, fingerprints, endpoints, and credentials; the configured FrappeClient and server clock own those fields.",
          context: { key },
        },
      );
    }
  }
  const keys = Object.keys(root);
  if (keys.length !== 1 || keys[0] !== "documents") {
    throw new BuyCaptureError(
      "BUY_CAPTURE_INVALID_INPUT",
      "buy capture input must contain only documents.",
      {
        recovery:
          "Pass a bounded list of exact {doctype, name, expectedModified?} references.",
        context: { keys },
      },
    );
  }
  if (!Array.isArray(root.documents)) {
    throw new BuyCaptureError(
      "BUY_CAPTURE_INVALID_INPUT",
      "buy capture input.documents must be an array.",
      {
        recovery: "Pass a dense list of exact document references.",
      },
    );
  }
  if (root.documents.length === 0) {
    throw new BuyCaptureError(
      "BUY_CAPTURE_INVALID_INPUT",
      "buy capture input.documents must not be empty.",
      {
        recovery: "Name the exact documents to capture.",
      },
    );
  }
  if (root.documents.length > BUY_CAPTURE_MAX_DOCUMENTS) {
    throw new BuyCaptureError(
      "BUY_CAPTURE_BOUNDS_EXCEEDED",
      `buy capture input.documents exceeds the ${BUY_CAPTURE_MAX_DOCUMENTS}-document bound.`,
      {
        recovery: "Narrow the capture; silent pagination is not allowed.",
        context: {
          limit: BUY_CAPTURE_MAX_DOCUMENTS,
          actual: root.documents.length,
        },
      },
    );
  }
  const seen = new Set<string>();
  const documents = root.documents.map((item, index) =>
    parseDocumentRef(item, index, seen)
  );
  return { documents };
}

export async function parseBuySourceCapture(
  value: unknown,
): Promise<BuySourceCapture> {
  const root = exactRecord(value, [
    "schemaVersion",
    "sourceInstance",
    "capturedAt",
    "documents",
    "consistency",
  ], "buy source capture");
  literal(
    root.schemaVersion,
    BUY_SOURCE_CAPTURE_SCHEMA,
    "buy source capture.schemaVersion",
  );
  const source = exactRecord(
    root.sourceInstance,
    ["kind", "siteId"],
    "buy source capture.sourceInstance",
  );
  literal(
    source.kind,
    BUY_SOURCE_INSTANCE_KIND,
    "buy source capture.sourceInstance.kind",
  );
  const documents = [];
  const rawDocuments = boundedArray(
    root.documents,
    BUY_CAPTURE_MAX_DOCUMENTS,
    "buy source capture.documents",
  );
  if (rawDocuments.length === 0) {
    throw new TypeError("buy source capture.documents must not be empty.");
  }
  const seenDocuments = new Set<string>();
  for (let index = 0; index < rawDocuments.length; index += 1) {
    const parsed = await parseCapturedDocument(rawDocuments[index], index);
    const id = `${parsed.doctype}:${parsed.name}`;
    if (seenDocuments.has(id)) {
      throw new TypeError(
        `buy source capture.documents[${index}] duplicates ${id}.`,
      );
    }
    seenDocuments.add(id);
    documents.push(parsed);
  }
  const consistency = exactRecord(
    root.consistency,
    ["kind", "reads", "consistent"],
    "buy source capture.consistency",
  );
  literal(
    consistency.kind,
    BUY_CONSISTENCY_KIND,
    "buy source capture.consistency.kind",
  );
  if (consistency.reads !== BUY_CONSISTENCY_READS) {
    throw new TypeError(
      "buy source capture.consistency.reads must be 2.",
    );
  }
  if (consistency.consistent !== true) {
    throw new TypeError(
      "buy source capture.consistency.consistent must be true; inconsistent captures are not a usable payload.",
    );
  }
  return {
    schemaVersion: BUY_SOURCE_CAPTURE_SCHEMA,
    sourceInstance: {
      kind: BUY_SOURCE_INSTANCE_KIND,
      siteId: fingerprint(
        source.siteId,
        "buy source capture.sourceInstance.siteId",
      ),
    },
    capturedAt: canonicalTimestamp(
      root.capturedAt,
      "buy source capture.capturedAt",
    ),
    documents,
    consistency: {
      kind: BUY_CONSISTENCY_KIND,
      reads: BUY_CONSISTENCY_READS,
      consistent: true,
    },
  };
}

export async function parseBuyCaptureWrapper(
  value: unknown,
): Promise<BuyCaptureWrapper> {
  const root = exactRecord(value, [
    "schemaVersion",
    "capture",
    "canonicalText",
    "fingerprint",
    "byteCount",
  ], "buy capture wrapper");
  literal(
    root.schemaVersion,
    BUY_SOURCE_CAPTURE_SCHEMA,
    "buy capture wrapper.schemaVersion",
  );
  const capture = await parseBuySourceCapture(root.capture);
  const canonicalText = nonEmpty(
    root.canonicalText,
    "buy capture wrapper.canonicalText",
  );
  const expectedText = canonicalJson(capture, "buy source capture");
  if (canonicalText !== expectedText) {
    throw new TypeError(
      "buy capture wrapper.canonicalText must equal the canonical capture payload.",
    );
  }
  const expectedFingerprint = await sha256FingerprintOfUtf8(canonicalText);
  const actualFingerprint = fingerprint(
    root.fingerprint,
    "buy capture wrapper.fingerprint",
  );
  if (actualFingerprint !== expectedFingerprint) {
    throw new TypeError(
      "buy capture wrapper.fingerprint must be SHA-256 of canonicalText.",
    );
  }
  const byteCount = positiveInteger(
    root.byteCount,
    "buy capture wrapper.byteCount",
  );
  if (byteCount !== utf8ByteCount(canonicalText)) {
    throw new TypeError(
      "buy capture wrapper.byteCount must equal the UTF-8 size of canonicalText.",
    );
  }
  if (byteCount > BUY_CAPTURE_MAX_CANONICAL_BYTES) {
    throw new TypeError(
      `buy capture wrapper.byteCount exceeds the ${BUY_CAPTURE_MAX_CANONICAL_BYTES}-byte bound.`,
    );
  }
  return {
    schemaVersion: BUY_SOURCE_CAPTURE_SCHEMA,
    capture,
    canonicalText,
    fingerprint: actualFingerprint,
    byteCount,
  };
}

export async function sealBuySourceCapture(
  capture: BuySourceCapture,
): Promise<BuyCaptureWrapper> {
  const parsed = await parseBuySourceCapture(capture);
  const canonicalText = canonicalJson(parsed, "buy source capture");
  const byteCount = utf8ByteCount(canonicalText);
  if (byteCount > BUY_CAPTURE_MAX_CANONICAL_BYTES) {
    throw new BuyCaptureError(
      "BUY_CAPTURE_BOUNDS_EXCEEDED",
      `buy source capture exceeds the ${BUY_CAPTURE_MAX_CANONICAL_BYTES}-byte bound.`,
      {
        recovery: "Narrow the capture; silent pagination is not allowed.",
        context: { limit: BUY_CAPTURE_MAX_CANONICAL_BYTES, actual: byteCount },
      },
    );
  }
  return {
    schemaVersion: BUY_SOURCE_CAPTURE_SCHEMA,
    capture: parsed,
    canonicalText,
    fingerprint: await sha256FingerprintOfUtf8(canonicalText),
    byteCount,
  };
}

export async function runBuyCapture(
  input: unknown,
  deps: BuyCaptureDeps,
): Promise<BuyCaptureWrapper> {
  const parsedInput = parseBuyCaptureInput(input);
  const now = deps.now ?? (() => new Date());
  const capturedAt = canonicalTimestamp(
    now().toISOString(),
    "buy source capture.capturedAt",
  );
  const sourceInstance = await sourceInstanceFromClient(deps.client);
  const first = await readAll(parsedInput.documents, deps.client);
  const documents = await Promise.all(
    first.map((row) => projectBuyDocument(row.doctype, row.doc)),
  );
  for (let index = 0; index < parsedInput.documents.length; index += 1) {
    const expected = parsedInput.documents[index].expectedModified;
    if (expected !== undefined && documents[index].modified !== expected) {
      throw new BuyCaptureError(
        "BUY_CAPTURE_EXPECTED_MODIFIED_MISMATCH",
        `Document ${documents[index].doctype}:${
          documents[index].name
        } modified does not match expectedModified.`,
        {
          recovery: "Re-resolve the exact document revision before capturing.",
          context: {
            doctype: documents[index].doctype,
            name: documents[index].name,
            modified: documents[index].modified,
            expectedModified: expected,
          },
        },
      );
    }
  }
  const second = await readAll(parsedInput.documents, deps.client);
  const reread = await Promise.all(
    second.map((row) => projectBuyDocument(row.doctype, row.doc)),
  );
  for (let index = 0; index < documents.length; index += 1) {
    const a = documents[index];
    const b = reread[index];
    if (a.modified !== b.modified || a.fingerprint !== b.fingerprint) {
      throw new BuyCaptureError(
        "BUY_CAPTURE_INCONSISTENT",
        `Document ${a.doctype}:${a.name} changed between the two skipCache reads.`,
        {
          retryable: true,
          recovery:
            "Retry the capture. Repeated-read consistency failed; this is not a transactional snapshot.",
          context: {
            doctype: a.doctype,
            name: a.name,
            firstModified: a.modified,
            secondModified: b.modified,
            firstFingerprint: a.fingerprint,
            secondFingerprint: b.fingerprint,
          },
        },
      );
    }
  }
  return await sealBuySourceCapture({
    schemaVersion: BUY_SOURCE_CAPTURE_SCHEMA,
    sourceInstance,
    capturedAt,
    documents,
    consistency: {
      kind: BUY_CONSISTENCY_KIND,
      reads: BUY_CONSISTENCY_READS,
      consistent: true,
    },
  });
}

async function readAll(
  refs: readonly BuyCaptureDocumentRef[],
  client: Pick<FrappeClient, "get">,
): Promise<readonly { doctype: BuyCaptureDoctype; doc: FrappeDoc }[]> {
  const docs: { doctype: BuyCaptureDoctype; doc: FrappeDoc }[] = [];
  for (const ref of refs) {
    let doc: FrappeDoc;
    try {
      doc = await client.get(ref.doctype, ref.name, { skipCache: true });
    } catch (error) {
      if (error instanceof FrappeAPIError && error.status === 404) {
        throw new BuyCaptureError(
          "BUY_CAPTURE_MISSING_SOURCE",
          `Document ${ref.doctype}:${ref.name} was not found.`,
          {
            recovery:
              "Capture only documents that currently exist on the configured site.",
            context: { doctype: ref.doctype, name: ref.name },
          },
        );
      }
      throw error;
    }
    assertExactReturnedIdentity(ref, doc);
    docs.push({ doctype: ref.doctype, doc });
  }
  return docs;
}

function assertExactReturnedIdentity(
  ref: BuyCaptureDocumentRef,
  doc: FrappeDoc,
): void {
  if (doc.name !== ref.name) {
    throw new BuyCaptureError(
      "BUY_CAPTURE_IDENTITY_MISMATCH",
      `Requested ${ref.doctype}:${ref.name} but the client returned name ${
        String(doc.name)
      }.`,
      {
        recovery:
          "Refuse the response; do not relabel a different ERP document as the requested identity.",
        context: {
          requestedDoctype: ref.doctype,
          requestedName: ref.name,
          returnedName: doc.name,
        },
      },
    );
  }
  if (
    doc.doctype !== undefined && doc.doctype !== null && doc.doctype !== "" &&
    doc.doctype !== ref.doctype
  ) {
    throw new BuyCaptureError(
      "BUY_CAPTURE_IDENTITY_MISMATCH",
      `Requested ${ref.doctype}:${ref.name} but the client returned doctype ${
        String(doc.doctype)
      }.`,
      {
        recovery:
          "Refuse the response; do not relabel a different ERP document as the requested identity.",
        context: {
          requestedDoctype: ref.doctype,
          requestedName: ref.name,
          returnedDoctype: doc.doctype,
        },
      },
    );
  }
}

function parseDocumentRef(
  value: unknown,
  index: number,
  seen: Set<string>,
): BuyCaptureDocumentRef {
  const path = `buy capture input.documents[${index}]`;
  const root = asRecord(value, path);
  const keys = Object.keys(root).toSorted();
  const allowed = root.expectedModified === undefined
    ? ["doctype", "name"]
    : ["doctype", "expectedModified", "name"];
  if (
    keys.length !== allowed.length ||
    keys.some((key, keyIndex) => key !== allowed[keyIndex])
  ) {
    throw new BuyCaptureError(
      "BUY_CAPTURE_INVALID_INPUT",
      `${path} must contain only doctype, name, and optional expectedModified.`,
      {
        recovery: "Do not pass endpoints, sourceInstance, or extra ERP fields.",
        context: { keys },
      },
    );
  }
  if (typeof root.doctype !== "string" || !isBuyCaptureDoctype(root.doctype)) {
    throw new BuyCaptureError(
      "BUY_CAPTURE_UNSUPPORTED_DOCTYPE",
      `${path}.doctype is not a closed Buy capture DocType.`,
      {
        recovery: `Use one of ${
          BUY_CAPTURE_DOCTYPE.join(", ")
        }. Generic doctypes cannot masquerade as a price.`,
        context: { doctype: root.doctype },
      },
    );
  }
  if (
    typeof root.name !== "string" ||
    root.name.trim() === "" ||
    root.name.trim() !== root.name
  ) {
    throw new BuyCaptureError(
      "BUY_CAPTURE_INVALID_INPUT",
      `${path}.name must be the exact ERP document name.`,
      { recovery: "Pass the exact document name, not a label." },
    );
  }
  if (root.name.length > BUY_CAPTURE_MAX_NAME_LENGTH) {
    throw new BuyCaptureError(
      "BUY_CAPTURE_BOUNDS_EXCEEDED",
      `${path}.name exceeds the ${BUY_CAPTURE_MAX_NAME_LENGTH}-character bound.`,
      {
        recovery: "Use the exact ERP document name.",
        context: {
          limit: BUY_CAPTURE_MAX_NAME_LENGTH,
          actual: root.name.length,
        },
      },
    );
  }
  const id = `${root.doctype}:${root.name}`;
  if (seen.has(id)) {
    throw new BuyCaptureError(
      "BUY_CAPTURE_INVALID_INPUT",
      `${path} duplicates ${id}.`,
      { recovery: "Each exact document reference may appear once." },
    );
  }
  seen.add(id);
  const expectedModified = root.expectedModified === undefined
    ? undefined
    : parseExpectedModified(root.expectedModified, `${path}.expectedModified`);
  return {
    doctype: root.doctype,
    name: root.name,
    ...(expectedModified !== undefined ? { expectedModified } : {}),
  };
}

function parseExpectedModified(value: unknown, path: string): string {
  if (
    typeof value !== "string" || value.trim() === "" || value.trim() !== value
  ) {
    throw new BuyCaptureError(
      "BUY_CAPTURE_INVALID_INPUT",
      `${path} must be the exact Frappe modified timestamp.`,
      { recovery: "Pass the document's modified value, not a caller digest." },
    );
  }
  try {
    frappeDatetime(value, path);
  } catch {
    throw new BuyCaptureError(
      "BUY_CAPTURE_INVALID_INPUT",
      `${path} is not a Frappe datetime.`,
      { recovery: "Pass the document's modified value." },
    );
  }
  return value;
}

async function parseCapturedDocument(
  value: unknown,
  index: number,
): Promise<BuyCapturedDocument> {
  const path = `buy source capture.documents[${index}]`;
  const root = record(value, path);
  const keys = Object.keys(root).toSorted();
  const optional = new Set(["docstatus", "status", "children"]);
  const required = [
    "doctype",
    "fields",
    "fingerprint",
    "modified",
    "name",
    "sourceCategory",
  ];
  const actualRequired = keys.filter((key) => !optional.has(key)).toSorted();
  if (
    actualRequired.length !== required.length ||
    actualRequired.some((key, keyIndex) => key !== required[keyIndex])
  ) {
    throw new TypeError(`${path} contains missing or unsupported fields.`);
  }
  const extra = keys.filter((key) =>
    !required.includes(key) && !optional.has(key)
  );
  if (extra.length > 0) {
    throw new TypeError(`${path} contains missing or unsupported fields.`);
  }
  const doctype = oneOf(
    root.doctype,
    BUY_CAPTURE_DOCTYPE,
    `${path}.doctype`,
  );
  const document: BuyCapturedDocument = {
    doctype,
    name: nonEmpty(root.name, `${path}.name`),
    modified: frappeDatetime(root.modified, `${path}.modified`),
    ...(root.docstatus === undefined ? {} : {
      docstatus: parseDocstatus(root.docstatus, `${path}.docstatus`),
    }),
    ...(root.status === undefined
      ? {}
      : { status: nonEmpty(root.status, `${path}.status`) }),
    sourceCategory: nonEmpty(
      root.sourceCategory,
      `${path}.sourceCategory`,
    ) as BuyCapturedDocument["sourceCategory"],
    fields: parseClosedWireFields(
      root.fields,
      BUY_DOCTYPE_FIELD_SPECS[doctype],
      `${path}.fields`,
    ),
    ...(root.children === undefined ? {} : {
      children: parseClosedWireChildren(
        doctype,
        root.children,
        `${path}.children`,
      ),
    }),
    fingerprint: fingerprint(root.fingerprint, `${path}.fingerprint`),
  };
  if (document.sourceCategory !== BUY_DOCTYPE_SOURCE_CATEGORY[doctype]) {
    throw new TypeError(
      `${path}.sourceCategory must match the closed DocType; a generic document cannot masquerade as a price.`,
    );
  }
  const { fingerprint: _ignored, ...identity } = document;
  const expectedFingerprint = await sha256FingerprintOfUtf8(
    canonicalJson(identity, `${path} identity`),
  );
  if (document.fingerprint !== expectedFingerprint) {
    throw new TypeError(
      `${path}.fingerprint must be SHA-256 of the document projection without fingerprint.`,
    );
  }
  return document;
}

function parseDocstatus(value: unknown, path: string): number {
  if (value !== 0 && value !== 1 && value !== 2) {
    throw new TypeError(`${path} must be 0, 1, or 2.`);
  }
  return value;
}

function asRecord(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BuyCaptureError(
      "BUY_CAPTURE_INVALID_INPUT",
      `${name} must be an object.`,
      { recovery: "Pass a JSON object with exact keys." },
    );
  }
  return value as Record<string, unknown>;
}
