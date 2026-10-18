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

Deno.test("document context - sans mise en page, conserve seulement la référence", () => {
  assertEquals(documentContextItem(model, "Sales Invoices"), {
    id: "record:Sales Invoice:SINV-1",
    view: "Sales Invoices",
    label: "SINV-1",
    value: "Sales Invoice · Draft",
    fieldsSource: "record",
  });
});

Deno.test("document context - respecte l'aperçu ERPNext et ses libellés, sans sérialiser les objets", () => {
  const withLayout: DocumentModel = {
    ...model,
    envelope: {
      ...envelope,
      document: {
        ...envelope.document,
        amount: 0,
        customer: "ACME",
        paid: false,
        empty: " ",
        metadata: { private: true },
        modified: "2026-10-18 09:30:00.000000",
      },
      fieldLayout: {
        preview: ["customer", "amount", "paid", "empty", "metadata", "items"],
        sections: [],
        labels: { customer: "Client", amount: "Montant", paid: "Réglé" },
      },
    },
  };
  assertEquals(documentContextItem(withLayout, "Factures"), {
    id: "record:Sales Invoice:SINV-1",
    view: "Factures",
    label: "SINV-1",
    value: "Sales Invoice · Draft",
    fields: [
      { label: "Client", value: "ACME" },
      { label: "Montant", value: "0" },
      { label: "Réglé", value: "false" },
    ],
    fieldsSource: "record",
    modified: "2026-10-18 09:30:00.000000",
  });
});

Deno.test("document context - garde les huit premiers champs disponibles dans l'ordre d'aperçu", () => {
  const keys = Array.from({ length: 10 }, (_, index) => `field_${index}`);
  const withLayout: DocumentModel = {
    ...model,
    envelope: {
      ...envelope,
      document: {
        ...envelope.document,
        ...Object.fromEntries(keys.map((key) => [key, key])),
      },
      fieldLayout: { preview: keys, sections: [], labels: {} },
    },
  };
  const result = documentContextItem(withLayout, "Factures");
  assertEquals(
    result.fields,
    keys.slice(0, 8).map((key, index) => ({
      label: `Field ${index}`,
      value: key,
    })),
  );
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
      fields: [
        { label: "Item code", value: "ITEM-1" },
        { label: "Item name", value: "Sensor" },
        { label: "Qty", value: "2" },
        { label: "Warehouse", value: "Stores" },
        { label: "Amount", value: "450" },
      ],
      fieldsSource: "row",
    },
  );
});

Deno.test("document context - une ligne garde son identité exacte et la fraîcheur du document", () => {
  const modified = "2026-10-18 12:00:00.000000";
  assertEquals(
    childRowContextItem(
      {
        ...envelope,
        document: {
          ...envelope.document,
          modified,
          items: [{ name: "  exact row  " }],
        },
      },
      {
        key: "items",
        label: "Items",
        columns: [{ key: "qty", label: "Quantité", numeric: true }],
        rows: [],
      },
      { item_code: "ITEM-1", qty: 0 },
      0,
    ),
    {
      id: "record:Sales Invoice:SINV-1:row:items:  exact row  ",
      view: "Sales Invoice · SINV-1",
      label: "ITEM-1",
      value: "Qty 0",
      fields: [
        { label: "Item code", value: "ITEM-1" },
        { label: "Quantité", value: "0" },
      ],
      fieldsSource: "row",
      modified,
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
