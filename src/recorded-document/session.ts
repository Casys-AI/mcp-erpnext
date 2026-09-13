/**
 * Closed recorded-document session envelope for viewer.session.apply.
 *
 * The session delivers one recorded document (or an explicit unresolved /
 * unavailable state) with its documentary provenance: the record digest
 * address, the anchored Thread document reference, and the ERP tuple
 * `{doctype, name, modified, siteId, observedAt}`. There is no DT operation
 * identity here — no operation constant, no run id, no producer claim. A
 * future DT binding owns capture qualification and host delivery; this lot
 * only checks byte and reference coherence before render.
 *
 * Session fingerprint is SHA-256 of the canonical full document minus
 * `basis.sessionFingerprint`, like Buy. Bad digest / foreign refs / mixed
 * tuple values become parse failures; the viewer never falls back to live
 * ERP. Do not confuse the three disjoint fingerprints: the record bytes
 * fingerprint, the opaque Thread artefact fingerprint, and the session
 * fingerprint.
 */

import {
  RECORDED_DOCUMENT_CONTRACT_LABEL,
  RECORDED_DOCUMENT_DOCTYPES,
  RECORDED_DOCUMENT_SCHEMA,
  RECORDED_DOCUMENT_SESSION_SCHEMA,
  RECORDED_DOCUMENT_SOURCE_INSTANCE_KIND,
  RECORDED_DOCUMENT_URI_PATTERN,
  RECORDED_DOCUMENT_VIEWER_SESSION_KIND,
  RECORDED_THREAD_DOCUMENT_KIND,
  RECORDED_THREAD_DOCUMENT_MAX_ID_LENGTH,
  RECORDED_THREAD_DOCUMENT_MAX_URI_LENGTH,
  type RecordedDocumentDoctype,
} from "./identities.ts";
import {
  parseRecordedDocument,
  type RecordedDocument,
  recordedDocumentName,
} from "./record.ts";
import {
  assertDigestAddress,
  canonicalTimestamp,
  exactKeys,
  exactRecord,
  fingerprint,
  frappeDatetime,
  literal,
  nonEmpty,
  nonNegativeInteger,
  oneOf,
  record,
  sha256Fingerprint,
} from "../shared/json.ts";

const CONTRACT = RECORDED_DOCUMENT_CONTRACT_LABEL;

export interface RecordedViewerSessionBasis {
  readonly projectId: string;
  readonly projectRevision: number;
  readonly subjectId: string;
  readonly thread: { readonly id: string; readonly revision: number };
  readonly sessionFingerprint: string;
}

export interface RecordedViewerSessionAnchor {
  readonly kind: string;
  readonly id: string;
  readonly uri: string;
  readonly fingerprint: string;
}

export interface RecordedDocumentRef {
  readonly uri: string;
  readonly fingerprint: string;
}

export interface RecordedViewerSessionProvenance {
  readonly recordRef: RecordedDocumentRef;
  readonly threadDocumentRef: RecordedViewerSessionAnchor;
  readonly erp: {
    readonly doctype: RecordedDocumentDoctype;
    readonly name: string;
    readonly modified: string;
  };
  readonly sourceInstance: {
    readonly kind: typeof RECORDED_DOCUMENT_SOURCE_INSTANCE_KIND;
    readonly siteId: string;
  };
  readonly observedAt: string;
}

export interface RecordedApplicability {
  readonly status: "historical";
  readonly reason: string;
}

export type RecordedViewerSessionProjection =
  | {
    readonly status: "available";
    readonly record: RecordedDocument;
    readonly applicability?: RecordedApplicability;
  }
  | { readonly status: "unresolved"; readonly reason: string }
  | { readonly status: "unavailable"; readonly reason: string };

export interface RecordedViewerSession {
  readonly schemaVersion: typeof RECORDED_DOCUMENT_SESSION_SCHEMA;
  readonly kind: typeof RECORDED_DOCUMENT_VIEWER_SESSION_KIND;
  readonly basis: RecordedViewerSessionBasis;
  readonly anchor: RecordedViewerSessionAnchor;
  readonly provenance: RecordedViewerSessionProvenance;
  readonly projection: RecordedViewerSessionProjection;
}

