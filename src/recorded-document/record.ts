/**
 * Closed six-doctype recorded-document parser.
 *
 * A record keeps one bounded, inert ERP-shaped document with its literal
 * Frappe `modified`, an `observedAt` timestamp, and an opaque source site
 * identity. Fingerprints are byte-integrity checks over exact canonical
 * preimages — not ERP authentication, not a recorded run, not a signature:
 *
 * - `documentFingerprint` = SHA-256 over the UTF-8 bytes of
 *   `canonicalJson(document)`.
 * - `fingerprint` = SHA-256 over the UTF-8 bytes of
 *   `canonicalJson(record minus fingerprint)`, i.e. the exact object
 *   `{schemaVersion, doctype, name, modified, observedAt, sourceInstance,
 *   document, documentFingerprint}`. Those bytes are the addressable record;
 *   `provenance.recordRef` must name them, never a different object.
 *
 * Parsed records (and their documents, deeply) are frozen so a later
 * mutation cannot silently invalidate the verified fingerprints.
 */

import {
  RECORDED_DOCUMENT_CONTRACT_LABEL,
  RECORDED_DOCUMENT_DOCTYPES,
  RECORDED_DOCUMENT_MAX_CANONICAL_BYTES,
  RECORDED_DOCUMENT_MAX_CHILD_ROWS,
  RECORDED_DOCUMENT_MAX_DEPTH,
  RECORDED_DOCUMENT_MAX_NAME_LENGTH,
  RECORDED_DOCUMENT_MAX_OBJECT_KEYS,
  RECORDED_DOCUMENT_MAX_STRING_LENGTH,
  RECORDED_DOCUMENT_SCHEMA,
  RECORDED_DOCUMENT_SOURCE_INSTANCE_KIND,
  RECORDED_LIVE_VIEW_KEYS,
  type RecordedDocumentDoctype,
} from "./identities.ts";
import {
  canonicalJson,
  canonicalTimestamp,
  exactRecord,
  fingerprint,
  frappeDatetime,
  literal,
  nonEmpty,
  oneOf,
  rejectForbiddenKeys,
  sha256FingerprintOfUtf8,
  utf8ByteCount,
} from "../shared/json.ts";

const CONTRACT = RECORDED_DOCUMENT_CONTRACT_LABEL;
const LIVE_KEYS = new Set<string>(RECORDED_LIVE_VIEW_KEYS);

export interface RecordedDocumentSourceInstance {
  readonly kind: typeof RECORDED_DOCUMENT_SOURCE_INSTANCE_KIND;
  readonly siteId: string;
}

export interface UnsealedRecordedDocument {
  readonly schemaVersion: typeof RECORDED_DOCUMENT_SCHEMA;
  readonly doctype: RecordedDocumentDoctype;
  readonly name: string;
  readonly modified: string;
  readonly observedAt: string;
  readonly sourceInstance: RecordedDocumentSourceInstance;
  readonly document: Record<string, unknown>;
}

export interface RecordedDocument extends UnsealedRecordedDocument {
  readonly documentFingerprint: string;
  readonly fingerprint: string;
}

const UNSEALED_KEYS = [
  "schemaVersion",
  "doctype",
  "name",
  "modified",
  "observedAt",
  "sourceInstance",
  "document",
] as const;

const SEALED_KEYS = [
  ...UNSEALED_KEYS,
  "documentFingerprint",
  "fingerprint",
] as const;

export function recordedDocumentName(value: unknown, name: string): string {
  const parsed = nonEmpty(value, name);
  if (parsed.length > RECORDED_DOCUMENT_MAX_NAME_LENGTH) {
    throw new TypeError(
      `${name} exceeds the ${RECORDED_DOCUMENT_MAX_NAME_LENGTH}-character bound.`,
    );
  }
  return parsed;
}

export async function parseRecordedDocument(
  value: unknown,
): Promise<RecordedDocument> {
  const root = exactRecord(value, SEALED_KEYS, "recorded document", CONTRACT);
  const unsealed = parseUnsignedFields(root);
  const documentFingerprint = fingerprint(
    root.documentFingerprint,
    "recorded document.documentFingerprint",
  );
  const expectedDocumentFingerprint = await sha256FingerprintOfUtf8(
    canonicalJson(unsealed.document, "recorded document.document"),
  );
  if (documentFingerprint !== expectedDocumentFingerprint) {
    throw new TypeError(
      "recorded document.documentFingerprint does not match the canonical document bytes.",
    );
  }
  const preimage = {
    schemaVersion: unsealed.schemaVersion,
    doctype: unsealed.doctype,
    name: unsealed.name,
    modified: unsealed.modified,
    observedAt: unsealed.observedAt,
    sourceInstance: unsealed.sourceInstance,
    document: unsealed.document,
    documentFingerprint,
  };
  const canonicalPreimage = canonicalJson(preimage, "recorded document");
  assertCanonicalByteBound(canonicalPreimage);
  const expectedFingerprint = await sha256FingerprintOfUtf8(canonicalPreimage);
  const actualFingerprint = fingerprint(
    root.fingerprint,
    "recorded document.fingerprint",
  );
  if (actualFingerprint !== expectedFingerprint) {
    throw new TypeError(
      "recorded document.fingerprint does not match the canonical record bytes.",
    );
  }
  return freezeRecord({
    ...unsealed,
    documentFingerprint,
    fingerprint: actualFingerprint,
  });
}

/**
 * Seal an unsealed record: validate it strictly, then compute both
 * fingerprints. Test and fixture builders use this; there is no ERP capture
 * behind it in this lot.
 */
