import { assertEquals, assertRejects } from "@std/assert";
import { displayStateFromViewerSession } from "./model.ts";
import {
  SYNTHETIC_RECORDED_HISTORICAL_REASON,
  syntheticAvailableRecordedSession,
  syntheticSealedRecord,
  syntheticUnavailableRecordedSession,
  syntheticUnresolvedRecordedSession,
} from "../../../recorded-document/synthetic.ts";

Deno.test("viewer session available/unresolved/unavailable stay truthful", async () => {
  const record = await syntheticSealedRecord("project");
  const available = await displayStateFromViewerSession(
    await syntheticAvailableRecordedSession(record),
  );
  assertEquals(available.kind, "result");
  if (available.kind === "result") {
    assertEquals(available.data.record.name, record.name);
    assertEquals(available.data.applicability, undefined);
  }
  const historical = await displayStateFromViewerSession(
    await syntheticAvailableRecordedSession(record, {
      historicalReason: SYNTHETIC_RECORDED_HISTORICAL_REASON,
    }),
  );
  assertEquals(historical.kind, "result");
  if (historical.kind === "result") {
    assertEquals(historical.data.applicability, {
      status: "historical",
      reason: SYNTHETIC_RECORDED_HISTORICAL_REASON,
    });
  }
  const unresolved = await displayStateFromViewerSession(
    await syntheticUnresolvedRecordedSession(record),
  );
  assertEquals(unresolved.kind, "unresolved");
  const unavailable = await displayStateFromViewerSession(
    await syntheticUnavailableRecordedSession(record),
  );
  assertEquals(unavailable.kind, "unavailable");
});

Deno.test("tampered session is not displayed as a result", async () => {
  const record = await syntheticSealedRecord("task");
  const session = await syntheticAvailableRecordedSession(record);
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