export async function parseRecordedViewerSession(
  value: unknown,
): Promise<RecordedViewerSession> {
  const session = await parseRecordedViewerSessionStructure(value);
  const actualFingerprint = await recordedSessionFingerprint(value);
  if (session.basis.sessionFingerprint !== actualFingerprint) {
    throw new TypeError(
      "viewer session.basis.sessionFingerprint does not match the recorded session.",
    );
  }
  assertRecordedViewerSessionJoins(session);
  return session;
}

/**
 * SHA-256 of the complete recorded session identity and projection.
 *
 * The canonical subdocument is exactly
 * `{schemaVersion, kind, basis, anchor, provenance, projection}` where basis
 * contains `{projectId, projectRevision, subjectId, thread}`. Only
 * `basis.sessionFingerprint` is omitted to avoid self-reference.
 */
export async function recordedSessionFingerprint(
  value: unknown,
): Promise<string> {
  const root = exactRecord(
    value,
    [
      "schemaVersion",
      "kind",
      "basis",
      "anchor",
      "provenance",
      "projection",
    ],
    "viewer session fingerprint input",
    CONTRACT,
  );
  const basis = exactRecord(
    root.basis,
    [
      "projectId",
      "projectRevision",
      "subjectId",
      "thread",
      "sessionFingerprint",
    ],
    "viewer session fingerprint input.basis",
    CONTRACT,
  );
  return await sha256Fingerprint({
    schemaVersion: root.schemaVersion,
    kind: root.kind,
    basis: {
      projectId: basis.projectId,
      projectRevision: basis.projectRevision,
      subjectId: basis.subjectId,
      thread: basis.thread,
    },
    anchor: root.anchor,
    provenance: root.provenance,
    projection: root.projection,
  }, "viewer session fingerprint document");
}

export async function withRecordedSessionFingerprint(
  session: Omit<RecordedViewerSession, "basis"> & {
    readonly basis: Omit<RecordedViewerSessionBasis, "sessionFingerprint">;
  },
): Promise<RecordedViewerSession> {
  const placeholder = {
    ...session,
    basis: {
      ...session.basis,
      sessionFingerprint: `sha256:${"0".repeat(64)}`,
    },
  };
  const sessionFingerprint = await recordedSessionFingerprint(placeholder);
  return {
    ...session,
    basis: { ...session.basis, sessionFingerprint },
  };
}

async function parseRecordedViewerSessionStructure(
  value: unknown,
): Promise<RecordedViewerSession> {
  const root = exactRecord(
    value,
    [
      "schemaVersion",
      "kind",
      "basis",
      "anchor",
      "provenance",
      "projection",
    ],
    "viewer session",
    CONTRACT,
  );
  literal(
    root.schemaVersion,
    RECORDED_DOCUMENT_SESSION_SCHEMA,
    "schemaVersion",
  );
  literal(root.kind, RECORDED_DOCUMENT_VIEWER_SESSION_KIND, "kind");
  const basisValue = exactRecord(
    root.basis,
    [
      "projectId",
      "projectRevision",
      "subjectId",
      "thread",
      "sessionFingerprint",
    ],
    "viewer session.basis",
    CONTRACT,
  );
  const thread = exactRecord(
    basisValue.thread,
    ["id", "revision"],
    "viewer session.basis.thread",
    CONTRACT,
  );
  const basis: RecordedViewerSessionBasis = {
    projectId: nonEmpty(basisValue.projectId, "viewer session.basis.projectId"),
    projectRevision: nonNegativeInteger(
      basisValue.projectRevision,
      "viewer session.basis.projectRevision",
    ),
    subjectId: nonEmpty(basisValue.subjectId, "viewer session.basis.subjectId"),
    thread: {
      id: nonEmpty(thread.id, "viewer session.basis.thread.id"),
      revision: nonNegativeInteger(
        thread.revision,
        "viewer session.basis.thread.revision",
      ),
    },
    sessionFingerprint: fingerprint(
      basisValue.sessionFingerprint,
      "viewer session.basis.sessionFingerprint",
    ),
  };
  const anchorValue = exactRecord(
    root.anchor,
    ["kind", "id", "uri", "fingerprint"],
    "viewer session.anchor",
    CONTRACT,
  );
  return {
    schemaVersion: RECORDED_DOCUMENT_SESSION_SCHEMA,
    kind: RECORDED_DOCUMENT_VIEWER_SESSION_KIND,
    basis,
    anchor: {
      kind: nonEmpty(anchorValue.kind, "viewer session.anchor.kind"),
      id: nonEmpty(anchorValue.id, "viewer session.anchor.id"),
      uri: nonEmpty(anchorValue.uri, "viewer session.anchor.uri"),
      fingerprint: fingerprint(
        anchorValue.fingerprint,
        "viewer session.anchor.fingerprint",
      ),
    },
    provenance: parseProvenance(root.provenance),
    projection: await parseProjection(root.projection),
  };
}

