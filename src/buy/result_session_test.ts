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
  syntheticUnpricedResult,
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

Deno.test("/2.0 retains an unpriced selected line beside priced evidence", async () => {
  const capture = await sealBuySourceCapture(await syntheticCapture());
  const result = await syntheticUnpricedResult(
    capture.fingerprint,
    capture.capture.sourceInstance.siteId,
  );
  const parsed = parseBuyRecordedResult(result);
  assertEquals(
    parsed.schemaVersion,
    "io.casys.mcp-erpnext.buy-recorded-result/2.0",
  );
  assertEquals(parsed.coverage.status, "partial");
  assertEquals(parsed.totals, [
    { kind: "covered-subtotal", currency: "EUR", amount: "5.00" },
  ]);
  assertEquals(parsed.excludedLines, [{
    lineId: "line-unpriced",
    qty: "1",
    uom: "Nos",
    reason: "No admitted price source",
  }]);
  const session = await parseBuyViewerSession(
    await syntheticAvailableSession(parsed),
  );
  assertEquals(session.projection.status, "available");
  if (session.projection.status === "available") {
    assertEquals(
      session.projection.result.schemaVersion,
      "io.casys.mcp-erpnext.buy-recorded-result/2.0",
    );
  }
});

Deno.test("/2.0 all-unpriced evidence remains unresolved without a complete total", async () => {
  const capture = await sealBuySourceCapture(await syntheticCapture());
  const mixed = await syntheticUnpricedResult(
    capture.fingerprint,
    capture.capture.sourceInstance.siteId,
  );
  const allUnpriced = {
    ...mixed,
    lines: [],
    coverage: {
      ...mixed.coverage,
      status: "unresolved" as const,
      coveredLineIds: [],
    },
    totals: [{
      kind: "covered-subtotal" as const,
      currency: "EUR",
      amount: "0",
    }],
  };
  const parsed = parseBuyRecordedResult(allUnpriced);
  assertEquals(parsed.coverage.status, "unresolved");
  assertEquals(
    parsed.totals.some((total) => total.kind === "complete-total"),
    false,
  );
});

Deno.test("/2.0 refuses duplicate, unclassified, overlapping, and monetary excluded lines", async () => {
  const capture = await sealBuySourceCapture(await syntheticCapture());
  const result = await syntheticUnpricedResult(
    capture.fingerprint,
    capture.capture.sourceInstance.siteId,
  );
  assertRejectsSync(
    () =>
      parseBuyRecordedResult({
        ...result,
        excludedLines: [...result.excludedLines, result.excludedLines[0]],
      }),
    "must be unique",
  );
  assertRejectsSync(
    () =>
      parseBuyRecordedResult({
        ...result,
        excludedLines: [{
          ...result.excludedLines[0],
          lineId: "line-fastener",
        }],
        coverage: {
          ...result.coverage,
          excludedLineIds: ["line-fastener"],
        },
      }),
    "cannot duplicate a priced lineId",
  );
  assertRejectsSync(
    () =>
      parseBuyRecordedResult({
        ...result,
        coverage: { ...result.coverage, excludedLineIds: [] },
      }),
    "must classify every selected line",
  );
  assertRejectsSync(
    () =>
      parseBuyRecordedResult({
        ...result,
        coverage: {
          ...result.coverage,
          coveredLineIds: ["line-fastener", "line-unpriced"],
        },
      }),
    "disjoint",
  );
  assertRejectsSync(
    () =>
      parseBuyRecordedResult({
        ...result,
        excludedLines: [{ ...result.excludedLines[0], amount: "0" }],
      }),
    "unsupported fields",
  );
});

Deno.test("/1.0 remains exact and refuses the /2.0 excludedLines key", async () => {
  const capture = await sealBuySourceCapture(await syntheticCapture());
  const result = await syntheticCompleteResult(
    capture.fingerprint,
    capture.capture.sourceInstance.siteId,
  );
  assertRejectsSync(
    () => parseBuyRecordedResult({ ...result, excludedLines: [] }),
    "unsupported fields",
  );
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

Deno.test("sourceCaptures URI must be the public capture digest address", async () => {
  const capture = await sealBuySourceCapture(await syntheticCapture());
  const result = await syntheticCompleteResult(
    capture.fingerprint,
    capture.capture.sourceInstance.siteId,
  );
  const unanchored = {
    ...result,
    sourceCaptures: [{
      ...result.sourceCaptures[0],
      uri: "https://erp.test.example/not-a-capture",
    }],
  };
  assertRejectsSync(
    () => parseBuyRecordedResult(unanchored),
    "URI and fingerprint must identify the same bytes",
  );
  const mismatched = {
    ...result,
    sourceCaptures: [{
      ...result.sourceCaptures[0],
      fingerprint: `sha256:${"9".repeat(64)}`,
    }],
  };
  assertRejectsSync(
    () => parseBuyRecordedResult(mismatched),
    "URI and fingerprint must identify the same bytes",
  );
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
  assertEquals(BUY_VIEW_APP_MANIFEST.app.version, "3.1.0-beta.10");
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

Deno.test("bundle anchor ID cannot contradict its digest despite a valid session hash", async () => {
  const capture = await sealBuySourceCapture(await syntheticCapture());
  const result = await syntheticCompleteResult(
    capture.fingerprint,
    capture.capture.sourceInstance.siteId,
  );
  const session = await syntheticAvailableSession(result);
  const mutated = await withSessionFingerprint({
    ...session,
    anchor: { ...session.anchor, id: `buy-cost-bundle-${"0".repeat(64)}` },
  });
  await assertRejects(
    () => parseBuyViewerSession(mutated),
    TypeError,
    "anchor.id",
  );
});
