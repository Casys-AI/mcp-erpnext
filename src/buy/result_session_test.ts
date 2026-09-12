import { assertEquals, assertRejects } from "@std/assert";
import { parseBuyRecordedResult } from "./result.ts";
import { parseBuyViewerSession, withSessionFingerprint } from "./session.ts";
import {
  BUY_VIEW_APP_MANIFEST,
  VIEWER_SESSION_APPLY_ACTION,
} from "./manifest.ts";
import {
  syntheticAvailableSession,
  syntheticCapture,
  syntheticCompleteResult,
  syntheticExpiredGapResult,
  syntheticPartialGlobalGapResult,
  syntheticPartialResult,
  syntheticSiteId,
  syntheticUnavailableSession,
  syntheticUnresolvedSession,
} from "./synthetic.ts";
import { sealBuySourceCapture } from "./capture.ts";
import { BUY_VIEW_APP_VERSION } from "./identities.ts";

Deno.test("complete synthetic result parses and keeps covered-subtotal plus complete-total", async () => {
  const capture = await sealBuySourceCapture(await syntheticCapture());
  const result = await syntheticCompleteResult(
    capture.fingerprint,
    capture.capture.sourceInstance.siteId,
  );
  const parsed = parseBuyRecordedResult(result);
  assertEquals(parsed.coverage.status, "complete");
  assertEquals(parsed.totals.map((total) => total.kind), [
    "covered-subtotal",
    "complete-total",
  ]);
});

Deno.test("authentic partial result remains partial", async () => {
  const capture = await sealBuySourceCapture(await syntheticCapture());
  const result = await syntheticPartialResult(
    capture.fingerprint,
    capture.capture.sourceInstance.siteId,
  );
  const parsed = parseBuyRecordedResult(result);
  assertEquals(parsed.coverage.status, "partial");
  assertEquals(
    parsed.totals.some((total) => total.kind === "complete-total"),
    false,
  );
  assertEquals(parsed.gaps[0].code, "documentary");
});

Deno.test("expired catalogue price stays dated and unresolved", async () => {
  const capture = await sealBuySourceCapture(
    await syntheticCapture({ expiredPrice: true }),
  );
  const result = await syntheticExpiredGapResult(
    capture.fingerprint,
    capture.capture.sourceInstance.siteId,
  );
  const parsed = parseBuyRecordedResult(result);
  assertEquals(parsed.coverage.status, "unresolved");
  assertEquals(parsed.lines[0].validUpto, "2026-06-01");
  assertEquals(parsed.gaps[0].code, "expired");
});

Deno.test("mixed-site sourceCaptures are rejected", async () => {
  const capture = await sealBuySourceCapture(await syntheticCapture());
  const result = await syntheticCompleteResult(
    capture.fingerprint,
    capture.capture.sourceInstance.siteId,
  );
  const mixed = {
    ...result,
    sourceCaptures: [
      result.sourceCaptures[0],
      {
        ...result.sourceCaptures[0],
        sourceInstance: {
          kind: "erpnext-site" as const,
          siteId: `sha256:${"e".repeat(64)}`,
        },
      },
    ],
  };
  assertRejectsSync(() => parseBuyRecordedResult(mixed), "one sourceInstance");
});

Deno.test("all covered items plus a global transport gap remain partial", async () => {
  const capture = await sealBuySourceCapture(await syntheticCapture());
  const result = await syntheticPartialGlobalGapResult(
    capture.fingerprint,
    capture.capture.sourceInstance.siteId,
  );
  const parsed = parseBuyRecordedResult(result);
  assertEquals(parsed.coverage.status, "partial");
  assertEquals(parsed.coverage.excludedLineIds, []);
  assertEquals(parsed.gaps[0].code, "transport-unknown");
  assertEquals(
    parsed.totals.some((total) => total.kind === "complete-total"),
    false,
  );
});

Deno.test("complete coverage with an unresolved gap is refused", async () => {
  const capture = await sealBuySourceCapture(await syntheticCapture());
  const result = await syntheticCompleteResult(
    capture.fingerprint,
    capture.capture.sourceInstance.siteId,
  );
  const forged = {
    ...result,
    gaps: [{
      code: "transport-unknown",
      reason: "Synthetic missing transport source",
    }],
  };
  assertRejectsSync(() => parseBuyRecordedResult(forged), "unresolved gaps");
});

Deno.test("complete-total is refused on a partial result", async () => {
  const capture = await sealBuySourceCapture(await syntheticCapture());
  const result = await syntheticPartialResult(
    capture.fingerprint,
    capture.capture.sourceInstance.siteId,
  );
  const forged = {
    ...result,
    totals: [
      ...result.totals,
      { kind: "complete-total", currency: "EUR", amount: "25.00" },
    ],
  };
  assertRejectsSync(() => parseBuyRecordedResult(forged), "complete");
});

Deno.test("invalid currency is rejected", async () => {
  const capture = await sealBuySourceCapture(await syntheticCapture());
  const result = await syntheticCompleteResult(
    capture.fingerprint,
    capture.capture.sourceInstance.siteId,
  );
  const forged = {
    ...result,
    lines: [{ ...result.lines[0], currency: "euro" }],
  };
  assertRejectsSync(() => parseBuyRecordedResult(forged), "invalid format");
});

