import { assertEquals, assertNotEquals } from "@std/assert";
import {
  type ActiveContextSelection,
  reconcileActiveContextViewSelections,
} from "../../shared/active-context.ts";
import { formatInteger, setLocaleSource } from "../../shared/format.ts";
import { translatorForLocale } from "../../shared/i18n.ts";
import {
  STOCK_CONTEXT_RECONCILE_KEY,
  stockRowContextId,
  stockRowContextItem,
  stockRowDetailId,
} from "./stock-interactions.ts";
import type { StockEntry } from "./types.ts";

const ROW: StockEntry = {
  item_code: "BOLT M6",
  warehouse: "Stores - C",
  actual_qty: 12,
};

Deno.test("stock interaction - contexte compact conserve article, entrepot et quantite", () => {
  assertEquals(
    stockRowContextItem(ROW, "Stock Balance", "Actual", "12"),
    {
      id: "stock:BOLT%20M6:Stores%20-%20C",
      reconcileKey: STOCK_CONTEXT_RECONCILE_KEY,
      view: "Stock Balance",
      label: "BOLT M6",
      value: "Stores - C · Actual 12",
    },
  );
});

Deno.test("stock interaction - un meme article dans deux entrepots reste deux cibles", () => {
  const other = { ...ROW, warehouse: "Finished Goods - C" };
  assertNotEquals(stockRowContextId(ROW), stockRowContextId(other));
  assertNotEquals(stockRowDetailId(ROW), stockRowDetailId(other));
});

Deno.test("stock interaction - aria-controls pointe vers un id sans espace", () => {
  assertEquals(
    stockRowDetailId(ROW),
    "stock-row-detail-BOLT%20M6--Stores%20-%20C",
  );
  assertEquals(stockRowDetailId(ROW).includes(" "), false);
});

Deno.test("stock locale reconciliation refreshes every selected warehouse while preserving nested context", () => {
  const rows = [
    { ...ROW, actual_qty: 1234567 },
    { ...ROW, warehouse: "Finished Goods - C", actual_qty: 9876543 },
    { item_code: "UNSELECTED", warehouse: "Stores - C", actual_qty: 4567890 },
  ];
  const nested = {
    scopeKey: "stock-root",
    item: { id: "record:Item:BOLT M6", view: "Item", label: "BOLT M6" },
  };
  let locale = "fr-FR";
  setLocaleSource(() => locale);
  const candidates = () => {
    const t = translatorForLocale(locale);
    return rows.map((row) =>
      stockRowContextItem(
        row,
        t("stock.title"),
        t("stock.col.actual"),
        formatInteger(row.actual_qty),
      )
    );
  };
  try {
    let selections: ActiveContextSelection[] = [
      ...candidates().slice(0, 2).map((item) => ({
        scopeKey: "stock-root",
        item,
      })),
      nested,
    ];
    const originalIds = selections.map((selection) => selection.item.id);
    let englishValue: string | undefined;
    for (locale of ["en-US", "en-IN", "zh-TW", "ur-PK", "fr-FR"]) {
      const refreshed = candidates();
      selections = reconcileActiveContextViewSelections(
        selections,
        "stock-root",
        STOCK_CONTEXT_RECONCILE_KEY,
        refreshed,
      );
      assertEquals(
        selections.map((selection) => selection.item.id),
        originalIds,
      );
      assertEquals(
        selections.slice(0, 2).map((selection) => selection.item),
        refreshed.slice(0, 2),
      );
      assertEquals(selections[2], nested);
      if (locale === "en-US") englishValue = refreshed[0].value;
      if (locale === "en-IN") assertNotEquals(refreshed[0].value, englishValue);
    }
    selections = reconcileActiveContextViewSelections(
      selections,
      "stock-root",
      STOCK_CONTEXT_RECONCILE_KEY,
      candidates().slice(0, 1),
    );
    assertEquals(selections.map((selection) => selection.item.id), [
      originalIds[0],
      nested.item.id,
    ]);
    assertEquals(rows[0].actual_qty, 1234567);
    assertEquals(rows[1].warehouse, "Finished Goods - C");
  } finally {
    setLocaleSource(() => undefined);
  }
});
