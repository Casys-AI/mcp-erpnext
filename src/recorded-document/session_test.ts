import { assert, assertEquals, assertRejects } from "@std/assert";
import {
  SYNTHETIC_RECORDED_HISTORICAL_REASON,
  SYNTHETIC_RECORDED_THREAD_DIGEST,
  SYNTHETIC_RECORDED_UNAVAILABLE_REASON,
  SYNTHETIC_RECORDED_UNRESOLVED_REASON,
} from "./synthetic.ts";
import {
  parseRecordedViewerSession,
  type RecordedViewerSession,
  withRecordedSessionFingerprint,
} from "./session.ts";
import {
  syntheticAvailableRecordedSession,
  syntheticSealedRecord,
  syntheticUnavailableRecordedSession,
  syntheticUnresolvedRecordedSession,
} from "./synthetic.ts";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function reseal(
  session: RecordedViewerSession,
): Promise<RecordedViewerSession> {
  const { sessionFingerprint: _dropped, ...basis } = session.basis;
  return await withRecordedSessionFingerprint({ ...session, basis });
}

Deno.test("available session parses and keeps four disjoint fingerprints", async () => {
  const record = await syntheticSealedRecord("project");
  const session = await parseRecordedViewerSession(
    await syntheticAvailableRecordedSession(record),
  );
  assertEquals(session.projection.status, "available");
  if (session.projection.status !== "available") return;
  assertEquals(session.projection.record.fingerprint, record.fingerprint);
  assertEquals(session.projection.applicability, undefined);
  const fingerprints = new Set([
    session.projection.record.documentFingerprint,
    session.projection.record.fingerprint,
    session.anchor.fingerprint,
    session.basis.sessionFingerprint,
  ]);
  assertEquals(fingerprints.size, 4);
  assertEquals(
    session.anchor.fingerprint,
    `sha256:${SYNTHETIC_RECORDED_THREAD_DIGEST}`,
  );
  assertEquals(session.anchor.id, `recorded-document-thread-${"e".repeat(64)}`);
});

Deno.test("unresolved and unavailable sessions retain their literal reasons", async () => {
  const record = await syntheticSealedRecord("task");
  const unavailable = await parseRecordedViewerSession(
    await syntheticUnavailableRecordedSession(record),
  );
  assertEquals(unavailable.projection.status, "unavailable");
  if (unavailable.projection.status === "unavailable") {
    assertEquals(
      unavailable.projection.reason,
      SYNTHETIC_RECORDED_UNAVAILABLE_REASON,
    );
  }
  const unresolved = await parseRecordedViewerSession(
    await syntheticUnresolvedRecordedSession(record),
  );
  assertEquals(unresolved.projection.status, "unresolved");
  if (unresolved.projection.status === "unresolved") {
    assertEquals(
      unresolved.projection.reason,
      SYNTHETIC_RECORDED_UNRESOLVED_REASON,
    );
  }
  assertEquals(unavailable.provenance.erp.name, record.name);
});

Deno.test("historical applicability is explicit-only and historical-only", async () => {
  const record = await syntheticSealedRecord("timesheet");
  const historical = await parseRecordedViewerSession(
    await syntheticAvailableRecordedSession(record, {
      historicalReason: SYNTHETIC_RECORDED_HISTORICAL_REASON,
    }),
  );
  assertEquals(historical.projection.status, "available");
  if (historical.projection.status === "available") {
    assertEquals(historical.projection.applicability, {
      status: "historical",
      reason: SYNTHETIC_RECORDED_HISTORICAL_REASON,
    });
  }
  const forged = clone(await syntheticAvailableRecordedSession(record));
  if (forged.projection.status !== "available") {
    throw new Error("expected an available synthetic session");
  }
  const withCurrent = {
    ...forged,
    projection: {
      ...forged.projection,
      applicability: { status: "current", reason: "invented freshness" },
    },
  };
  await assertRejects(
    async () =>
      await parseRecordedViewerSession(
        await reseal(withCurrent as unknown as RecordedViewerSession),
      ),
    TypeError,
    "historical",
  );
});

Deno.test("tampered basis breaks the session fingerprint", async () => {
  const record = await syntheticSealedRecord("bom");
  const session = clone(await syntheticAvailableRecordedSession(record));
  await assertRejects(
    () =>
      parseRecordedViewerSession({
        ...session,
        basis: { ...session.basis, projectId: "other-project" },
      }),
    TypeError,
    "sessionFingerprint",
  );
});

Deno.test("foreign recordRef cannot address a different object", async () => {
  const record = await syntheticSealedRecord("work-order");
  const session = clone(await syntheticAvailableRecordedSession(record));
  const foreign = {
    ...session,
    provenance: {
      ...session.provenance,
      recordRef: {
        uri: `casys://mcp-erpnext/recorded-document/sha256/${"9".repeat(64)}`,
        fingerprint: `sha256:${"9".repeat(64)}`,
      },
    },
  };
  await assertRejects(
    async () => await parseRecordedViewerSession(await reseal(foreign)),
    TypeError,
    "must name the available record bytes",
  );
});

