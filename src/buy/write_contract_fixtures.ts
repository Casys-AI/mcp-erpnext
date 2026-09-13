/**
 * Write synthetic canonical Buy fixtures for the Digital Thread worker.
 *
 * All commercial values are synthetic test inputs. This is not a real BOM,
 * quote, invoice, or purchase.
 */

import {
  BUY_BUNDLE_URI_PREFIX,
  BUY_CAPTURE_URI_PREFIX,
  SYNTHETIC_TEST_NOTICE,
} from "./identities.ts";
import {
  canonicalJson,
  sha256FingerprintOfUtf8,
  utf8ByteCount,
} from "./json.ts";
import { BUY_VIEW_APP_MANIFEST } from "./manifest.ts";
import { parseBuyRecordedResult } from "./result.ts";
import { parseBuyViewerSession, withSessionFingerprint } from "./session.ts";
import { parseBuyCaptureWrapper, sealBuySourceCapture } from "./capture.ts";
import {
  syntheticAvailableSession,
  syntheticCapture,
  syntheticCompleteResult,
  syntheticExpiredGapResult,
  syntheticPartialGlobalGapResult,
  syntheticPartialResult,
  syntheticUnavailableSession,
  syntheticUnpricedResult,
  syntheticUnresolvedSession,
} from "./synthetic.ts";

export interface BuyFixtureFs {
  mkdir(path: string): Promise<void>;
  writeTextFile(path: string, text: string): Promise<void>;
}

interface ManifestFile {
  readonly path: string;
  readonly schema: string;
  readonly status: "accepted" | "rejected";
  readonly sha256: string;
  readonly byteCount: number;
  readonly note: string;
}

