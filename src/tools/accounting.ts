/**
 * ERPNext Accounting Tools
 *
 * MCP tools for accounting: accounts, journal entries, payment entries,
 * purchase orders, purchase invoices.
 *
 * @module lib/erpnext/tools/accounting
 */

import type { FrappeFilter } from "../api/types.ts";
import type { ErpNextTool } from "./types.ts";

export const accountingTools: ErpNextTool[] = [
  // ── Chart of Accounts ─────────────────────────────────────────────────────

  {
    name: "erpnext_account_list",
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
    description:
      "List Chart of Accounts. Filterable by root_type and is_group. " +
      "Fields: name, account_name, account_type, root_type, parent_account, is_group. " +
      "root_type values: Asset, Liability, Income, Expense, Equity.",
    category: "accounting",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default 50)" },
        root_type: {
          type: "string",
          description: "Filter by root type: Asset, Liability, Income, Expense, Equity",
          enum: ["Asset", "Liability", "Income", "Expense", "Equity"],
        },
        is_group: { type: "boolean", description: "Filter by group accounts only" },
        company: { type: "string", description: "Filter by company" },
      },
    },
    handler: async (input, ctx) => {
      const limit = (input.limit as number) ?? 50;
      const filters: FrappeFilter[] = [];
      if (input.root_type) {
        filters.push(["root_type", "=", input.root_type as string]);
      }
      if (input.is_group !== undefined) {
        filters.push(["is_group", "=", (input.is_group as boolean) ? 1 : 0]);
      }
      if (input.company) {
        filters.push(["company", "=", input.company as string]);
      }

      const docs = await ctx.client.list("Account", {
        fields: ["name", "account_name", "account_type", "root_type", "parent_account", "is_group"],
        filters,
        limit,
        order_by: "name asc",
      });

      return {
        doctype: "Account",
        count: docs.length,
        data: docs,
        _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
      };
    },
  },

  // ── Journal Entries ───────────────────────────────────────────────────────

  {
    name: "erpnext_journal_entry_list",
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
    description:
      "List Journal Entries. Filterable by date range and voucher_type. " +
      "Fields: name, voucher_type, posting_date, total_debit, total_credit, remark.",
    category: "accounting",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default 20)" },
        voucher_type: {
          type: "string",
          description: "Filter by voucher type (Journal Entry, Bank Entry, Cash Entry, etc.)",
        },
        date_from: { type: "string", description: "Start date filter YYYY-MM-DD" },
        date_to: { type: "string", description: "End date filter YYYY-MM-DD" },
      },
    },
    handler: async (input, ctx) => {
      const limit = (input.limit as number) ?? 20;
      const filters: FrappeFilter[] = [];
      if (input.voucher_type) {
        filters.push(["voucher_type", "=", input.voucher_type as string]);
      }
      if (input.date_from) {
        filters.push(["posting_date", ">=", input.date_from as string]);
      }
      if (input.date_to) {
        filters.push(["posting_date", "<=", input.date_to as string]);
      }

      const docs = await ctx.client.list("Journal Entry", {
        fields: ["name", "voucher_type", "posting_date", "total_debit", "total_credit", "remark"],
        filters,
        limit,
        order_by: "modified desc",
      });

      return {
        doctype: "Journal Entry",
        count: docs.length,
        data: docs,
        _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
      };
    },
  },

  {
    name: "erpnext_journal_entry_get",
    description:
      "Get a single Journal Entry by name (e.g. JV-00001). Returns full document with accounts.",
    category: "accounting",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Journal Entry name (e.g. JV-00001)" },
      },
      required: ["name"],
    },
    handler: async (input, ctx) => {
      if (!input.name) {
        throw new Error("[erpnext_journal_entry_get] 'name' is required");
      }
      const doc = await ctx.client.get("Journal Entry", input.name as string);
      return { data: doc };
    },
  },

  // ── Payment Entries ───────────────────────────────────────────────────────

  {
    name: "erpnext_payment_entry_list",
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
    description:
      "List Payment Entries. Filterable by payment_type, party_type, date range. " +
      "Fields: name, payment_type, party_type, party, posting_date, paid_amount, currency. " +
      "payment_type values: Receive, Pay, Internal Transfer.",
    category: "accounting",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default 20)" },
        payment_type: {
          type: "string",
          description: "Filter by payment type: Receive, Pay, Internal Transfer",
          enum: ["Receive", "Pay", "Internal Transfer"],
        },
        party_type: {
          type: "string",
          description: "Filter by party type (Customer, Supplier, Employee)",
        },
        party: { type: "string", description: "Filter by party name" },
        date_from: { type: "string", description: "Start date filter YYYY-MM-DD" },
      },
    },
    handler: async (input, ctx) => {
      const limit = (input.limit as number) ?? 20;
      const filters: FrappeFilter[] = [];
      if (input.payment_type) {
        filters.push(["payment_type", "=", input.payment_type as string]);
      }
      if (input.party_type) {
        filters.push(["party_type", "=", input.party_type as string]);
      }
      if (input.party) {
        filters.push(["party", "=", input.party as string]);
      }
      if (input.date_from) {
        filters.push(["posting_date", ">=", input.date_from as string]);
      }

      const docs = await ctx.client.list("Payment Entry", {
        fields: [
          "name",
          "payment_type",
          "party_type",
          "party",
          "posting_date",
          "paid_amount",
          "currency",
        ],
        filters,
        limit,
        order_by: "modified desc",
      });

      return {
        doctype: "Payment Entry",
        count: docs.length,
        data: docs,
        _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
      };
    },
  },

  {
    name: "erpnext_payment_entry_get",
    description:
      "Get a single Payment Entry by name (e.g. PE-00001). Returns full document including references.",
    category: "accounting",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Payment Entry name (e.g. PE-00001)" },
      },
      required: ["name"],
    },
    handler: async (input, ctx) => {
      if (!input.name) {
        throw new Error("[erpnext_payment_entry_get] 'name' is required");
      }
      const doc = await ctx.client.get("Payment Entry", input.name as string);
      return { data: doc };
    },
  },

  {
    name: "erpnext_journal_entry_create",
    description:
      "Create a new Journal Entry. Requires voucher_type and accounts with debit/credit amounts. " +
      "Total debits must equal total credits.",
    category: "accounting",
    inputSchema: {
      type: "object",
      properties: {
        voucher_type: {
          type: "string",
          description:
            "Journal entry type (Journal Entry, Bank Entry, Cash Entry, Credit Card Entry, etc.)",
        },
        accounts: {
          type: "array",
          description:
            "Account entries: [{account, debit_in_account_currency, credit_in_account_currency}]",
          items: {
            type: "object",
            properties: {
              account: { type: "string", description: "Account name" },
              debit_in_account_currency: {
                type: "number",
                description: "Debit amount (0 if credit)",
              },
              credit_in_account_currency: {
                type: "number",
                description: "Credit amount (0 if debit)",
              },
            },
            required: ["account"],
          },
        },
        posting_date: {
          type: "string",
          description: "Posting date YYYY-MM-DD (default: today)",
        },
        remark: { type: "string", description: "Narration / remark" },
      },
      required: ["voucher_type", "accounts"],
    },
    handler: async (input, ctx) => {
      if (!input.voucher_type) {
        throw new Error("[erpnext_journal_entry_create] 'voucher_type' is required");
      }
      if (!input.accounts || !Array.isArray(input.accounts) || input.accounts.length === 0) {
        throw new Error("[erpnext_journal_entry_create] 'accounts' must be a non-empty array");
      }

      const data: Record<string, unknown> = {
        voucher_type: input.voucher_type as string,
        accounts: input.accounts,
      };
      if (input.posting_date) data.posting_date = input.posting_date as string;
      if (input.remark) data.remark = input.remark as string;

      const doc = await ctx.client.create("Journal Entry", data);
      return {
        data: doc,
        message: `Journal Entry ${doc.name} created successfully`,
      };
    },
  },
];
