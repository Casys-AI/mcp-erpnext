import { assert, assertEquals, assertRejects } from "@std/assert";
import {
  RECORDED_DOCUMENT_MAX_CANONICAL_BYTES,
  RECORDED_DOCUMENT_MAX_CHILD_ROWS,
  RECORDED_DOCUMENT_MAX_NAME_LENGTH,
  SYNTHETIC_RECORDED_NOTICE,
} from "./identities.ts";
import { parseRecordedDocument, sealRecordedDocument } from "./record.ts";
import {
  RECORDED_FIXTURE_KINDS,
  syntheticRecordedDocument,
  syntheticSealedRecord,
} from "./synthetic.ts";
import { canonicalJson, sha256FingerprintOfUtf8 } from "../shared/json.ts";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

Deno.test("six synthetic records seal, parse, and match their exact byte preimages", async () => {
  assertEquals(RECORDED_FIXTURE_KINDS.length, 6);
  for (const kind of RECORDED_FIXTURE_KINDS) {
    const record = await syntheticSealedRecord(kind);
    const parsed = await parseRecordedDocument(record);
    assertEquals(parsed.doctype, record.doctype);
    assertEquals(parsed.name, record.name);
    assertEquals(parsed.modified, record.modified);
    assertEquals(parsed.observedAt, record.observedAt);
    // Independent preimage reconstruction: document bytes, then record bytes
    // minus the self fingerprint.
    const documentText = canonicalJson(
      parsed.document,
      "independent document preimage",
    );
    assertEquals(
      parsed.documentFingerprint,
      await sha256FingerprintOfUtf8(documentText),
    );
    const recordText = canonicalJson({
      schemaVersion: parsed.schemaVersion,
      doctype: parsed.doctype,
      name: parsed.name,
      modified: parsed.modified,
      observedAt: parsed.observedAt,
      sourceInstance: parsed.sourceInstance,
      document: parsed.document,
      documentFingerprint: parsed.documentFingerprint,
    }, "independent record preimage");
    assertEquals(
      parsed.fingerprint,
      await sha256FingerprintOfUtf8(recordText),
    );
    assert(
      JSON.stringify(parsed.document).includes(SYNTHETIC_RECORDED_NOTICE),
      `${kind} must stay labelled synthetic`,
    );
    assertEquals(Object.isFrozen(parsed), true);
    assertEquals(Object.isFrozen(parsed.document), true);
  }
});

Deno.test("document tampering after seal is refused on the document fingerprint", async () => {
  const record = await syntheticSealedRecord("task");
  const tampered = clone(record);
  (tampered.document as Record<string, unknown>).progress = 99;
  await assertRejects(
    () => parseRecordedDocument(tampered),
    TypeError,
    "documentFingerprint does not match",
  );
});

Deno.test("envelope and document identities must match exactly", async () => {
  const record = await syntheticSealedRecord("project");
  const renamed = clone(record) as unknown as Record<string, unknown>;
  renamed.name = "SYNTH-PROJ-9999";
  await assertRejects(
    () => parseRecordedDocument(renamed),
    TypeError,
    "document.name must match",
  );
  const shifted = clone(record);
  (shifted.document as Record<string, unknown>).modified =
    "2026-09-14 10:00:00";
  await assertRejects(
    () => parseRecordedDocument(shifted),
    TypeError,
    "document.modified must match",
  );
  const retyped = clone(record);
  (retyped.document as Record<string, unknown>).doctype = "Task";
  await assertRejects(
    () => parseRecordedDocument(retyped),
    TypeError,
    "document.doctype must match",
  );
});

Deno.test("envelope scalar tampering breaks the record fingerprint", async () => {
  const record = await syntheticSealedRecord("bom");
  for (
    const mutate of [
      (value: Record<string, unknown>) => {
        value.observedAt = "2026-09-14T09:45:00.000Z";
      },
      (value: Record<string, unknown>) => {
        (value.sourceInstance as { siteId: string }).siteId = `sha256:${
          "9".repeat(64)
        }`;
      },
      (value: Record<string, unknown>) => {
        value.documentFingerprint = `sha256:${"8".repeat(64)}`;
      },
      (value: Record<string, unknown>) => {
        value.fingerprint = `sha256:${"7".repeat(64)}`;
      },
    ]
  ) {
    const tampered = clone(record) as unknown as Record<string, unknown>;
    mutate(tampered);
    await assertRejects(
      () => parseRecordedDocument(tampered),
      TypeError,
      "does not match",
    );
  }
});

