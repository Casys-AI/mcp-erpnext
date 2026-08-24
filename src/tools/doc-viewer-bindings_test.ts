import { assertEquals } from "@std/assert";
import type { FrappeClient } from "../api/frappe-client.ts";
import { allTools, getToolByName } from "./mod.ts";

const DOC_VIEWER_URI = "ui://mcp-erpnext/doc-viewer";
const INVOICE_VIEWER_URI = "ui://mcp-erpnext/invoice-viewer";

const DOC_VIEWER_GET_BINDINGS = [
  ["erpnext_journal_entry_get", "Journal Entry"],
  ["erpnext_payment_entry_get", "Payment Entry"],
  ["erpnext_asset_get", "Asset"],
  ["erpnext_asset_movement_get", "Asset Movement"],
  ["erpnext_asset_maintenance_get", "Asset Maintenance"],
  ["erpnext_lead_get", "Lead"],
  ["erpnext_opportunity_get", "Opportunity"],
  ["erpnext_contact_get", "Contact"],
  ["erpnext_delivery_note_get", "Delivery Note"],
  ["erpnext_shipment_get", "Shipment"],
  ["erpnext_employee_get", "Employee"],
  ["erpnext_leave_application_get", "Leave Application"],
  ["erpnext_salary_slip_get", "Salary Slip"],
  ["erpnext_item_get", "Item"],
  ["erpnext_stock_entry_get", "Stock Entry"],
  ["erpnext_bom_get", "BOM"],
  ["erpnext_work_order_get", "Work Order"],
  ["erpnext_job_card_get", "Job Card"],
  ["erpnext_project_get", "Project"],
  ["erpnext_task_get", "Task"],
  ["erpnext_timesheet_get", "Timesheet"],
  ["erpnext_supplier_get", "Supplier"],
  ["erpnext_purchase_order_get", "Purchase Order"],
  ["erpnext_purchase_invoice_get", "Purchase Invoice"],
  ["erpnext_purchase_receipt_get", "Purchase Receipt"],
  ["erpnext_customer_get", "Customer"],
] as const;

const SPECIALIZED_GET_BINDINGS = [
  "erpnext_sales_order_get",
  "erpnext_sales_invoice_get",
  "erpnext_quotation_get",
] as const;

Deno.test("document get tools have an exhaustive viewer binding matrix", () => {
  const fixedGetNames = allTools
    .filter((tool) =>
      tool.name.endsWith("_get") && tool.name !== "erpnext_doc_get"
    )
    .map((tool) => tool.name)
    .sort();
  const expectedNames = [
    ...DOC_VIEWER_GET_BINDINGS.map(([name]) => name),
    ...SPECIALIZED_GET_BINDINGS,
  ].sort();

  assertEquals(fixedGetNames, expectedNames);

  for (const [name] of DOC_VIEWER_GET_BINDINGS) {
    assertEquals(
      getToolByName(name)?._meta?.ui?.resourceUri,
      DOC_VIEWER_URI,
      `${name} should use doc-viewer`,
    );
  }
  for (const name of SPECIALIZED_GET_BINDINGS) {
    assertEquals(
      getToolByName(name)?._meta?.ui?.resourceUri,
      INVOICE_VIEWER_URI,
      `${name} should keep invoice-viewer`,
    );
  }
});

Deno.test("doc-viewer get results expose exact DocType and preserve canonical name", async () => {
  const canonicalName = "CANONICAL-001";
  const client = {
    get: async () => ({
      name: canonicalName,
      doctype: "Incorrect upstream DocType",
    }),
  } as unknown as FrappeClient;

  for (const [name, doctype] of DOC_VIEWER_GET_BINDINGS) {
    const tool = getToolByName(name);
    if (!tool) throw new Error(`Missing tool ${name}`);

    const result = await tool.handler(
      { name: "human-readable-or-requested-name" },
      { client },
    ) as { data: Record<string, unknown> };

    assertEquals(result.data.name, canonicalName, `${name} canonical name`);
    assertEquals(result.data.doctype, doctype, `${name} explicit DocType`);
  }
});
