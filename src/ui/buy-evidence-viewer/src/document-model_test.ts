import { assertEquals } from "@std/assert";
import { buyResultToDocumentModel } from "./document-model.ts";
import { sealBuySourceCapture } from "../../../buy/capture.ts";
import {
  syntheticCapture,
  syntheticCompleteResult,
  syntheticPartialResult,
} from "../../../buy/synthetic.ts";
import { setLangSource, t } from "../../shared/i18n.ts";

Deno.test("document model copies sealed totals and never invents refresh or tools", async () => {
  setLangSource(() => "en");
  const capture = await sealBuySourceCapture(await syntheticCapture());
  const result = await syntheticCompleteResult(
    capture.fingerprint,
    capture.capture.sourceInstance.siteId,
  );
  const model = buyResultToDocumentModel(result);
  assertEquals(model.status, "complete");
  assertEquals(model.envelope.availableTools, undefined);
  assertEquals(model.envelope.refreshRequest, undefined);
  assertEquals(
    model.fields.some((field) => field.key === "complete-total"),
    true,
  );
  assertEquals(
    model.fields.some((field) => field.key === "covered-subtotal"),
    true,
  );
  assertEquals(
    model.childTables.some((table) => table.total !== undefined),
    false,
  );
  const lines = model.childTables.find((table) =>
    table.key === "selected-lines"
  );
  assertEquals(
    lines?.rows[0].sourceName,
    result.lines[0].source.kind === "erpnext-document"
      ? result.lines[0].source.name
      : null,
  );
  assertEquals(lines?.columns[0].label, t("buy.col.item"));
  assertEquals(lines?.columns[1].label, t("buy.col.source"));
  assertEquals(
    model.longFields.some((field) =>
      field.label === "Description" &&
      String(field.value).includes("synthetic test input")
    ),
    true,
  );
  assertEquals(
    model.fields.some((field) =>
      field.label === "Price date" && field.value === result.lines[0].priceDate
    ),
    true,
  );
  for (const table of model.childTables) {
    for (const column of table.columns) {
      assertEquals(/[a-z][A-Z]/.test(column.label), false);
    }
  }
});

Deno.test("Buy document labels follow the active EN/FR/ZH catalogs", async () => {
  const capture = await sealBuySourceCapture(await syntheticCapture());
  const result = await syntheticCompleteResult(
    capture.fingerprint,
    capture.capture.sourceInstance.siteId,
  );
  try {
    setLangSource(() => "en");
    const english = buyResultToDocumentModel(result);
    assertEquals(english.title, t("buy.title"));
    assertEquals(english.fields[0].label, t("buy.field.coverage"));
    setLangSource(() => "fr");
    const french = buyResultToDocumentModel(result);
    assertEquals(french.title, t("buy.title"));
    assertEquals(french.fields[0].label, t("buy.field.coverage"));
    assertEquals(french.title === english.title, false);
    assertEquals(french.fields[0].label === english.fields[0].label, false);
    setLangSource(() => "zh");
    const chinese = buyResultToDocumentModel(result);
    assertEquals(chinese.title, t("buy.title"));
    assertEquals(chinese.title === english.title, false);
  } finally {
    setLangSource(() => undefined);
  }
});

Deno.test("partial sealed result stays partial on the document model", async () => {
  const capture = await sealBuySourceCapture(await syntheticCapture());
  const result = await syntheticPartialResult(
    capture.fingerprint,
    capture.capture.sourceInstance.siteId,
  );
  const model = buyResultToDocumentModel(result);
  assertEquals(model.status, "partial");
  assertEquals(
    model.fields.some((field) => field.key === "complete-total"),
    false,
  );
  assertEquals(
    model.childTables.find((table) => table.key === "gaps")?.rows[0].code,
    "documentary",
  );
});
