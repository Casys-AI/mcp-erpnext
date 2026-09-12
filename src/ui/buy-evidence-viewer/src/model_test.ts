import { assertEquals, assertRejects } from "@std/assert";
import { displayStateFromViewerSession } from "./model.ts";
import { sealBuySourceCapture } from "../../../buy/capture.ts";
import {
  syntheticAvailableSession,
  syntheticCapture,
  syntheticCompleteResult,
  syntheticPartialResult,
  syntheticUnavailableSession,
} from "../../../buy/synthetic.ts";

Deno.test("viewer session available/partial/unavailable stay truthful", async () => {
  const capture = await sealBuySourceCapture(await syntheticCapture());
  const complete = await syntheticCompleteResult(
    capture.fingerprint,
    capture.capture.sourceInstance.siteId,
  );
  const available = await displayStateFromViewerSession(
    await syntheticAvailableSession(complete),
  );
  assertEquals(available.kind, "result");
  const partial = await displayStateFromViewerSession(
    await syntheticAvailableSession(
      await syntheticPartialResult(
        capture.fingerprint,
        capture.capture.sourceInstance.siteId,
      ),
    ),
  );
  assertEquals(partial.kind, "result");
  if (partial.kind === "result") {
    assertEquals(partial.result.coverage.status, "partial");
  }
  const unavailable = await displayStateFromViewerSession(
    await syntheticUnavailableSession(capture.fingerprint),
  );
  assertEquals(unavailable.kind, "unavailable");
});

Deno.test("tampered session is not displayed as a result", async () => {
  const capture = await sealBuySourceCapture(await syntheticCapture());
  const result = await syntheticCompleteResult(
    capture.fingerprint,
    capture.capture.sourceInstance.siteId,
  );
  const session = await syntheticAvailableSession(result);
  await assertRejects(
    () =>
      displayStateFromViewerSession({
        ...session,
        basis: { ...session.basis, projectId: "other" },
      }),
    TypeError,
    "sessionFingerprint",
  );
});