export async function sealRecordedDocument(
  value: unknown,
): Promise<RecordedDocument> {
  const root = exactRecord(
    value,
    UNSEALED_KEYS,
    "recorded document seal input",
    CONTRACT,
  );
  const unsealed = parseUnsignedFields(root);
  const documentFingerprint = await sha256FingerprintOfUtf8(
    canonicalJson(unsealed.document, "recorded document.document"),
  );
  const canonicalPreimage = canonicalJson({
    schemaVersion: unsealed.schemaVersion,
    doctype: unsealed.doctype,
    name: unsealed.name,
    modified: unsealed.modified,
    observedAt: unsealed.observedAt,
    sourceInstance: unsealed.sourceInstance,
    document: unsealed.document,
    documentFingerprint,
  }, "recorded document");
  assertCanonicalByteBound(canonicalPreimage);
  return freezeRecord({
    ...unsealed,
    documentFingerprint,
    fingerprint: await sha256FingerprintOfUtf8(canonicalPreimage),
  });
}

function parseUnsignedFields(
  root: Record<string, unknown>,
): UnsealedRecordedDocument {
  literal(
    root.schemaVersion,
    RECORDED_DOCUMENT_SCHEMA,
    "recorded document.schemaVersion",
  );
  const doctype = oneOf(
    root.doctype,
    RECORDED_DOCUMENT_DOCTYPES,
    "recorded document.doctype",
  );
  const name = recordedDocumentName(root.name, "recorded document.name");
  const modified = frappeDatetime(root.modified, "recorded document.modified");
  const observedAt = canonicalTimestamp(
    root.observedAt,
    "recorded document.observedAt",
  );
  const source = exactRecord(
    root.sourceInstance,
    ["kind", "siteId"],
    "recorded document.sourceInstance",
    CONTRACT,
  );
  literal(
    source.kind,
    RECORDED_DOCUMENT_SOURCE_INSTANCE_KIND,
    "recorded document.sourceInstance.kind",
  );
  rejectForbiddenKeys(root.document, "recorded document.document", CONTRACT);
  const document = assertBoundedDocument(root.document, {
    doctype,
    name,
    modified,
  });
  return {
    schemaVersion: RECORDED_DOCUMENT_SCHEMA,
    doctype,
    name,
    modified,
    observedAt,
    sourceInstance: {
      kind: RECORDED_DOCUMENT_SOURCE_INSTANCE_KIND,
      siteId: fingerprint(
        source.siteId,
        "recorded document.sourceInstance.siteId",
      ),
    },
    document,
  };
}

function assertCanonicalByteBound(canonicalPreimage: string): void {
  const byteCount = utf8ByteCount(canonicalPreimage);
  if (byteCount > RECORDED_DOCUMENT_MAX_CANONICAL_BYTES) {
    throw new TypeError(
      `recorded document exceeds the ${RECORDED_DOCUMENT_MAX_CANONICAL_BYTES}-byte canonical bound.`,
    );
  }
}

function assertBoundedDocument(
  value: unknown,
  identity: { doctype: string; name: string; modified: string },
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("recorded document.document must be an object.");
  }
  assertBoundedValue(value, "recorded document.document", 0);
  const document = value as Record<string, unknown>;
  if (document.doctype !== identity.doctype) {
    throw new TypeError(
      "recorded document.document.doctype must match the record doctype.",
    );
  }
  if (document.name !== identity.name) {
    throw new TypeError(
      "recorded document.document.name must match the record name.",
    );
  }
  if (document.modified !== identity.modified) {
    throw new TypeError(
      "recorded document.document.modified must match the record modified.",
    );
  }
  return document;
}

function assertBoundedValue(
  value: unknown,
  path: string,
  depth: number,
): void {
  if (depth > RECORDED_DOCUMENT_MAX_DEPTH) {
    throw new TypeError(
      `${path} exceeds the ${RECORDED_DOCUMENT_MAX_DEPTH}-level depth bound.`,
    );
  }
  if (typeof value === "string") {
    if (value.length > RECORDED_DOCUMENT_MAX_STRING_LENGTH) {
      throw new TypeError(
        `${path} exceeds the ${RECORDED_DOCUMENT_MAX_STRING_LENGTH}-character bound.`,
      );
    }
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(`${path} must contain only finite JSON numbers.`);
    }
    return;
  }
  if (
    value === null || typeof value === "boolean"
  ) {
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > RECORDED_DOCUMENT_MAX_CHILD_ROWS) {
      throw new TypeError(
        `${path} exceeds the ${RECORDED_DOCUMENT_MAX_CHILD_ROWS}-entry bound.`,
      );
    }
    for (let index = 0; index < value.length; index += 1) {
      assertBoundedValue(value[index], `${path}[${index}]`, depth + 1);
    }
    Object.freeze(value);
    return;
  }
  if (typeof value !== "object") {
    throw new TypeError(`${path} must be safe inert JSON.`);
  }
  const root = value as Record<string, unknown>;
  const prototype = Object.getPrototypeOf(root);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${path} must contain only plain JSON objects.`);
  }
  const keys = Object.keys(root);
  if (keys.length > RECORDED_DOCUMENT_MAX_OBJECT_KEYS) {
    throw new TypeError(
      `${path} exceeds the ${RECORDED_DOCUMENT_MAX_OBJECT_KEYS}-key bound.`,
    );
  }
  for (const key of keys) {
    if (LIVE_KEYS.has(key)) {
      throw new TypeError(
        `${path}.${key} is live-view metadata and must not appear in the ${CONTRACT}.`,
      );
    }
    assertBoundedValue(root[key], `${path}.${key}`, depth + 1);
  }
  Object.freeze(root);
}

function freezeRecord(record: RecordedDocument): RecordedDocument {
  Object.freeze(record.sourceInstance);
  return Object.freeze(record);
}
