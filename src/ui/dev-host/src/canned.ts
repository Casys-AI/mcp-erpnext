/**
 * Réponses d'outils pour l'hôte de démonstration.
 *
 * Même forme que le serveur : un bloc texte JSON. Les listes portent
 * `{ doctype, count, data }`, les lectures `{ data }`. Rien ici n'est lu
 * par le code de production : c'est le décor d'un banc d'essai.
 */

import {
  INVOICE_FIXTURE,
  ITEM_FIXTURES,
} from "~/invoice-viewer/src/fixture.ts";
import { DOCLIST_FIXTURE } from "~/doclist-viewer/src/fixture.ts";
import {
  KANBAN_FIXTURE,
  KANBAN_FIXTURE_DETAILS,
  KANBAN_FIXTURE_USERS,
} from "~/kanban-viewer/src/fixture.ts";
import { STOCK_FIXTURE } from "~/stock-viewer/src/fixture.ts";

export type ViewerKey = "invoice" | "doclist" | "kanban" | "stock";

type Row = Record<string, unknown>;
const list = (doctype: string, data: Row[]) => ({
  doctype,
  count: data.length,
  data,
});

const PAYMENTS: Row[] = [
  {
    name: "ACC-PAY-2026-00118",
    posting_date: "2026-08-04",
    paid_amount: 1200,
    mode_of_payment: "Virement",
    docstatus: 1,
  },
  {
    name: "ACC-PAY-2026-00131",
    posting_date: "2026-08-12",
    paid_amount: 600,
    mode_of_payment: "Carte",
    docstatus: 1,
  },
  {
    name: "ACC-PAY-2026-00140",
    posting_date: "2026-08-19",
    paid_amount: 360,
    mode_of_payment: "Virement",
    docstatus: 0,
  },
];
const SALES_INVOICES: Row[] = [
  {
    name: "ACC-SINV-2026-00042",
    posting_date: "2026-08-01",
    status: "Unpaid",
    grand_total: 2160,
  },
  {
    name: "ACC-SINV-2026-00037",
    posting_date: "2026-07-18",
    status: "Paid",
    grand_total: 4870.5,
  },
  {
    name: "ACC-SINV-2026-00029",
    posting_date: "2026-06-30",
    status: "Paid",
    grand_total: 1325,
  },
  {
    name: "ACC-SINV-2026-00011",
    posting_date: "2026-05-02",
    status: "Cancelled",
    grand_total: 980,
  },
];
const STOCK_ENTRIES: Row[] = [
  {
    name: "MAT-STE-2026-00210",
    stock_entry_type: "Material Receipt",
    posting_date: "2026-08-15",
    docstatus: 1,
  },
  {
    name: "MAT-STE-2026-00198",
    stock_entry_type: "Material Transfer",
    posting_date: "2026-08-09",
    docstatus: 1,
  },
  {
    name: "MAT-STE-2026-00171",
    stock_entry_type: "Material Issue",
    posting_date: "2026-07-28",
    docstatus: 1,
  },
];
const TIMESHEETS: Row[] = [
  {
    name: "TS-2026-00077",
    employee: "HR-EMP-00004",
    start_date: "2026-08-18",
    total_hours: 6.5,
    status: "Submitted",
  },
  {
    name: "TS-2026-00081",
    employee: "HR-EMP-00009",
    start_date: "2026-08-20",
    total_hours: 3,
    status: "Draft",
  },
];
const STOCK_BALANCE: Row[] = [
  {
    item_code: "ITEM-LAPTOP",
    warehouse: "Stores - CS",
    actual_qty: 14,
    reserved_qty: 2,
    projected_qty: 12,
  },
  {
    item_code: "ITEM-LAPTOP",
    warehouse: "Finished Goods - CS",
    actual_qty: 5,
    reserved_qty: 0,
    projected_qty: 5,
  },
];

/** Le résultat initial que l'hôte pousse à l'ouverture de chaque vue. */
export function initialResult(viewer: ViewerKey): unknown {
  switch (viewer) {
    case "invoice":
      return INVOICE_FIXTURE;
    case "doclist":
      return {
        ...DOCLIST_FIXTURE,
        // Le hint tel que le serveur l'attache désormais : outil + arguments.
        _sendMessageHints: [{
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
            ],
            filters: [[
              "Payment Entry Reference",
              "reference_name",
              "=",
              "{id}",
            ]],
            limit: 20,
          },
        }],
      };
    case "kanban":
      return KANBAN_FIXTURE;
    case "stock":
      return STOCK_FIXTURE;
  }
}

/** L'outil dont le résultat initial « vient », pour répondre aux rafraîchissements. */
export const INITIAL_TOOL: Record<ViewerKey, string> = {
  invoice: "erpnext_sales_invoice_get",
  doclist: "erpnext_sales_invoice_list",
  kanban: "erpnext_kanban_get_board",
  stock: "erpnext_stock_balance",
};

/** La réponse canned d'un `tools/call`, ou null si l'outil n'est pas simulé. */
export function cannedResult(
  viewer: ViewerKey,
  name: string,
  args: Record<string, unknown>,
): unknown | null {
  if (name === INITIAL_TOOL[viewer]) return initialResult(viewer);
  switch (name) {
    case "erpnext_doc_list": {
      const doctype = String(args.doctype ?? "");
      if (doctype === "Payment Entry") return list(doctype, PAYMENTS);
      if (doctype === "Stock Entry") return list(doctype, STOCK_ENTRIES);
      if (doctype === "Timesheet") return list(doctype, TIMESHEETS);
      if (doctype === "Quotation") {
        return list(doctype, [{
          name: "SAL-QTN-2026-00015",
          party_name: "Acme Corp",
          transaction_date: "2026-08-10",
          status: "Open",
          grand_total: 7200,
        }]);
      }
      if (doctype === "Task") {
        return list(doctype, [{
          name: "TASK-2026-00088",
          subject: "Rappeler le client",
          status: "Open",
          priority: "High",
        }]);
      }
      return list(doctype, [{ name: `${doctype}-001`, status: "Open" }, {
        name: `${doctype}-002`,
        status: "Closed",
      }]);
    }
    case "erpnext_sales_invoice_list":
    case "erpnext_purchase_invoice_list":
      return list(
        name.includes("sales") ? "Sales Invoice" : "Purchase Invoice",
        SALES_INVOICES,
      );
    case "erpnext_stock_entry_list":
      return list("Stock Entry", STOCK_ENTRIES);
    case "erpnext_stock_balance":
      return { count: STOCK_BALANCE.length, data: STOCK_BALANCE };
    case "erpnext_item_get":
      return {
        data: ITEM_FIXTURES[String(args.name)] ??
          {
            item_code: args.name,
            item_name: "Article inconnu",
            item_group: "—",
            stock_uom: "Nos",
            standard_rate: 0,
            is_stock_item: true,
          },
      };
    case "erpnext_doc_get": {
      const detail = KANBAN_FIXTURE_DETAILS[String(args.name)];
      return { data: detail ?? { name: args.name, doctype: args.doctype } };
    }
    case "erpnext_user_list":
      return { count: KANBAN_FIXTURE_USERS.length, data: KANBAN_FIXTURE_USERS };
  }
  // Lectures de détail kanban : erpnext_task_get, erpnext_issue_get…
  if (/^erpnext_[a-z_]+_get$/.test(name) && typeof args.name === "string") {
    const detail = KANBAN_FIXTURE_DETAILS[args.name];
    if (detail) return { data: detail };
  }
  return null;
}
