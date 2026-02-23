/**
 * ERPNext Purchasing Tools
 *
 * MCP tools for purchasing operations: suppliers, purchase orders,
 * purchase invoices, purchase receipts.
 *
 * @module lib/erpnext/tools/purchasing
 */

import type { FrappeFilter } from "../api/types.ts";
import type { ErpNextTool } from "./types.ts";

export const purchasingTools: ErpNextTool[] = [
  // ── Suppliers ─────────────────────────────────────────────────────────────

  {
    name: "erpnext_supplier_list",
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
    description:
      "List ERPNext suppliers. Returns active suppliers by default. " +
      "Fields: name, supplier_name, supplier_group, supplier_type, email_id, disabled.",
    category: "purchasing",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default 20)" },
        supplier_group: { type: "string", description: "Filter by supplier group" },
        supplier_type: {
          type: "string",
          description: "Filter by supplier type (Company, Individual)",
        },
        include_disabled: {
          type: "boolean",
          description: "Include disabled suppliers (default false)",
        },
      },
    },
    handler: async (input, ctx) => {
      const limit = (input.limit as number) ?? 20;
      const filters: FrappeFilter[] = [];
      if (!(input.include_disabled as boolean)) {
        filters.push(["disabled", "=", 0]);
      }
      if (input.supplier_group) {
        filters.push(["supplier_group", "=", input.supplier_group as string]);
      }
      if (input.supplier_type) {
        filters.push(["supplier_type", "=", input.supplier_type as string]);
      }

      const docs = await ctx.client.list("Supplier", {
        fields: [
          "name",
          "supplier_name",
          "supplier_group",
          "supplier_type",
          "email_id",
          "disabled",
        ],
        filters,
        limit,
        order_by: "modified desc",
      });

      return {
        doctype: "Supplier",
        count: docs.length,
        data: docs,
        _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
      };
    },
  },

  {
    name: "erpnext_supplier_get",
    description:
      "Get a single ERPNext supplier by name (ID). Returns all fields including contact details.",
    category: "purchasing",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Supplier name (ID)" },
      },
      required: ["name"],
    },
    handler: async (input, ctx) => {
      if (!input.name) {
        throw new Error("[erpnext_supplier_get] 'name' is required");
      }
      const doc = await ctx.client.get("Supplier", input.name as string);
      return { data: doc };
    },
  },

  {
    name: "erpnext_supplier_create",
    description:
      "Create a new ERPNext Supplier. Requires supplier_name and supplier_group. " +
      "Returns the created supplier document.",
    category: "purchasing",
    inputSchema: {
      type: "object",
      properties: {
        supplier_name: { type: "string", description: "Supplier company or person name" },
        supplier_group: { type: "string", description: "Supplier Group (e.g. 'Hardware', 'Services')" },
        supplier_type: {
          type: "string",
          description: "Company or Individual (default Company)",
        },
        country: { type: "string", description: "Country name" },
        default_currency: { type: "string", description: "Currency code (e.g. EUR, USD)" },
      },
      required: ["supplier_name", "supplier_group"],
    },
    handler: async (input, ctx) => {
      if (!input.supplier_name) {
        throw new Error("[erpnext_supplier_create] 'supplier_name' is required");
      }
      if (!input.supplier_group) {
        throw new Error("[erpnext_supplier_create] 'supplier_group' is required");
      }

      const data: Record<string, unknown> = {
        supplier_name: input.supplier_name,
        supplier_group: input.supplier_group,
        supplier_type: (input.supplier_type as string) ?? "Company",
      };
      if (input.country) data.country = input.country;
      if (input.default_currency) data.default_currency = input.default_currency;

      const doc = await ctx.client.create("Supplier", data);

      return {
        data: doc,
        message: `Supplier ${doc.name} created successfully`,
      };
    },
  },

  // ── Purchase Orders ───────────────────────────────────────────────────────

  {
    name: "erpnext_purchase_order_list",
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
    description:
      "List Purchase Orders. Filterable by supplier, status, date range. " +
      "Fields: name, supplier, transaction_date, schedule_date, status, grand_total, currency.",
    category: "purchasing",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default 20)" },
        supplier: { type: "string", description: "Filter by supplier" },
        status: {
          type: "string",
          description:
            "Filter by status (Draft, To Receive and Bill, To Bill, Completed, Cancelled, etc.)",
        },
        date_from: { type: "string", description: "Start date filter YYYY-MM-DD" },
        date_to: { type: "string", description: "End date filter YYYY-MM-DD" },
      },
    },
    handler: async (input, ctx) => {
      const limit = (input.limit as number) ?? 20;
      const filters: FrappeFilter[] = [];
      if (input.supplier) {
        filters.push(["supplier", "=", input.supplier as string]);
      }
      if (input.status) {
        filters.push(["status", "=", input.status as string]);
      }
      if (input.date_from) {
        filters.push(["transaction_date", ">=", input.date_from as string]);
      }
      if (input.date_to) {
        filters.push(["transaction_date", "<=", input.date_to as string]);
      }

      const docs = await ctx.client.list("Purchase Order", {
        fields: [
          "name",
          "supplier",
          "transaction_date",
          "schedule_date",
          "status",
          "grand_total",
          "currency",
        ],
        filters,
        limit,
        order_by: "modified desc",
      });

      return {
        doctype: "Purchase Order",
        count: docs.length,
        data: docs,
        _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
      };
    },
  },

  {
    name: "erpnext_purchase_order_get",
    description:
      "Get a single Purchase Order by name (e.g. PO-00001). Returns full document with line items.",
    category: "purchasing",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Purchase Order name (e.g. PO-00001)" },
      },
      required: ["name"],
    },
    handler: async (input, ctx) => {
      if (!input.name) {
        throw new Error("[erpnext_purchase_order_get] 'name' is required");
      }
      const doc = await ctx.client.get("Purchase Order", input.name as string);
      return { data: doc };
    },
  },

  {
    name: "erpnext_purchase_order_create",
    description:
      "Create a new Purchase Order. Requires supplier and at least one item with item_code, qty, rate. " +
      "Optionally set schedule_date (YYYY-MM-DD).",
    category: "purchasing",
    inputSchema: {
      type: "object",
      properties: {
        supplier: { type: "string", description: "Supplier name (ID)" },
        items: {
          type: "array",
          description: "Line items: [{item_code, qty, rate}]",
          items: {
            type: "object",
            properties: {
              item_code: { type: "string" },
              qty: { type: "number" },
              rate: { type: "number" },
            },
            required: ["item_code", "qty", "rate"],
          },
        },
        schedule_date: {
          type: "string",
          description: "Expected delivery date YYYY-MM-DD",
        },
      },
      required: ["supplier", "items"],
    },
    handler: async (input, ctx) => {
      if (!input.supplier) {
        throw new Error("[erpnext_purchase_order_create] 'supplier' is required");
      }
      if (!input.items || !Array.isArray(input.items) || input.items.length === 0) {
        throw new Error("[erpnext_purchase_order_create] 'items' must be a non-empty array");
      }

      const items = (input.items as Array<{ item_code: string; qty: number; rate: number }>).map(
        (item) => {
          if (!item.item_code || item.qty == null || item.rate == null) {
            throw new Error(
              "[erpnext_purchase_order_create] Each item must have item_code, qty, and rate",
            );
          }
          return {
            item_code: item.item_code,
            qty: item.qty,
            rate: item.rate,
            schedule_date: (input.schedule_date as string) ?? undefined,
          };
        },
      );

      const doc = await ctx.client.create("Purchase Order", {
        supplier: input.supplier as string,
        items,
        schedule_date: (input.schedule_date as string) ?? undefined,
      });

      return {
        data: doc,
        message: `Purchase Order ${doc.name} created successfully`,
      };
    },
  },

  // ── Purchase Invoices ─────────────────────────────────────────────────────

  {
    name: "erpnext_purchase_invoice_list",
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
    description:
      "List Purchase Invoices (bills from suppliers). Filterable by supplier, status, date range. " +
      "Fields: name, supplier, posting_date, due_date, status, grand_total, outstanding_amount.",
    category: "purchasing",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default 20)" },
        supplier: { type: "string", description: "Filter by supplier" },
        status: {
          type: "string",
          description: "Filter by status (Draft, Unpaid, Paid, Overdue, Cancelled, etc.)",
        },
        date_from: { type: "string", description: "Start date filter YYYY-MM-DD" },
        date_to: { type: "string", description: "End date filter YYYY-MM-DD" },
      },
    },
    handler: async (input, ctx) => {
      const limit = (input.limit as number) ?? 20;
      const filters: FrappeFilter[] = [];
      if (input.supplier) {
        filters.push(["supplier", "=", input.supplier as string]);
      }
      if (input.status) {
        filters.push(["status", "=", input.status as string]);
      }
      if (input.date_from) {
        filters.push(["posting_date", ">=", input.date_from as string]);
      }
      if (input.date_to) {
        filters.push(["posting_date", "<=", input.date_to as string]);
      }

      const docs = await ctx.client.list("Purchase Invoice", {
        fields: [
          "name",
          "supplier",
          "posting_date",
          "due_date",
          "status",
          "grand_total",
          "outstanding_amount",
        ],
        filters,
        limit,
        order_by: "modified desc",
      });

      return {
        doctype: "Purchase Invoice",
        count: docs.length,
        data: docs,
        _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
      };
    },
  },

  {
    name: "erpnext_purchase_invoice_get",
    description:
      "Get a single Purchase Invoice by name (e.g. PINV-00001). Returns full document with line items.",
    category: "purchasing",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Purchase Invoice name (e.g. PINV-00001)" },
      },
      required: ["name"],
    },
    handler: async (input, ctx) => {
      if (!input.name) {
        throw new Error("[erpnext_purchase_invoice_get] 'name' is required");
      }
      const doc = await ctx.client.get("Purchase Invoice", input.name as string);
      return { data: doc };
    },
  },

  // ── Purchase Receipts ─────────────────────────────────────────────────────

  {
    name: "erpnext_purchase_receipt_list",
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
    description:
      "List Purchase Receipts (goods received notes). Filterable by supplier, status, date range. " +
      "Fields: name, supplier, posting_date, status, total_qty, grand_total.",
    category: "purchasing",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default 20)" },
        supplier: { type: "string", description: "Filter by supplier" },
        status: {
          type: "string",
          description: "Filter by status (Draft, To Bill, Completed, Cancelled, etc.)",
        },
        date_from: { type: "string", description: "Start date filter YYYY-MM-DD" },
        date_to: { type: "string", description: "End date filter YYYY-MM-DD" },
      },
    },
    handler: async (input, ctx) => {
      const limit = (input.limit as number) ?? 20;
      const filters: FrappeFilter[] = [];
      if (input.supplier) {
        filters.push(["supplier", "=", input.supplier as string]);
      }
      if (input.status) {
        filters.push(["status", "=", input.status as string]);
      }
      if (input.date_from) {
        filters.push(["posting_date", ">=", input.date_from as string]);
      }
      if (input.date_to) {
        filters.push(["posting_date", "<=", input.date_to as string]);
      }

      const docs = await ctx.client.list("Purchase Receipt", {
        fields: ["name", "supplier", "posting_date", "status", "total_qty", "grand_total"],
        filters,
        limit,
        order_by: "modified desc",
      });

      return {
        doctype: "Purchase Receipt",
        count: docs.length,
        data: docs,
        _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
      };
    },
  },

  {
    name: "erpnext_purchase_receipt_get",
    description:
      "Get a single Purchase Receipt by name (e.g. MAT-PRE-00001). Returns full document with received items.",
    category: "purchasing",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Purchase Receipt name (e.g. MAT-PRE-00001)" },
      },
      required: ["name"],
    },
    handler: async (input, ctx) => {
      if (!input.name) {
        throw new Error("[erpnext_purchase_receipt_get] 'name' is required");
      }
      const doc = await ctx.client.get("Purchase Receipt", input.name as string);
      return { data: doc };
    },
  },

  // ── Supplier Quotations ───────────────────────────────────────────────────

  {
    name: "erpnext_supplier_quotation_list",
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
    description:
      "List Supplier Quotations (RFQ responses from suppliers). Filterable by supplier, status. " +
      "Fields: name, supplier, transaction_date, status, grand_total.",
    category: "purchasing",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default 20)" },
        supplier: { type: "string", description: "Filter by supplier" },
        status: {
          type: "string",
          description: "Filter by status (Draft, Submitted, Ordered, Lost, Cancelled)",
        },
      },
    },
    handler: async (input, ctx) => {
      const limit = (input.limit as number) ?? 20;
      const filters: FrappeFilter[] = [];
      if (input.supplier) {
        filters.push(["supplier", "=", input.supplier as string]);
      }
      if (input.status) {
        filters.push(["status", "=", input.status as string]);
      }

      const docs = await ctx.client.list("Supplier Quotation", {
        fields: ["name", "supplier", "transaction_date", "status", "grand_total"],
        filters,
        limit,
        order_by: "modified desc",
      });

      return {
        doctype: "Supplier Quotation",
        count: docs.length,
        data: docs,
        _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
      };
    },
  },
];