Deno.test("recordRef digest address must be internally consistent", async () => {
  const record = await syntheticSealedRecord("job-card");
  const session = clone(await syntheticAvailableRecordedSession(record));
  const mismatched = {
    ...session,
    provenance: {
      ...session.provenance,
      recordRef: {
        ...session.provenance.recordRef,
        fingerprint: `sha256:${"9".repeat(64)}`,
      },
    },
  };
  await assertRejects(
    async () => await parseRecordedViewerSession(await reseal(mismatched)),
    TypeError,
    "URI and fingerprint must identify the same bytes",
  );
});

Deno.test("anchor must equal the opaque Thread document reference", async () => {
  const record = await syntheticSealedRecord("project");
  const session = clone(await syntheticAvailableRecordedSession(record));
  const drifted = {
    ...session,
    anchor: {
      ...session.anchor,
      uri: `casys://digital-thread/document/sha256/${"f".repeat(64)}`,
      fingerprint: `sha256:${"f".repeat(64)}`,
    },
  };
  await assertRejects(
    async () => await parseRecordedViewerSession(await reseal(drifted)),
    TypeError,
    "must equal provenance.threadDocumentRef",
  );

  const opaqueAnchor = {
    ...session.anchor,
    id: "artifact:synthetic-opaque-document-v2",
    uri: "casys://synthetic-thread/retained-document/v2",
  };
  const opaque = {
    ...session,
    anchor: opaqueAnchor,
    provenance: { ...session.provenance, threadDocumentRef: opaqueAnchor },
  };
  const parsed = await parseRecordedViewerSession(await reseal(opaque));
  assertEquals(parsed.anchor, opaqueAnchor);
  const tooLongAnchor = { ...opaqueAnchor, id: "x".repeat(513) };
  await assertRejects(
    async () =>
      await parseRecordedViewerSession(
        await reseal({
          ...session,
          anchor: tooLongAnchor,
          provenance: {
            ...session.provenance,
            threadDocumentRef: tooLongAnchor,
          },
        }),
      ),
    TypeError,
    "bounded Thread reference lengths",
  );
});

Deno.test("every ERP tuple occurrence must match the available record", async () => {
  const record = await syntheticSealedRecord("task");
  const session = clone(await syntheticAvailableRecordedSession(record));
  const variants: RecordedViewerSession[] = [
    {
      ...session,
      provenance: {
        ...session.provenance,
        erp: { ...session.provenance.erp, name: "SYNTH-TASK-9999" },
      },
    },
    {
      ...session,
      provenance: {
        ...session.provenance,
        erp: { ...session.provenance.erp, modified: "2026-09-14 10:00:00" },
      },
    },
    {
      ...session,
      provenance: {
        ...session.provenance,
        sourceInstance: {
          ...session.provenance.sourceInstance,
          siteId: `sha256:${"9".repeat(64)}`,
        },
      },
    },
    {
      ...session,
      provenance: {
        ...session.provenance,
        observedAt: "2026-09-14T09:45:00.000Z",
      },
    },
  ];
  for (const variant of variants) {
    await assertRejects(
      async () => await parseRecordedViewerSession(await reseal(variant)),
      TypeError,
      "ERP tuple",
    );
  }
});

Deno.test("record bytes tampered inside an available session fail the record check", async () => {
  const record = await syntheticSealedRecord("timesheet");
  const session = clone(await syntheticAvailableRecordedSession(record));
  if (session.projection.status !== "available") {
    throw new Error("expected an available synthetic session");
  }
  const tampered = {
    ...session,
    projection: {
      ...session.projection,
      record: {
        ...session.projection.record,
        document: {
          ...session.projection.record.document,
          total_hours: 999,
        },
      },
    },
  };
  await assertRejects(
    async () => await parseRecordedViewerSession(await reseal(tampered)),
    TypeError,
    "documentFingerprint",
  );
});

Deno.test("session envelope stays closed and reasons stay non-empty", async () => {
  const record = await syntheticSealedRecord("bom");
  const session = clone(await syntheticAvailableRecordedSession(record));
  await assertRejects(
    () => parseRecordedViewerSession({ ...session, operation: "dt.capture@9" }),
    TypeError,
    "unsupported fields",
  );
  const unavailable = clone(await syntheticUnavailableRecordedSession(record));
  await assertRejects(
    () =>
      parseRecordedViewerSession({
        ...unavailable,
        projection: { status: "unavailable", reason: "  " },
      }),
    TypeError,
    "non-empty string",
  );
  await assertRejects(
    () =>
      parseRecordedViewerSession({
        ...session,
        kind: "buy.configuration-cost",
      }),
    TypeError,
    "recorded.document",
  );
  assert(
    !JSON.stringify(await syntheticAvailableRecordedSession(record)).includes(
      "dt.capture",
    ),
    "no DT operation identity may appear in the session",
  );
});