export async function writeBuyContractFixtures(
  fs: BuyFixtureFs,
  root: string,
): Promise<{ manifestPath: string; files: ManifestFile[] }> {
  await fs.mkdir(`${root}/accepted`);
  await fs.mkdir(`${root}/rejected`);

  const capture = await sealBuySourceCapture(await syntheticCapture());
  await parseBuyCaptureWrapper(capture);
  const complete = parseBuyRecordedResult(
    await syntheticCompleteResult(
      capture.fingerprint,
      capture.capture.sourceInstance.siteId,
    ),
  );
  const partial = parseBuyRecordedResult(
    await syntheticPartialResult(
      capture.fingerprint,
      capture.capture.sourceInstance.siteId,
    ),
  );
  const expired = parseBuyRecordedResult(
    await syntheticExpiredGapResult(
      capture.fingerprint,
      capture.capture.sourceInstance.siteId,
    ),
  );
  const partialGlobal = parseBuyRecordedResult(
    await syntheticPartialGlobalGapResult(
      capture.fingerprint,
      capture.capture.sourceInstance.siteId,
    ),
  );
  const unpriced = parseBuyRecordedResult(
    await syntheticUnpricedResult(
      capture.fingerprint,
      capture.capture.sourceInstance.siteId,
    ),
  );
  const completeSession = await parseBuyViewerSession(
    await syntheticAvailableSession(complete),
  );
  const partialSession = await parseBuyViewerSession(
    await syntheticAvailableSession(partial),
  );
  const unavailable = await parseBuyViewerSession(
    await syntheticUnavailableSession(capture.fingerprint),
  );
  const unresolved = await parseBuyViewerSession(
    await syntheticUnresolvedSession(capture.fingerprint),
  );
  const partialGlobalSession = await parseBuyViewerSession(
    await syntheticAvailableSession(partialGlobal),
  );
  const unpricedSession = await parseBuyViewerSession(
    await syntheticAvailableSession(unpriced),
  );

  const files: ManifestFile[] = [];

  async function writeAccepted(
    relative: string,
    value: unknown,
    schema: string,
    note: string,
  ): Promise<void> {
    const text = typeof value === "string"
      ? value
      : canonicalJson(value, relative);
    const path = `${root}/${relative}`;
    await fs.writeTextFile(path, `${text}\n`);
    files.push({
      path: relative,
      schema,
      status: "accepted",
      sha256: await sha256FingerprintOfUtf8(text),
      byteCount: utf8ByteCount(text),
      note,
    });
  }

  async function writeRejected(
    relative: string,
    value: unknown,
    schema: string,
    note: string,
  ): Promise<void> {
    const text = JSON.stringify(value);
    const path = `${root}/${relative}`;
    await fs.writeTextFile(path, `${text}\n`);
    files.push({
      path: relative,
      schema,
      status: "rejected",
      sha256: await sha256FingerprintOfUtf8(text),
      byteCount: utf8ByteCount(text),
      note,
    });
  }

  await writeAccepted(
    "accepted/buy-source-capture.canonical.json",
    capture.canonicalText,
    "io.casys.mcp-erpnext.buy-source-capture/1.0",
    "Canonical capture payload (canonicalText). Hash this for CAS.",
  );
  await writeAccepted(
    "accepted/buy-source-capture.wrapper.json",
    capture,
    "io.casys.mcp-erpnext.buy-source-capture/1.0",
    "MCP structuredContent wrapper; DT should hash the inner canonicalText.",
  );
  await writeAccepted(
    "accepted/buy-recorded-result.complete.json",
    complete,
    "io.casys.mcp-erpnext.buy-recorded-result/1.0",
    "Complete coverage with covered-subtotal and complete-total.",
  );
  await writeAccepted(
    "accepted/buy-recorded-result.partial.json",
    partial,
    "io.casys.mcp-erpnext.buy-recorded-result/1.0",
    "Authentic incomplete bundle: partial coverage, documentary gap, no complete-total.",
  );
  await writeAccepted(
    "accepted/buy-recorded-result.expired-unresolved.json",
    expired,
    "io.casys.mcp-erpnext.buy-recorded-result/1.0",
    "Expired catalogue validity kept dated; coverage unresolved.",
  );
  await writeAccepted(
    "accepted/buy-recorded-result.partial-global-gap.json",
    partialGlobal,
    "io.casys.mcp-erpnext.buy-recorded-result/1.0",
    "All priced items covered; explicit global transport-unknown gap; no complete-total.",
  );
  await writeAccepted(
    "accepted/buy-recorded-result.partial-unpriced.json",
    unpriced,
    "io.casys.mcp-erpnext.buy-recorded-result/2.0",
    "Partial coverage with bounded unpriced line metadata; no invented price or complete-total.",
  );
  await writeAccepted(
    "accepted/buy-recorded-session.complete.json",
    completeSession,
    "io.casys.mcp-erpnext.buy-recorded-session/1.0",
    "Session fingerprint is canonical document minus basis.sessionFingerprint.",
  );
  await writeAccepted(
    "accepted/buy-recorded-session.partial.json",
    partialSession,
    "io.casys.mcp-erpnext.buy-recorded-session/1.0",
    "Available session wrapping the authentic partial result.",
  );
  await writeAccepted(
    "accepted/buy-recorded-session.unavailable.json",
    unavailable,
    "io.casys.mcp-erpnext.buy-recorded-session/1.0",
    "Literal unavailable projection.",
  );
  await writeAccepted(
    "accepted/buy-recorded-session.unresolved.json",
    unresolved,
    "io.casys.mcp-erpnext.buy-recorded-session/1.0",
    "Literal unresolved projection.",
  );
  await writeAccepted(
    "accepted/buy-recorded-session.partial-global-gap.json",
    partialGlobalSession,
    "io.casys.mcp-erpnext.buy-recorded-session/1.0",
    "Available session wrapping the global-gap partial result. Anchor equals DT bundleRef.",
  );
  await writeAccepted(
    "accepted/buy-recorded-session.partial-unpriced.json",
    unpricedSession,
    "io.casys.mcp-erpnext.buy-recorded-session/1.0",
    "Available session wrapping the /2.0 unpriced-line result.",
  );
  await writeAccepted(
    "accepted/buy-view-app-manifest.json",
    BUY_VIEW_APP_MANIFEST,
    "io.casys.mcp.view-app-manifest/1.0",
    "Published Buy evidence View App; not a live ERP qualification.",
  );

  const mixedSite = {
    ...complete,
    sourceCaptures: [
      complete.sourceCaptures[0],
      {
        ...complete.sourceCaptures[0],
        sourceInstance: {
          kind: "erpnext-site",
          siteId: `sha256:${"e".repeat(64)}`,
        },
      },
    ],
  };
  await writeRejected(
    "rejected/buy-recorded-result.mixed-site.json",
    mixedSite,
    "io.casys.mcp-erpnext.buy-recorded-result/1.0",
    "Two sourceInstance siteIds; parser must refuse.",
  );

  const malformed = { schemaVersion: "nope" };
  await writeRejected(
    "rejected/buy-source-capture.malformed.json",
    malformed,
    "io.casys.mcp-erpnext.buy-source-capture/1.0",
    "Missing required capture fields.",
  );

  const tamperedSession = {
    ...completeSession,
    basis: { ...completeSession.basis, projectId: "other-project" },
  };
  await writeRejected(
    "rejected/buy-recorded-session.tampered-fingerprint.json",
    tamperedSession,
    "io.casys.mcp-erpnext.buy-recorded-session/1.0",
    "Valid shape, wrong sessionFingerprint after basis mutation.",
  );

  const foreign = {
    ...completeSession,
    provenance: {
      ...completeSession.provenance,
      captureRefs: [{
        uri: `${BUY_CAPTURE_URI_PREFIX}${"9".repeat(64)}`,
        fingerprint: `sha256:${"9".repeat(64)}`,
      }],
    },
  };
  await writeRejected(
    "rejected/buy-recorded-session.foreign-capture-ref.json",
    foreign,
    "io.casys.mcp-erpnext.buy-recorded-session/1.0",
    "Capture ref does not match the recorded result sourceCaptures.",
  );

  const masquerade = {
    ...complete,
    lines: [{
      ...complete.lines[0],
      sourceCategory: "catalogue-price",
      source: {
        kind: "external-documentary",
        uri: "casys://other/sha256/" + "f".repeat(64),
        fingerprint: `sha256:${"f".repeat(64)}`,
      },
    }],
  };
  await writeRejected(
    "rejected/buy-recorded-result.price-masquerade.json",
    masquerade,
    "io.casys.mcp-erpnext.buy-recorded-result/1.0",
    "catalogue-price cannot use an external-documentary source.",
  );

  const completeWithGap = {
    ...complete,
    gaps: [{
      code: "transport-unknown",
      reason: "Synthetic missing transport source",
    }],
  };
  await writeRejected(
    "rejected/buy-recorded-result.complete-with-gap.json",
    completeWithGap,
    "io.casys.mcp-erpnext.buy-recorded-result/1.0",
    "coverage.complete cannot carry unresolved gaps.",
  );

  const mismatchingAnchor = await withSessionFingerprint({
    ...completeSession,
    basis: {
      projectId: completeSession.basis.projectId,
      projectRevision: completeSession.basis.projectRevision,
      subjectId: completeSession.basis.subjectId,
      thread: completeSession.basis.thread,
    },
    anchor: {
      ...completeSession.anchor,
      uri: `${BUY_BUNDLE_URI_PREFIX}${"f".repeat(64)}`,
      fingerprint: `sha256:${"f".repeat(64)}`,
    },
  });
  await writeRejected(
    "rejected/buy-recorded-session.mismatching-bundle-anchor.json",
    mismatchingAnchor,
    "io.casys.mcp-erpnext.buy-recorded-session/1.0",
    "Valid session hash but anchor does not equal provenance.bundleRef.",
  );

  const manifest = {
    notice: SYNTHETIC_TEST_NOTICE,
    hashConvention:
      "SHA-256 of the UTF-8 file body excluding the trailing newline written after canonical JSON. For capture CAS, hash accepted/buy-source-capture.canonical.json (the canonicalText). Session identity is canonical JSON of the session minus basis.sessionFingerprint.",
    algorithm: "SHA-256",
    canonicalJson:
      "recursively sorted object keys, significant array order, no undefined/non-finite values",
    files,
  };
  const manifestPath = `${root}/MANIFEST.json`;
  await fs.writeTextFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return { manifestPath, files };
}
