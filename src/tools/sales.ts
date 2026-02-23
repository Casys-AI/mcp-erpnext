/**
 * ERPNext Sales Tools
 *
 * MCP tools for sales operations: customers, sales orders, invoices, quotations.
 *
 * @module lib/erpnext/tools/sales
 */

import type { FrappeFilter } from "../api/types.ts";
import type { ErpNextTool } from "./types.ts";

export const salesTools: ErpNextTool[] = [
  // ── Customers ─────────────────────────────────────────────────────────────

  {
    name: "erpnext_customer_list",
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
    description:
      "List ERPNext customers. Returns active customers by default. " +
      "Fields: name, customer_name, customer_group, territory, email_id, disabled.",
    category: "sales",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default 20)" },
        customer_group: { type: "string", description: "Filter by customer group" },
        territory: { type: "string", description: "Filter by territory" },
        include_disabled: {
          type: "boolean",
          description: "Include disabled customers (default false)",
        },
      },
    },
    handler: async (input, ctx) => {
      const limit = (input.limit as number) ?? 20;
      const filters: FrappeFilter[] = [];
      if (!(input.include_disabled as boolean)) {
        filters.push(["disabled", "=", 0]);
      }
      if (input.customer_group) {
        filters.push(["customer_group", "=", input.customer_group as string]);
      }
      if (input.territory) {
        filters.push(["territory", "=", input.territory as string]);
      }

      const docs = await ctx.client.list("Customer", {
        fields: ["name", "customer_name", "customer_group", "territory", "email_id", "disabled"],
        filters,
        limit,
        order_by: "modified desc",
      });

      return {
        doctype: "Customer",
        count: docs.length,
        data: docs,
        _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
      };
    },
  },

  {
    name: "erpnext_customer_get",
    description:
      "Get a single ERPNext customer by name (ID). Returns all fields including contact details.",
    category: "sales",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Customer name (ID)" },
      },
      required: ["name"],
    },
    handler: async (input, ctx) => {
      if (!input.name) {
        throw new Error("[erpnext_customer_get] 'name' is required");
      }
      const doc = await ctx.client.get("Customer", input.name as string);
      return { data: doc };
    },
  },

  {
    name: "erpnext_customer_create",
    description:
      "Create a new Customer. Requires customer_name. " +
      "Optionally set customer_group, territory, email_id.",
    category: "sales",
    inputSchema: {
      type: "object",
      properties: {
        customer_name: { type: "string", description: "Full customer name" },
        customer_group: {
          type: "string",
          description: "Customer group (default: 'Commercial')",
        },
        territory: { type: "string", description: "Territory (default: 'All Territories')" },
        email_id: { type: "string", description: "Primary email address" },
        customer_type: {
          type: "string",
          description: "Customer type: Company or Individual (default: Company)",
          enum: ["Company", "Individual"],
        },
      },
      required: ["customer_name"],
    },
    handler: async (input, ctx) => {
      if (!input.customer_name) {
        throw new Error("[erpnext_customer_create] 'customer_name' is required");
      }

      const data: Record<string, unknown> = {
        customer_name: input.customer_name as string,
      };
      if (input.customer_group) data.customer_group = input.customer_group as string;
      if (input.territory) data.territory = input.territory as string;
      if (input.email_id) data.email_id = input.email_id as string;
      if (input.customer_type) data.customer_type = input.customer_type as string;

      const doc = await ctx.client.create("Customer", data);
      return {
        data: doc,
        message: `Customer ${doc.name} created successfully`,
      };
    },
  },

  {
    name: "erpnext_customer_update",
    description:
      "Update an existing Customer. Pass only the fields you want to change.",
    category: "sales",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Customer name (ID)" },
        customer_name: { type: "string", description: "New customer name" },
        customer_group: { type: "string", description: "New customer group" },
        territory: { type: "string", description: "New territory" },
        email_id: { type: "string", description: "New email address" },
        disabled: {
          type: "boolean",
          description: "Set to true to disable the customer",
        },
      },
      required: ["name"],
    },
    handler: async (input, ctx) => {
      if (!input.name) {
        throw new Error("[erpnext_customer_update] 'name' is required");
      }

      const { name, ...rest } = input;
      const data: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) {
        if (v !== undefined) data[k] = v;
      }

      if (Object.keys(data).length === 0) {
        throw new Error("[erpnext_customer_update] At least one field to update is required");
      }

      const doc = await ctx.client.update("Customer", name as string, data);
      return {
        data: doc,
        message: `Customer ${name} updated successfully`,
      };
    },
  },

  // ── Sales Orders ──────────────────────────────────────────────────────────

  {
    name: "erpnext_sales_order_list",
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
    description:
      "List Sales Orders. Filterable by customer, status, date range. " +
      "Fields: name, customer, transaction_date, status, grand_total, currency.",
    category: "sales",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default 20)" },
        customer: { type: "string", description: "Filter by customer" },
        status: {
          type: "string",
          description: "Filter by status (Draft, To Deliver and Bill, Completed, Cancelled, etc.)",
        },
        date_from: { type: "string", description: "Start date filter YYYY-MM-DD" },
        date_to: { type: "string", description: "End date filter YYYY-MM-DD" },
      },
    },
    handler: async (input, ctx) => {
      const limit = (input.limit as number) ?? 20;
      const filters: FrappeFilter[] = [];
      if (input.customer) {
        filters.push(["customer", "=", input.customer as string]);
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

      const docs = await ctx.client.list("Sales Order", {
        fields: ["name", "customer", "transaction_date", "status", "grand_total", "currency"],
        filters,
        limit,
        order_by: "modified desc",
      });

      return {
        doctype: "Sales Order",
        count: docs.length,
        data: docs,
        _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
      };
    },
  },

  {
    name: "erpnext_sales_order_get",
    description:
      "Get a single Sales Order by name (e.g. SO-00001). Returns full document with line items.",
    category: "sales",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Sales Order name (e.g. SO-00001)" },
      },
      required: ["name"],
    },
    handler: async (input, ctx) => {
      if (!input.name) {
        throw new Error("[erpnext_sales_order_get] 'name' is required");
      }
      const doc = await ctx.client.get("Sales Order", input.name as string);
      return { data: doc };
    },
  },

  {
    name: "erpnext_sales_order_create",
    description:
      "Create a new Sales Order. Requires customer and at least one item with item_code, qty, rate. " +
      "Optionally set delivery_date (YYYY-MM-DD).",
    category: "sales",
    inputSchema: {
      type: "object",
      properties: {
        customer: { type: "string", description: "Customer name (ID)" },
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
        delivery_date: {
          type: "string",
          description: "Delivery date YYYY-MM-DD (default: today + 7 days)",
        },
      },
      required: ["customer", "items"],
    },
    handler: async (input, ctx) => {
      if (!input.customer) {
        throw new Error("[erpnext_sales_order_create] 'customer' is required");
      }
      if (!input.items || !Array.isArray(input.items) || input.items.length === 0) {
        throw new Error("[erpnext_sales_order_create] 'items' must be a non-empty array");
      }

      const items = (input.items as Array<{ item_code: string; qty: number; rate: number }>).map(
        (item) => {
          if (!item.item_code || item.qty == null || item.rate == null) {
            throw new Error(
              "[erpnext_sales_order_create] Each item must have item_code, qty, and rate",
            );
          }
          return {
            item_code: item.item_code,
            qty: item.qty,
            rate: item.rate,
            delivery_date: (input.delivery_date as string) ?? undefined,
          };
        },
      );

      const doc = await ctx.client.create("Sales Order", {
        customer: input.customer as string,
        items,
        delivery_date: (input.delivery_date as string) ?? undefined,
      });

      return {
        data: doc,
        message: `Sales Order ${doc.name} created successfully`,
      };
    },
  },

  {
    name: "erpnext_sales_order_update",
    description:
      "Update an existing Sales Order (only in Draft status). " +
      "Pass only the fields you want to change (e.g. delivery_date, items).",
    category: "sales",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Sales Order name (e.g. SO-00001)" },
        delivery_date: { type: "string", description: "New delivery date YYYY-MM-DD" },
        items: {
          type: "array",
          description: "Replacement item list: [{item_code, qty, rate}]",
          items: {
            type: "object",
            properties: {
              item_code: { type: "string" },
              qty: { type: "number" },
              rate: { type: "number" },
            },
          },
        },
      },
      required: ["name"],
    },
    handler: async (input, ctx) => {
      if (!input.name) {
        throw new Error("[erpnext_sales_order_update] 'name' is required");
      }

      const data: Record<string, unknown> = {};
      if (input.delivery_date) data.delivery_date = input.delivery_date as string;
      if (input.items) data.items = input.items;

      if (Object.keys(data).length === 0) {
        throw new Error("[erpnext_sales_order_update] At least one field to update is required");
      }

      const doc = await ctx.client.update("Sales Order", input.name as string, data);
      return {
        data: doc,
        message: `Sales Order ${input.name} updated successfully`,
      };
    },
  },

  {
    name: "erpnext_sales_order_submit",
    description:
      "Submit a Draft Sales Order (changes status to 'To Deliver and Bill'). " +
      "Triggers stock reservation and fulfillment workflow.",
    category: "sales",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Sales Order name (e.g. SO-00001)" },
      },
      required: ["name"],
    },
    handler: async (input, ctx) => {
      if (!input.name) {
        throw new Error("[erpnext_sales_order_submit] 'name' is required");
      }

      // Fetch fresh doc — frappe.client.submit requires `modified` for optimistic locking
      const doc = await ctx.client.get("Sales Order", input.name as string);
      const result = await ctx.client.callMethod("frappe.client.submit", {
        doc: { ...doc, doctype: "Sales Order" },
      });

      return {
        data: result,
        message: `Sales Order ${input.name} submitted successfully`,
      };
    },
  },

  {
    name: "erpnext_sales_order_cancel",
    description:
      "Cancel a submitted Sales Order. Reverses stock reservation. " +
      "Only works on submitted (non-completed) Sales Orders.",
    category: "sales",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Sales Order name (e.g. SO-00001)" },
      },
      required: ["name"],
    },
    handler: async (input, ctx) => {
      if (!input.name) {
        throw new Error("[erpnext_sales_order_cancel] 'name' is required");
      }

      const result = await ctx.client.callMethod("frappe.client.cancel", {
        doctype: "Sales Order",
        name: input.name as string,
      });

      return {
        data: result,
        message: `Sales Order ${input.name} cancelled successfully`,
      };
    },
  },

  // ── Sales Invoices ────────────────────────────────────────────────────────

  {
    name: "erpnext_sales_invoice_list",
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
    description:
      "List Sales Invoices. Filterable by customer, status, date range. " +
      "Fields: name, customer, posting_date, due_date, status, grand_total, outstanding_amount.",
    category: "sales",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default 20)" },
        customer: { type: "string", description: "Filter by customer" },
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
      if (input.customer) {
        filters.push(["customer", "=", input.customer as string]);
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

      const docs = await ctx.client.list("Sales Invoice", {
        fields: [
          "name",
          "customer",
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
        doctype: "Sales Invoice",
        count: docs.length,
        data: docs,
        _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
      };
    },
  },

  {
    name: "erpnext_sales_invoice_get",
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/invoice-viewer" } },
    description:
      "Get a single Sales Invoice by name (e.g. SINV-00001). Returns full document with line items.",
    category: "sales",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Sales Invoice name (e.g. SINV-00001)" },
      },
      required: ["name"],
    },
    handler: async (input, ctx) => {
      if (!input.name) {
        throw new Error("[erpnext_sales_invoice_get] 'name' is required");
      }
      const doc = await ctx.client.get("Sales Invoice", input.name as string);
      return {
        data: doc,
        _meta: { ui: { resourceUri: "ui://mcp-erpnext/invoice-viewer" } },
      };
    },
  },

  {
    name: "erpnext_sales_invoice_create",
    description:
      "Create a new Sales Invoice. Requires customer and at least one item. " +
      "Optionally set posting_date (YYYY-MM-DD). " +
      "To generate from a Sales Order, use erpnext_doc_update to set is_return etc.",
    category: "sales",
    inputSchema: {
      type: "object",
      properties: {
        customer: { type: "string", description: "Customer name (ID)" },
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
        posting_date: {
          type: "string",
          description: "Invoice date YYYY-MM-DD (default: today)",
        },
        due_date: {
          type: "string",
          description: "Payment due date YYYY-MM-DD",
        },
      },
      required: ["customer", "items"],
    },
    handler: async (input, ctx) => {
      if (!input.customer) {
        throw new Error("[erpnext_sales_invoice_create] 'customer' is required");
      }
      if (!input.items || !Array.isArray(input.items) || input.items.length === 0) {
        throw new Error("[erpnext_sales_invoice_create] 'items' must be a non-empty array");
      }

      const items = (input.items as Array<{ item_code: string; qty: number; rate: number }>).map(
        (item) => {
          if (!item.item_code || item.qty == null || item.rate == null) {
            throw new Error(
              "[erpnext_sales_invoice_create] Each item must have item_code, qty, and rate",
            );
          }
          return { item_code: item.item_code, qty: item.qty, rate: item.rate };
        },
      );

      const data: Record<string, unknown> = {
        customer: input.customer as string,
        items,
      };
      if (input.posting_date) data.posting_date = input.posting_date as string;
      if (input.due_date) data.due_date = input.due_date as string;

      const doc = await ctx.client.create("Sales Invoice", data);
      return {
        data: doc,
        message: `Sales Invoice ${doc.name} created successfully`,
      };
    },
  },

  {
    name: "erpnext_sales_invoice_submit",
    description:
      "Submit a Draft Sales Invoice (posts it to the ledger, changes status to 'Unpaid'). " +
      "Once submitted, the invoice is visible to the customer and affects GL.",
    category: "sales",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Sales Invoice name (e.g. SINV-00001)",
        },
      },
      required: ["name"],
    },
    handler: async (input, ctx) => {
      if (!input.name) {
        throw new Error("[erpnext_sales_invoice_submit] 'name' is required");
      }

      // Fetch fresh doc — frappe.client.submit requires `modified` for optimistic locking
      const doc = await ctx.client.get("Sales Invoice", input.name as string);
      const result = await ctx.client.callMethod("frappe.client.submit", {
        doc: { ...doc, doctype: "Sales Invoice" },
      });

      return {
        data: result,
        message: `Sales Invoice ${input.name} submitted successfully`,
      };
    },
  },

  // ── Quotations ────────────────────────────────────────────────────────────

  {
    name: "erpnext_quotation_list",
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
    description:
      "List Quotations. Filterable by party_name, status. " +
      "Fields: name, party_name, transaction_date, status, grand_total.",
    category: "sales",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default 20)" },
        party_name: { type: "string", description: "Filter by party name" },
        status: {
          type: "string",
          description: "Filter by status (Draft, Open, Replied, Ordered, Lost, Cancelled)",
        },
      },
    },
    handler: async (input, ctx) => {
      const limit = (input.limit as number) ?? 20;
      const filters: FrappeFilter[] = [];
      if (input.party_name) {
        filters.push(["party_name", "=", input.party_name as string]);
      }
      if (input.status) {
        filters.push(["status", "=", input.status as string]);
      }

      const docs = await ctx.client.list("Quotation", {
        fields: ["name", "party_name", "transaction_date", "status", "grand_total"],
        filters,
        limit,
        order_by: "modified desc",
      });

      return {
        doctype: "Quotation",
        count: docs.length,
        data: docs,
        _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
      };
    },
  },

  {
    name: "erpnext_quotation_get",
    description:
      "Get a single Quotation by name. Returns full document with line items and terms.",
    category: "sales",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Quotation name (e.g. QTN-00001)" },
      },
      required: ["name"],
    },
    handler: async (input, ctx) => {
      if (!input.name) {
        throw new Error("[erpnext_quotation_get] 'name' is required");
      }
      const doc = await ctx.client.get("Quotation", input.name as string);
      return { data: doc };
    },
  },

  {
    name: "erpnext_quotation_create",
    description:
      "Create a new Quotation for a customer or lead. " +
      "Requires quotation_to (Customer or Lead), party_name, and at least one item.",
    category: "sales",
    inputSchema: {
      type: "object",
      properties: {
        quotation_to: {
          type: "string",
          description: "Party type: Customer or Lead",
          enum: ["Customer", "Lead"],
        },
        party_name: {
          type: "string",
          description: "Customer or Lead name",
        },
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
        transaction_date: {
          type: "string",
          description: "Quotation date YYYY-MM-DD (default: today)",
        },
        valid_till: {
          type: "string",
          description: "Validity date YYYY-MM-DD",
        },
      },
      required: ["quotation_to", "party_name", "items"],
    },
    handler: async (input, ctx) => {
      if (!input.quotation_to) {
        throw new Error("[erpnext_quotation_create] 'quotation_to' is required");
      }
      if (!input.party_name) {
        throw new Error("[erpnext_quotation_create] 'party_name' is required");
      }
      if (!input.items || !Array.isArray(input.items) || input.items.length === 0) {
        throw new Error("[erpnext_quotation_create] 'items' must be a non-empty array");
      }

      const items = (input.items as Array<{ item_code: string; qty: number; rate: number }>).map(
        (item) => {
          if (!item.item_code || item.qty == null || item.rate == null) {
            throw new Error(
              "[erpnext_quotation_create] Each item must have item_code, qty, and rate",
            );
          }
          return { item_code: item.item_code, qty: item.qty, rate: item.rate };
        },
      );

      const data: Record<string, unknown> = {
        quotation_to: input.quotation_to as string,
        party_name: input.party_name as string,
        items,
      };
      if (input.transaction_date) data.transaction_date = input.transaction_date as string;
      if (input.valid_till) data.valid_till = input.valid_till as string;

      const doc = await ctx.client.create("Quotation", data);
      return {
        data: doc,
        message: `Quotation ${doc.name} created successfully`,
      };
    },
  },
];