Deno.test("catalogue-price cannot use an external documentary source", async () => {
  const capture = await sealBuySourceCapture(await syntheticCapture());
  const result = await syntheticCompleteResult(
    capture.fingerprint,
    capture.capture.sourceInstance.siteId,
  );
  const forged = {
    ...result,
    lines: [{
      ...result.lines[0],
      source: {
        kind: "external-documentary" as const,
        uri: "casys://other/sha256/" + "f".repeat(64),
        fingerprint: `sha256:${"f".repeat(64)}`,
      },
    }],
  };
  assertRejectsSync(() => parseBuyRecordedResult(forged), "masquerade");
});

Deno.test("available session fingerprint and capture joins hold", async () => {
  const capture = await sealBuySourceCapture(await syntheticCapture());
  const result = await syntheticCompleteResult(
    capture.fingerprint,
    capture.capture.sourceInstance.siteId,
  );
  const session = await syntheticAvailableSession(result);
  const parsed = await parseBuyViewerSession(session);
  assertEquals(parsed.projection.status, "available");
  if (parsed.projection.status !== "available") {
    throw new Error("expected available");
  }
  assertEquals(parsed.projection.result.coverage.status, "complete");
});

Deno.test("tampered session fingerprint is rejected", async () => {
  const capture = await sealBuySourceCapture(await syntheticCapture());
  const result = await syntheticCompleteResult(
    capture.fingerprint,
    capture.capture.sourceInstance.siteId,
  );
  const session = await syntheticAvailableSession(result);
  const tampered = {
    ...session,
    basis: { ...session.basis, projectId: "other-project" },
  };
  await assertRejects(
    () => parseBuyViewerSession(tampered),
    TypeError,
    "sessionFingerprint",
  );
});

Deno.test("mismatching bundle anchor with a valid session hash is rejected", async () => {
  const capture = await sealBuySourceCapture(await syntheticCapture());
  const result = await syntheticCompleteResult(
    capture.fingerprint,
    capture.capture.sourceInstance.siteId,
  );
  const session = await syntheticAvailableSession(result);
  const mutated = await withSessionFingerprint({
    ...session,
    basis: {
      projectId: session.basis.projectId,
      projectRevision: session.basis.projectRevision,
      subjectId: session.basis.subjectId,
      thread: session.basis.thread,
    },
    anchor: {
      ...session.anchor,
      uri: `casys://buy-configuration-cost-seal-capture/sha256/${
        "f".repeat(64)
      }`,
      fingerprint: `sha256:${"f".repeat(64)}`,
    },
  });
  await assertRejects(
    () => parseBuyViewerSession(mutated),
    TypeError,
    "bundleRef",
  );
});

Deno.test("foreign capture ref is rejected", async () => {
  const capture = await sealBuySourceCapture(await syntheticCapture());
  const result = await syntheticCompleteResult(
    capture.fingerprint,
    capture.capture.sourceInstance.siteId,
  );
  const session = await syntheticAvailableSession(result);
  const mutated = await withSessionFingerprint({
    ...session,
    basis: {
      projectId: session.basis.projectId,
      projectRevision: session.basis.projectRevision,
      subjectId: session.basis.subjectId,
      thread: session.basis.thread,
    },
    provenance: {
      ...session.provenance,
      captureRefs: [{
        uri: "casys://mcp-erpnext/buy-source-capture/sha256/" + "9".repeat(64),
        fingerprint: `sha256:${"9".repeat(64)}`,
      }],
    },
  });
  await assertRejects(
    () => parseBuyViewerSession(mutated),
    TypeError,
    "captureRefs",
  );
});

Deno.test("unavailable and unresolved sessions remain labelled", async () => {
  const siteId = await syntheticSiteId();
  const capture = await sealBuySourceCapture(await syntheticCapture());
  const unavailable = await parseBuyViewerSession(
    await syntheticUnavailableSession(capture.fingerprint),
  );
  assertEquals(unavailable.projection.status, "unavailable");
  const unresolved = await parseBuyViewerSession(
    await syntheticUnresolvedSession(capture.fingerprint),
  );
  assertEquals(unresolved.projection.status, "unresolved");
  assertEquals(siteId.startsWith("sha256:"), true);
});

Deno.test("manifest is the published whole-view Buy evidence App", () => {
  assertEquals(BUY_VIEW_APP_MANIFEST.app.version, BUY_VIEW_APP_VERSION);
  assertEquals(BUY_VIEW_APP_MANIFEST.app.version, "3.1.0-beta.9");
  assertEquals(
    BUY_VIEW_APP_MANIFEST.app.version.includes("local.buy-evidence"),
    false,
  );
  assertEquals(
    BUY_VIEW_APP_MANIFEST.resources[0].acceptedActions[0],
    VIEWER_SESSION_APPLY_ACTION,
  );
  assertEquals(BUY_VIEW_APP_MANIFEST.resources[0].ownership, "whole-view");
});

function assertRejectsSync(fn: () => unknown, snippet: string): void {
  try {
    fn();
  } catch (error) {
    if (error instanceof TypeError && error.message.includes(snippet)) return;
    throw error;
  }
  throw new Error(`expected TypeError containing ${snippet}`);
}
