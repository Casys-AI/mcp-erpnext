import { assertEquals, assertExists } from "@std/assert";
import { documentModelOf } from "./model.ts";
import { documentPreviewFieldsOf } from "./preview-fields.ts";

Deno.test("document preview restores the stable Sales Order's first 12 values", () => {
  const document = {
    name: "SAL-ORD-2026-00043",
    owner: "Administrator",
    creation: "2026-09-01 09:00:00",
    modified: "2026-09-02 10:00:00",
    modified_by: "Administrator",
    docstatus: 0,
    idx: 0,
    company: "Casys Industries",
    naming_series: "SAL-ORD-.YYYY.-",
    customer: "CUSTOMER-001",
    customer_name: "Example customer",
    order_type: "Sales",
    transaction_date: "2026-09-01",
    disable_rounded_total: 0,
    rounded_total: 120,
    base_grand_total: 120,
    base_rounding_adjustment: 0,
    advance_paid: 0,
    base_discount_amount: 0,
    discount_amount: 0,
    items: [{ item_code: "ITEM-001", qty: 1, rate: 120, amount: 120 }],
    doctype: "Sales Order",
  };
  const before = structuredClone(document);
  const preview = documentPreviewFieldsOf(document);
  assertEquals(preview.map((field) => field.key), [
    "name",
    "owner",
    "creation",
    "modified",
    "modified_by",
    "docstatus",
    "idx",
    "company",
    "naming_series",
    "customer",
    "customer_name",
    "order_type",
  ]);
  assertEquals(document, before);
  const fullModel = documentModelOf({ data: document });
  assertExists(fullModel);
  assertEquals(
    fullModel.fields.find((field) => field.key === "rounded_total")?.value,
    120,
  );
  assertEquals(fullModel.childTables[0].rows[0].item_code, "ITEM-001");
  assertEquals(fullModel.envelope.document, before);
});

Deno.test("document preview counts arrays and flattens one object level like stable", () => {
  const preview = documentPreviewFieldsOf({
    doctype: "Sales Order",
    _availableTools: ["erpnext_doc_get"],
    refreshRequest: { toolName: "erpnext_doc_get", arguments: {} },
    missing: null,
    absent: undefined,
    empty: "",
    zero: 0,
    enabled: false,
    items: [{ item_code: "ITEM-001", base_amount: 120 }],
    taxes: [],
    metadata: { reference: "REF-001", quantity: 2, absent: null, nested: {} },
  });
  assertEquals(preview, [
    { key: "empty", value: "" },
    { key: "zero", value: 0 },
    { key: "enabled", value: false },
    { key: "items", value: 1, arrayCount: 1 },
    { key: "taxes", value: 0, arrayCount: 0 },
    { key: "metadata.reference", value: "REF-001" },
    { key: "metadata.quantity", value: "2" },
  ]);
});

Deno.test("document preview applies its cap after flattening nested fields", () => {
  const preview = documentPreviewFieldsOf({
    header: Object.fromEntries(
      Array.from({ length: 15 }, (_, i) => [`field${i}`, i]),
    ),
    footer: "outside the stable preview",
  });
  assertEquals(preview.length, 12);
  assertEquals(preview[11], { key: "header.field11", value: "11" });
});

Deno.test("Company preview uses business identity instead of stable system metadata", () => {
  const document = {
    name: "Casys Industries",
    owner: "Administrator",
    idx: 0,
    docstatus: 0,
    modified_by: "Administrator",
    company_name: "Casys Industries",
    country: "France",
    abbr: "CASY",
    default_currency: "EUR",
    is_group: 0,
    doctype: "Company",
  };
  assertEquals(documentPreviewFieldsOf(document), [
    { key: "company_name", value: "Casys Industries" },
    { key: "abbr", value: "CASY" },
    { key: "country", value: "France" },
    { key: "default_currency", value: "EUR" },
    { key: "is_group", value: false },
  ]);
});
