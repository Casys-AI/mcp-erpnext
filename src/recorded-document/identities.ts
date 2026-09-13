/**
 * Closed six-doctype recorded-document identities owned by mcp-erpnext.
 *
 * Package and App versions are the same published prerelease (3.1.0-beta.10).
 * Presentation of a recorded document is not a live ERP qualification, not
 * an authenticated ERP read, and not a signed human review.
 *
 * `sourceInstance.siteId` is an opaque site fingerprint
 * (`sha256:` + 64 hex). This lot never derives it from a client; the parser
 * only validates its shape and its joins. The future DT binding owns capture
 * and qualification; no DT operation identity is invented here.
 */

export const RECORDED_DOCUMENT_SCHEMA =
  "io.casys.mcp-erpnext.recorded-document/1.0" as const;
export const RECORDED_DOCUMENT_SESSION_SCHEMA =
  "io.casys.mcp-erpnext.recorded-document-session/1.0" as const;

export const RECORDED_DOCUMENT_VIEWER_SESSION_KIND =
  "recorded.document" as const;

export const RECORDED_DOCUMENT_VIEWER_URI =
  "ui://mcp-erpnext/recorded-document-viewer" as const;
export const RECORDED_DOCUMENT_VIEW_APP_MANIFEST_URI =
  "ui://mcp-erpnext/recorded-document-manifest" as const;

export const RECORDED_DOCUMENT_VIEW_APP_ID =
  "io.casys.mcp-erpnext.recorded-document" as const;
export const RECORDED_DOCUMENT_VIEW_APP_TITLE =
  "ERPNext Recorded Document" as const;
export const RECORDED_DOCUMENT_VIEW_APP_VERSION = "3.1.0-beta.10" as const;

export const RECORDED_DOCUMENT_SOURCE_INSTANCE_KIND = "erpnext-site" as const;

/** The six doctypes rendered by the shared operational profiles. No seventh. */
export const RECORDED_DOCUMENT_DOCTYPES = [
  "Project",
  "Task",
  "Timesheet",
  "BOM",
  "Work Order",
  "Job Card",
] as const;

export type RecordedDocumentDoctype = typeof RECORDED_DOCUMENT_DOCTYPES[number];

/** Digest address of the canonical record bytes (record minus `fingerprint`). */
export const RECORDED_DOCUMENT_URI_PREFIX =
  "casys://mcp-erpnext/recorded-document/sha256/" as const;
export const RECORDED_DOCUMENT_URI_PATTERN =
  /^casys:\/\/mcp-erpnext\/recorded-document\/sha256\/([a-f0-9]{64})$/;

/** Thread document identities are opaque references supplied by Digital Thread.
 * The owner checks their bounded shape and exact anchor equality, and never
 * imposes a new Digital Thread producer address or artifact-id convention.
 */
export const RECORDED_THREAD_DOCUMENT_KIND = "document" as const;
export const RECORDED_THREAD_DOCUMENT_MAX_ID_LENGTH = 512;
export const RECORDED_THREAD_DOCUMENT_MAX_URI_LENGTH = 2048;

/** Live-view metadata keys refused recursively inside a recorded document. */
export const RECORDED_LIVE_VIEW_KEYS = [
  "_availableTools",
  "_sendMessageHints",
  "refreshRequest",
] as const;

export const RECORDED_DOCUMENT_MAX_CANONICAL_BYTES = 262144;
export const RECORDED_DOCUMENT_MAX_CHILD_ROWS = 200;
export const RECORDED_DOCUMENT_MAX_NAME_LENGTH = 140;
export const RECORDED_DOCUMENT_MAX_STRING_LENGTH = 32768;
export const RECORDED_DOCUMENT_MAX_OBJECT_KEYS = 200;
export const RECORDED_DOCUMENT_MAX_DEPTH = 8;
/** Total visited nodes per document traversal, shared expansions included. */
export const RECORDED_DOCUMENT_MAX_DOCUMENT_NODES = 20000;

export const RECORDED_DOCUMENT_CONTRACT_LABEL =
  "recorded-document contract" as const;

export const SYNTHETIC_RECORDED_NOTICE =
  "synthetic recorded fixture — not an ERP document, run, or qualification";
