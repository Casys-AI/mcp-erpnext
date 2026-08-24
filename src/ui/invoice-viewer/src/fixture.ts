import type { InvoicePayload, ItemRecord, StockRow } from "./types.ts";

/** Mock payload so the bundled HTML can be opened without a host. */
export const INVOICE_FIXTURE: InvoicePayload = {
  _availableTools: [
    "erpnext_doc_submit",
    "erpnext_doc_cancel",
    "erpnext_item_get",
    "erpnext_stock_balance",
  ],
  data: {
    doctype: "Sales Invoice",
    name: "ACC-SINV-2026-00042",
    customer: "CUST-ACME",
    customer_name: "Acme Corp",
    company: "Casys",
    posting_date: "2026-08-01",
    due_date: "2026-08-31",
    status: "Unpaid",
    docstatus: 1,
    grand_total: 2160,
    net_total: 1800,
    total_taxes_and_charges: 360,
    outstanding_amount: 2160,
    currency: "EUR",
    contact_email: "billing@acme.test",
    items: [
      {
        item_code: "ITEM-LAPTOP",
        item_name: "Laptop Pro 14",
        qty: 2,
        rate: 800,
        amount: 1600,
      },
      {
        item_code: "ITEM-MOUSE",
        item_name: "Wireless Mouse",
        qty: 2,
        rate: 100,
        amount: 200,
      },
    ],
  },
  refreshRequest: {
    toolName: "erpnext_sales_invoice_get",
    arguments: { name: "ACC-SINV-2026-00042" },
  },
  /**
   * Copie de INVOICE_HINTS["Sales Invoice"] (src/tools/ui-refresh.ts).
   * Sert à valider la mise en page de la PathBar et des boutons › en mode fixture.
   * En mode fixture, jumpsEnabled = false donc les sauts sont désactivés —
   * les boutons restent disabled et n'affichent pas le chevron.
   */
  _sendMessageHints: [
    {
      key: "payments",
      label: "Payments",
      message: "Show payment entries for invoice {id}",
      tool: "erpnext_doc_list",
      args: {
        doctype: "Payment Entry",
        fields: [
          "name",
          "posting_date",
          "paid_amount",
          "mode_of_payment",
          "docstatus",
          {
            key: "item",
            label: "Item",
            message: "Show item {item}",
            tool: "erpnext_item_get",
            args: { name: "{item}" },
            kind: "record",
          },
          {
            key: "stock",
            label: "Stock",
            message: "Show stock balance for item {item}",
            tool: "erpnext_stock_balance",
            args: { item_code: "{item}", limit: 50 },
            kind: "list",
          },
        ],
        filters: [["Payment Entry Reference", "reference_name", "=", "{id}"]],
        limit: 20,
      },
      kind: "list",
    },
    {
      key: "customer",
      label: "Customer",
      message: "Show customer {party}",
      tool: "erpnext_customer_get",
      args: { name: "{party}" },
      kind: "record",
    },
  ],
};

export const ITEM_FIXTURES: Record<string, {
  item: ItemRecord;
  stock: StockRow[];
}> = {
  "ITEM-LAPTOP": {
    item: {
      name: "ITEM-LAPTOP",
      item_name: "Laptop Pro 14",
      item_group: "Products",
      stock_uom: "Nos",
      standard_rate: 800,
    },
    stock: [
      { warehouse: "Stores - CI", actual_qty: 12 },
      { warehouse: "Finished Goods - CI", actual_qty: 3 },
    ],
  },
  "ITEM-MOUSE": {
    item: {
      name: "ITEM-MOUSE",
      item_name: "Wireless Mouse",
      item_group: "Products",
      stock_uom: "Nos",
      standard_rate: 100,
    },
    stock: [
      { warehouse: "Stores - CI", actual_qty: 48 },
      { warehouse: "Finished Goods - CI", actual_qty: 0 },
    ],
  },
};

export function isFixtureMode(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(globalThis.location.search).has("fixture");
}