function parseProvenance(value: unknown): RecordedViewerSessionProvenance {
  const root = exactRecord(
    value,
    [
      "recordRef",
      "threadDocumentRef",
      "erp",
      "sourceInstance",
      "observedAt",
    ],
    "viewer session.provenance",
    CONTRACT,
  );
  const erpValue = exactRecord(
    root.erp,
    ["doctype", "name", "modified"],
    "viewer session.provenance.erp",
    CONTRACT,
  );
  const source = exactRecord(
    root.sourceInstance,
    ["kind", "siteId"],
    "viewer session.provenance.sourceInstance",
    CONTRACT,
  );
  literal(
    source.kind,
    RECORDED_DOCUMENT_SOURCE_INSTANCE_KIND,
    "viewer session.provenance.sourceInstance.kind",
  );
  const threadDocumentRef = exactRecord(
    root.threadDocumentRef,
    ["kind", "id", "uri", "fingerprint"],
    "viewer session.provenance.threadDocumentRef",
    CONTRACT,
  );
  return {
    recordRef: evidenceArtifact(
      root.recordRef,
      "viewer session.provenance.recordRef",
    ),
    threadDocumentRef: {
      kind: nonEmpty(
        threadDocumentRef.kind,
        "viewer session.provenance.threadDocumentRef.kind",
      ),
      id: nonEmpty(
        threadDocumentRef.id,
        "viewer session.provenance.threadDocumentRef.id",
      ),
      uri: nonEmpty(
        threadDocumentRef.uri,
        "viewer session.provenance.threadDocumentRef.uri",
      ),
      fingerprint: fingerprint(
        threadDocumentRef.fingerprint,
        "viewer session.provenance.threadDocumentRef.fingerprint",
      ),
    },
    erp: {
      doctype: oneOf(
        erpValue.doctype,
        RECORDED_DOCUMENT_DOCTYPES,
        "viewer session.provenance.erp.doctype",
      ),
      name: recordedDocumentName(
        erpValue.name,
        "viewer session.provenance.erp.name",
      ),
      modified: frappeDatetime(
        erpValue.modified,
        "viewer session.provenance.erp.modified",
      ),
    },
    sourceInstance: {
      kind: RECORDED_DOCUMENT_SOURCE_INSTANCE_KIND,
      siteId: fingerprint(
        source.siteId,
        "viewer session.provenance.sourceInstance.siteId",
      ),
    },
    observedAt: canonicalTimestamp(
      root.observedAt,
      "viewer session.provenance.observedAt",
    ),
  };
}

