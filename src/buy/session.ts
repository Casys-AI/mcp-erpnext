/**
 * Closed recorded-session envelope for viewer.session.apply.
 *
 * Session fingerprint is SHA-256 of the canonical full document minus
 * `basis.sessionFingerprint`. Bad digest / foreign refs / mixed site become
 * parse failures; the viewer never falls back to live ERP.
 */

import {
  BUY_BUNDLE_ARTIFACT_ID_PATTERN,
  BUY_BUNDLE_ARTIFACT_KIND,
  BUY_BUNDLE_URI_PATTERN,
  BUY_CAPTURE_URI_PATTERN,
  BUY_RECORDED_SESSION_SCHEMA,
  BUY_SEAL_OPERATION,
  BUY_VIEWER_SESSION_KIND,
} from "./identities.ts";
import {
  assertDigestAddress,
  boundedArray,
  exactKeys,
  exactRecord,
  fingerprint,
  literal,
  nonEmpty,
  nonNegativeInteger,
  record,
  sha256Fingerprint,
} from "../shared/json.ts";
import { type BuyRecordedResult, parseBuyRecordedResult } from "./result.ts";

export interface BuyViewerSessionBasis {
  readonly projectId: string;
  readonly projectRevision: number;
  readonly subjectId: string;
  readonly thread: { readonly id: string; readonly revision: number };
  readonly sessionFingerprint: string;
}

export interface BuyViewerSessionAnchor {
  readonly kind: string;
  readonly id: string;
  readonly uri: string;
  readonly fingerprint: string;
}

export interface BuyViewerSessionProvenance {
  readonly kind: "digital-thread-operation";
  readonly operation: typeof BUY_SEAL_OPERATION;
  readonly runId: string;
  readonly configurationRef: {
    readonly uri: string;
    readonly fingerprint: string;
  };
  readonly bundleRef: { readonly uri: string; readonly fingerprint: string };
  readonly captureRefs: readonly {
    readonly uri: string;
    readonly fingerprint: string;
  }[];
}

export type BuyViewerSessionProjection =
  | { readonly status: "available"; readonly result: BuyRecordedResult }
  | { readonly status: "unresolved"; readonly reason: string }
  | { readonly status: "unavailable"; readonly reason: string };

export interface BuyViewerSession {
  readonly schemaVersion: typeof BUY_RECORDED_SESSION_SCHEMA;
  readonly kind: typeof BUY_VIEWER_SESSION_KIND;
  readonly basis: BuyViewerSessionBasis;
  readonly anchor: BuyViewerSessionAnchor;
  readonly provenance: BuyViewerSessionProvenance;
  readonly projection: BuyViewerSessionProjection;
}