Deno.test("unknown doctype cannot enter the closed six-doctype contract", async () => {
  const document = syntheticRecordedDocument("task");
  await assertRejects(
    () =>
      sealRecordedDocument({
        schemaVersion: "io.casys.mcp-erpnext.recorded-document/1.0",
        doctype: "Sales Invoice",
        name: "SINV-001",
        modified: "2026-09-13 09:42:18",
        observedAt: "2026-09-13T09:45:00.000Z",
        sourceInstance: {
          kind: "erpnext-site",
          siteId: `sha256:${"a".repeat(64)}`,
        },
        document: { ...document, doctype: "Sales Invoice", name: "SINV-001" },
      }),
    TypeError,
    "must be one of",
  );
});

Deno.test("oversized names, child tables, strings, and payloads are refused", async () => {
  const base = await syntheticSealedRecord("timesheet");
  const longName = clone(base) as unknown as Record<string, unknown>;
  longName.name = "n".repeat(RECORDED_DOCUMENT_MAX_NAME_LENGTH + 1);
  (longName.document as Record<string, unknown>).name = longName.name;
  await assertRejects(
    () => sealRecordedDocument(stripFingerprints(longName)),
    TypeError,
    "character bound",
  );

  const manyRows = clone(base);
  (manyRows.document as Record<string, unknown>).time_logs = Array.from(
    { length: RECORDED_DOCUMENT_MAX_CHILD_ROWS + 1 },
    (_, index) => ({ name: `row-${index}`, hours: 1 }),
  );
  await assertRejects(
    () => sealRecordedDocument(stripFingerprints(manyRows)),
    TypeError,
    "entry bound",
  );

  const longString = clone(base);
  (longString.document as Record<string, unknown>).note = "x".repeat(32769);
  await assertRejects(
    () => sealRecordedDocument(stripFingerprints(longString)),
    TypeError,
    "character bound",
  );

  const deep: Record<string, unknown> = {};
  let cursor = deep;
  for (let level = 0; level < 10; level += 1) {
    const next: Record<string, unknown> = {};
    cursor.nested = next;
    cursor = next;
  }
  const deepDoc = clone(base);
  (deepDoc.document as Record<string, unknown>).deep = deep;
  await assertRejects(
    () => sealRecordedDocument(stripFingerprints(deepDoc)),
    TypeError,
    "depth bound",
  );

  const wide: Record<string, unknown> = {};
  for (let index = 0; index < 201; index += 1) {
    wide[`field_${index}`] = index;
  }
  const wideDoc = clone(base);
  (wideDoc.document as Record<string, unknown>).wide = wide;
  await assertRejects(
    () => sealRecordedDocument(stripFingerprints(wideDoc)),
    TypeError,
    "key bound",
  );

  const heavy = clone(base);
  const heavyDoc = heavy.document as Record<string, unknown>;
  for (let index = 0; index < 20; index += 1) {
    heavyDoc[`payload_${index}`] = "y".repeat(16384);
  }
  await assertRejects(
    () => sealRecordedDocument(stripFingerprints(heavy)),
    TypeError,
    `${RECORDED_DOCUMENT_MAX_CANONICAL_BYTES}-byte`,
  );
});

Deno.test("live-view metadata is refused anywhere inside the document", async () => {
  const base = await syntheticSealedRecord("work-order");
  const rootLive = clone(base);
  (rootLive.document as Record<string, unknown>)._availableTools = [
    "erpnext_task_get",
  ];
  await assertRejects(
    () => sealRecordedDocument(stripFingerprints(rootLive)),
    TypeError,
    "live-view metadata",
  );

  const nestedLive = clone(base);
  const rows = (nestedLive.document as Record<string, unknown>)
    .required_items as Record<string, unknown>[];
  rows[0].refreshRequest = { toolName: "erpnext_doc_get", arguments: {} };
  await assertRejects(
    () => sealRecordedDocument(stripFingerprints(nestedLive)),
    TypeError,
    "live-view metadata",
  );

  const hintLive = clone(base);
  (hintLive.document as Record<string, unknown>)._sendMessageHints = [];
  await assertRejects(
    () => parseRecordedDocument(hintLive),
    TypeError,
    "live-view metadata",
  );
});

Deno.test("credential, path, and command fields are refused inside the document", async () => {
  const base = await syntheticSealedRecord("job-card");
  const leaked = clone(base);
  (leaked.document as Record<string, unknown>).api_key = "secret";
  await assertRejects(
    () => sealRecordedDocument(stripFingerprints(leaked)),
    TypeError,
    "recorded-document contract",
  );
});

Deno.test("seal input must be unsealed; fingerprints are computed, never supplied", async () => {
  const record = await syntheticSealedRecord("project");
  await assertRejects(
    () => sealRecordedDocument(record),
    TypeError,
    "unsupported fields",
  );
});

function stripFingerprints<T>(record: T): Record<string, unknown> {
  const stripped = clone(record) as Record<string, unknown>;
  delete stripped.documentFingerprint;
  delete stripped.fingerprint;
  return stripped;
}