async function parseProjection(
  value: unknown,
): Promise<RecordedViewerSessionProjection> {
  const root = record(value, "viewer session.projection");
  if (root.status === "available") {
    const withApplicability = "applicability" in root;
    exactKeys(
      root,
      withApplicability
        ? ["status", "record", "applicability"]
        : ["status", "record"],
      "viewer session.projection",
    );
    const parsed: RecordedViewerSessionProjection = {
      status: "available",
      record: await parseRecordedDocument(root.record),
    };
    if (!withApplicability) return parsed;
    const applicability = exactRecord(
      root.applicability,
      ["status", "reason"],
      "viewer session.projection.applicability",
      CONTRACT,
    );
    literal(
      applicability.status,
      "historical",
      "viewer session.projection.applicability.status",
    );
    return {
      ...parsed,
      applicability: {
        status: "historical",
        reason: nonEmpty(
          applicability.reason,
          "viewer session.projection.applicability.reason",
        ),
      },
    };
  }
  if (root.status === "unresolved" || root.status === "unavailable") {
    exactKeys(root, ["status", "reason"], "viewer session.projection");
    return {
      status: root.status,
      reason: nonEmpty(root.reason, "viewer session.projection.reason"),
    };
  }
  throw new TypeError(
    "viewer session.projection.status must be available, unresolved, or unavailable.",
  );
}

function assertRecordedViewerSessionJoins(
  session: RecordedViewerSession,
): void {
  assertThreadDocumentAnchor(
    session.anchor,
    session.provenance.threadDocumentRef,
  );
  assertDigestAddress(
    session.provenance.recordRef.uri,
    session.provenance.recordRef.fingerprint,
    RECORDED_DOCUMENT_URI_PATTERN,
    "viewer session.provenance.recordRef",
  );
  if (session.projection.status !== "available") return;
  const { recordRef, erp, sourceInstance, observedAt } = session.provenance;
  const recordValue = session.projection.record;
  if (
    recordValue.schemaVersion !== RECORDED_DOCUMENT_SCHEMA ||
    recordRef.uri !==
      `casys://mcp-erpnext/recorded-document/sha256/${
        recordValue.fingerprint.slice("sha256:".length)
      }` ||
    recordRef.fingerprint !== recordValue.fingerprint
  ) {
    throw new TypeError(
      "viewer session.provenance.recordRef must name the available record bytes.",
    );
  }
  if (
    erp.doctype !== recordValue.doctype || erp.name !== recordValue.name ||
    erp.modified !== recordValue.modified ||
    sourceInstance.siteId !== recordValue.sourceInstance.siteId ||
    observedAt !== recordValue.observedAt
  ) {
    throw new TypeError(
      "viewer session.provenance ERP tuple must match the available record.",
    );
  }
}

function assertThreadDocumentAnchor(
  anchor: RecordedViewerSessionAnchor,
  threadDocumentRef: RecordedViewerSessionAnchor,
): void {
  if (anchor.kind !== RECORDED_THREAD_DOCUMENT_KIND) {
    throw new TypeError(
      "viewer session.anchor.kind must be the Thread document artifact.",
    );
  }
  if (
    anchor.id.length > RECORDED_THREAD_DOCUMENT_MAX_ID_LENGTH ||
    anchor.uri.length > RECORDED_THREAD_DOCUMENT_MAX_URI_LENGTH
  ) {
    throw new TypeError(
      "viewer session.anchor exceeds bounded Thread reference lengths.",
    );
  }
  if (
    anchor.kind !== threadDocumentRef.kind ||
    anchor.id !== threadDocumentRef.id ||
    anchor.uri !== threadDocumentRef.uri ||
    anchor.fingerprint !== threadDocumentRef.fingerprint
  ) {
    throw new TypeError(
      "viewer session.anchor must equal provenance.threadDocumentRef; they name the anchored Thread document, not the record bytes.",
    );
  }
}

function evidenceArtifact(
  value: unknown,
  name: string,
): { uri: string; fingerprint: string } {
  const root = exactRecord(value, ["uri", "fingerprint"], name, CONTRACT);
  return {
    uri: nonEmpty(root.uri, `${name}.uri`),
    fingerprint: fingerprint(root.fingerprint, `${name}.fingerprint`),
  };
}