export async function parseBuyViewerSession(
  value: unknown,
): Promise<BuyViewerSession> {
  const session = parseBuyViewerSessionStructure(value);
  const actualFingerprint = await buyRecordedSessionFingerprint(value);
  if (session.basis.sessionFingerprint !== actualFingerprint) {
    throw new TypeError(
      "viewer session.basis.sessionFingerprint does not match the recorded session.",
    );
  }
  assertBuyViewerSessionJoins(session);
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
export async function buyRecordedSessionFingerprint(
  value: unknown,
): Promise<string> {
  const root = exactRecord(value, [
    "schemaVersion",
    "kind",
    "basis",
    "anchor",
    "provenance",
    "projection",
  ], "viewer session fingerprint input");
  const basis = exactRecord(root.basis, [
    "projectId",
    "projectRevision",
    "subjectId",
    "thread",
    "sessionFingerprint",
  ], "viewer session fingerprint input.basis");
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

export async function withSessionFingerprint(
  session: Omit<BuyViewerSession, "basis"> & {
    readonly basis: Omit<BuyViewerSessionBasis, "sessionFingerprint">;
  },
): Promise<BuyViewerSession> {
  const placeholder = {
    ...session,
    basis: {
      ...session.basis,
      sessionFingerprint: `sha256:${"0".repeat(64)}`,
    },
  };
  const sessionFingerprint = await buyRecordedSessionFingerprint(placeholder);
  return {
    ...session,
    basis: { ...session.basis, sessionFingerprint },
  };
}

function parseBuyViewerSessionStructure(value: unknown): BuyViewerSession {
  const root = exactRecord(value, [
    "schemaVersion",
    "kind",
    "basis",
    "anchor",
    "provenance",
    "projection",
  ], "viewer session");
  literal(root.schemaVersion, BUY_RECORDED_SESSION_SCHEMA, "schemaVersion");
  literal(root.kind, BUY_VIEWER_SESSION_KIND, "kind");
  const basisValue = exactRecord(root.basis, [
    "projectId",
    "projectRevision",
    "subjectId",
    "thread",
    "sessionFingerprint",
  ], "viewer session.basis");
  const thread = exactRecord(
    basisValue.thread,
    ["id", "revision"],
    "viewer session.basis.thread",
  );
  const basis: BuyViewerSessionBasis = {
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
  );
  return {
    schemaVersion: BUY_RECORDED_SESSION_SCHEMA,
    kind: BUY_VIEWER_SESSION_KIND,
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
    projection: parseProjection(root.projection),
  };
}

function parseProvenance(value: unknown): BuyViewerSessionProvenance {
  const root = exactRecord(value, [
    "kind",
    "operation",
    "runId",
    "configurationRef",
    "bundleRef",
    "captureRefs",
  ], "viewer session.provenance");
  literal(root.kind, "digital-thread-operation", "provenance.kind");
  literal(root.operation, BUY_SEAL_OPERATION, "provenance.operation");
  const captureRefs = boundedArray(
    root.captureRefs,
    32,
    "viewer session.provenance.captureRefs",
  ).map((item, index) =>
    evidenceArtifact(item, `viewer session.provenance.captureRefs[${index}]`)
  );
  if (captureRefs.length === 0) {
    throw new TypeError(
      "viewer session.provenance.captureRefs must not be empty.",
    );
  }
  return {
    kind: "digital-thread-operation",
    operation: BUY_SEAL_OPERATION,
    runId: nonEmpty(root.runId, "viewer session.provenance.runId"),
    configurationRef: evidenceArtifact(
      root.configurationRef,
      "viewer session.provenance.configurationRef",
    ),
    bundleRef: evidenceArtifact(
      root.bundleRef,
      "viewer session.provenance.bundleRef",
    ),
    captureRefs,
  };
}

function parseProjection(value: unknown): BuyViewerSessionProjection {
  const root = record(value, "viewer session.projection");
  if (root.status === "available") {
    exactKeys(root, ["status", "result"], "viewer session.projection");
    return {
      status: "available",
      result: parseBuyRecordedResult(root.result),
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

function assertBuyViewerSessionJoins(session: BuyViewerSession): void {
  const { configurationRef, captureRefs, bundleRef } = session.provenance;
  assertPublishedBundleAnchor(session.anchor, bundleRef);
  for (const capture of captureRefs) {
    assertDigestAddress(
      capture.uri,
      capture.fingerprint,
      BUY_CAPTURE_URI_PATTERN,
      "viewer session.provenance.captureRefs",
    );
  }
  if (session.projection.status !== "available") return;
  const result = session.projection.result;
  if (
    result.configurationRef.uri !== configurationRef.uri ||
    result.configurationRef.fingerprint !== configurationRef.fingerprint
  ) {
    throw new TypeError(
      "viewer session configurationRef does not match the recorded result.",
    );
  }
  if (captureRefs.length !== result.sourceCaptures.length) {
    throw new TypeError(
      "viewer session captureRefs must match recorded sourceCaptures.",
    );
  }
  for (let index = 0; index < captureRefs.length; index += 1) {
    const ref = captureRefs[index];
    const capture = result.sourceCaptures[index];
    if (ref.fingerprint !== capture.fingerprint || ref.uri !== capture.uri) {
      throw new TypeError(
        "viewer session captureRefs must match recorded sourceCaptures.",
      );
    }
  }
  if (result.configuration.projectId !== session.basis.projectId) {
    throw new TypeError(
      "viewer session.basis.projectId does not match the recorded result.",
    );
  }
  if (result.configuration.subjectId !== session.basis.subjectId) {
    throw new TypeError(
      "viewer session.basis.subjectId does not match the recorded result.",
    );
  }
}

function assertPublishedBundleAnchor(
  anchor: BuyViewerSessionAnchor,
  bundleRef: { readonly uri: string; readonly fingerprint: string },
): void {
  if (anchor.kind !== BUY_BUNDLE_ARTIFACT_KIND) {
    throw new TypeError(
      "viewer session.anchor.kind must be the published DT document artifact.",
    );
  }
  if (!BUY_BUNDLE_ARTIFACT_ID_PATTERN.test(anchor.id)) {
    throw new TypeError(
      "viewer session.anchor.id must be buy-cost-bundle-<bundleDigest>.",
    );
  }
  if (
    anchor.uri !== bundleRef.uri ||
    anchor.fingerprint !== bundleRef.fingerprint
  ) {
    throw new TypeError(
      "viewer session.anchor must equal provenance.bundleRef; they name the published DT buy-cost-bundle, not the recorded result bytes.",
    );
  }
  assertDigestAddress(
    anchor.uri,
    anchor.fingerprint,
    BUY_BUNDLE_URI_PATTERN,
    "viewer session.anchor",
  );
  if (
    anchor.id !==
      `buy-cost-bundle-${anchor.fingerprint.slice("sha256:".length)}`
  ) {
    throw new TypeError(
      "viewer session.anchor.id must name the bundleRef digest.",
    );
  }
}

function evidenceArtifact(
  value: unknown,
  name: string,
): { uri: string; fingerprint: string } {
  const root = exactRecord(value, ["uri", "fingerprint"], name);
  return {
    uri: nonEmpty(root.uri, `${name}.uri`),
    fingerprint: fingerprint(root.fingerprint, `${name}.fingerprint`),
  };
}
