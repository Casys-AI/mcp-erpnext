import { assertEquals } from "@std/assert";
import {
  childRowContextItem,
  documentChildRowsReconcileKey,
  documentContextItem,
} from "./context-items.ts";
import type { DocumentEnvelope, DocumentModel } from "./types.ts";

const envelope: DocumentEnvelope = {
  doctype: "Sales Invoice",
  name: "SINV-1",
  document: {
    doctype: "Sales Invoice",
    name: "SINV-1",
    items: [{ name: "SINV-ITEM-7", idx: 1, item_code: "ITEM-1" }],
  },
};

const model: DocumentModel = {
  envelope,
  title: "SINV-1",
  status: "Draft",
  fields: [],
  longFields: [],
  progressFields: [],
  collections: [],
  childTables: [],
  systemFields: [],
};

Deno.test("document context - keeps only a bounded business reference", () => {
  assertEquals(documentContextItem(model, "Sales Invoices"), {
    id: "record:Sales Invoice:SINV-1",
    view: "Sales Invoices",
    label: "SINV-1",
    value: "Sales Invoice · Draft",
  });
});

Deno.test("document context - child rows use a document-specific reconcile namespace", () => {
  assertEquals(
    documentChildRowsReconcileKey(envelope),
    "document-rows:Sales Invoice:SINV-1",
  );
});

Deno.test("document context - identifies an item line without serializing it", () => {
  assertEquals(
    childRowContextItem(
      envelope,
      { key: "items", label: "Items", columns: [], rows: [] },
      {
        item_code: "ITEM-1",
        item_name: "Sensor",
        qty: 2,
        warehouse: "Stores",
        amount: 450,
        description: "not copied",
      },
      0,
    ),
    {
      id: "record:Sales Invoice:SINV-1:row:items:SINV-ITEM-7",
      view: "Sales Invoice · SINV-1",
      label: "ITEM-1 · Sensor",
      value: "Qty 2 · Stores · 450",
    },
  );
});

Deno.test("document context - falls back to the visible item and row index", () => {
  const withoutRawRows = {
    ...envelope,
    document: { doctype: "Sales Invoice", name: "SINV-1" },
  };
  assertEquals(
    childRowContextItem(
      withoutRawRows,
      { key: "items", label: "Items", columns: [], rows: [] },
      { item_code: "ITEM-2" },
      2,
    )?.id,
    "record:Sales Invoice:SINV-1:row:items:ITEM-2:3",
  );
});

Deno.test("document context - a non-item child row has no item action", () => {
  assertEquals(
    childRowContextItem(
      envelope,
      { key: "taxes", label: "Taxes", columns: [], rows: [] },
      { account_head: "VAT" },
      0,
    ),
    null,
  );
});
