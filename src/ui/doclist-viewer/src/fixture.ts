import type { DoclistData } from "~/shared/doclist/types";

const STATUSES = [
  { status: "Draft", docstatus: 0 },
  { status: "Unpaid", docstatus: 1 },
  { status: "Paid", docstatus: 1 },
  { status: "Overdue", docstatus: 1 },
  { status: "Partly Paid", docstatus: 1 },
  { status: "Cancelled", docstatus: 2 },
] as const;

const CUSTOMERS = ["Acme Corp", "Globex", "Initech", "Umbrella"];
const COMPANIES = ["Casys SAS", "Casys GmbH"];

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

function makeRow(index: number): Record<string, unknown> {
  const scheme = STATUSES[index % STATUSES.length];
  const name = `ACC-SINV-2026-${pad(index + 1, 5)}`;
  const customer = CUSTOMERS[index % CUSTOMERS.length];
  const company = COMPANIES[index % COMPANIES.length];
  const grandTotal = 1200 + index * 175;
  const outstanding = scheme.status === "Paid" || scheme.status === "Cancelled"
    ? 0
    : scheme.status === "Partly Paid"
    ? grandTotal / 2
    : grandTotal;
  const row = {
    name,
    customer,
    posting_date: `2026-08-${pad((index % 28) + 1, 2)}`,
    due_date: `2026-09-${pad((index % 28) + 1, 2)}`,
    status: scheme.status,
    grand_total: grandTotal,
    outstanding_amount: outstanding,
    company,
  };
  return {
    ...row,
    _detail: {
      ...row,
      docstatus: scheme.docstatus,
      currency: "EUR",
      items: [{ item_code: "ITEM-001", qty: 1, amount: grandTotal }],
    },
  };
}

const rows = Array.from({ length: 24 }, (_, index) => makeRow(index));

/** Mock payload so the bundled HTML can be opened without a host. */
export const DOCLIST_FIXTURE: DoclistData = {
  doctype: "Sales Invoice",
  _title: "Sales Invoices",
  count: rows.length,
  refreshRequest: {
    toolName: "erpnext_sales_invoice_list",
    arguments: { limit: 20 },
  },
  _rowAction: {
    toolName: "erpnext_sales_invoice_get",
    idField: "name",
    argName: "name",
  },
  _sendMessageHints: [
    { label: "Payments", message: "Show payment entries for invoice {id}" },
  ],
  data: rows,
};

export function isFixtureMode(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(globalThis.location.search).has("fixture");
}
