import type { InvoicePayload, ItemRecord, StockRow } from "./types.ts";

/** Mock payload so the bundled HTML can be opened without a host. */
export const INVOICE_FIXTURE: InvoicePayload = {
  data: {
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
