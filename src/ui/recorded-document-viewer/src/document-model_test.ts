import { assertEquals } from "@std/assert";
import { recordedViewDataToDocumentModel } from "./document-model.ts";
import {
  RECORDED_FIXTURE_KINDS,
  syntheticAvailableRecordedSession,
  syntheticSealedRecord,
} from "../../../recorded-document/synthetic.ts";
import { displayStateFromViewerSession } from "./model.ts";

Deno.test("document model builds a passive envelope without live slots or local totals", async () => {
  for (const kind of RECORDED_FIXTURE_KINDS) {
    const record = await syntheticSealedRecord(kind);
    const state = await displayStateFromViewerSession(
      await syntheticAvailableRecordedSession(record),
    );
    if (state.kind !== "result") throw new Error(`expected ${kind} result`);
    const model = recordedViewDataToDocumentModel(state.data);
    assertEquals(model.envelope.doctype, record.doctype);
    assertEquals(model.envelope.name, record.name);
    assertEquals(model.envelope.document, record.document);
    assertEquals(model.envelope.availableTools, undefined);
    assertEquals(model.envelope.refreshRequest, undefined);
    assertEquals(model.envelope.sendMessageHints, undefined);
    assertEquals(
      model.childTables.some((table) => table.total !== undefined),
      false,
      `${kind} must not carry a locally summed total`,
    );
  }
});

Deno.test("recorded timesheet keeps its ERP docstatus and child rows verbatim", async () => {
  const record = await syntheticSealedRecord("timesheet");
  const model = recordedViewDataToDocumentModel({ record });
  assertEquals(model.docstatus, 0);
  assertEquals(model.status, "Draft");
  const logs = model.childTables.find((table) => table.key === "time_logs");
  assertEquals(logs?.rows.length, 2);
  assertEquals(logs?.rows[0].hours, 8);
});

Deno.test("link, HTML, and image strings stay inert verbatim values", async () => {
  const record = await syntheticSealedRecord("task", {
    description:
      'See https://example.invalid/synth-plan and <b>bold</b> <img src="https://example.invalid/x.png">.',
  });
  const model = recordedViewDataToDocumentModel({ record });
  const description = model.longFields.find((field) =>
    field.key === "description"
  );
  assertEquals(
    description?.value,
    'See https://example.invalid/synth-plan and <b>bold</b> <img src="https://example.invalid/x.png">.',
  );
});
