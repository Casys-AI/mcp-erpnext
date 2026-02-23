/**
 * ERPNext Delivery Tools
 *
 * MCP tools for delivery operations: delivery notes, shipments.
 *
 * @module lib/erpnext/tools/delivery
 */

import type { FrappeFilter } from "../api/types.ts";
import type { ErpNextTool } from "./types.ts";

export const deliveryTools: ErpNextTool[] = [
  // ── Delivery Notes ────────────────────────────────────────────────────────

  {
    name: "erpnext_delivery_note_list",
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
    description:
      "List Delivery Notes. Filterable by customer, status, date range. " +
      "Fields: name, customer, posting_date, status, total_qty, grand_total.",
    category: "delivery",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default 20)" },
        customer: { type: "string", description: "Filter by customer" },
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

      const docs = await ctx.client.list("Delivery Note", {
        fields: ["name", "customer", "posting_date", "status", "total_qty", "grand_total"],
        filters,
        limit,
        order_by: "modified desc",
      });

      return {
        doctype: "Delivery Note",
        count: docs.length,
        data: docs,
        _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
      };
    },
  },

  {
    name: "erpnext_delivery_note_get",
    description:
      "Get a single Delivery Note by name (e.g. MAT-DN-00001). Returns full document with delivered items.",
    category: "delivery",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Delivery Note name (e.g. MAT-DN-00001)" },
      },
      required: ["name"],
    },
    handler: async (input, ctx) => {
      if (!input.name) {
        throw new Error("[erpnext_delivery_note_get] 'name' is required");
      }
      const doc = await ctx.client.get("Delivery Note", input.name as string);
      return { data: doc };
    },
  },

  {
    name: "erpnext_delivery_note_create",
    description:
      "Create a new Delivery Note. Requires customer and at least one item with item_code, qty. " +
      "Typically created against a Sales Order.",
    category: "delivery",
    inputSchema: {
      type: "object",
      properties: {
        customer: { type: "string", description: "Customer name (ID)" },
        items: {
          type: "array",
          description: "Line items: [{item_code, qty, against_sales_order?}]",
          items: {
            type: "object",
            properties: {
              item_code: { type: "string" },
              qty: { type: "number" },
              against_sales_order: {
                type: "string",
                description: "Sales Order reference (e.g. SO-00001)",
              },
            },
            required: ["item_code", "qty"],
          },
        },
        posting_date: {
          type: "string",
          description: "Posting date YYYY-MM-DD (default: today)",
        },
      },
      required: ["customer", "items"],
    },
    handler: async (input, ctx) => {
      if (!input.customer) {
        throw new Error("[erpnext_delivery_note_create] 'customer' is required");
      }
      if (!input.items || !Array.isArray(input.items) || input.items.length === 0) {
        throw new Error("[erpnext_delivery_note_create] 'items' must be a non-empty array");
      }

      const items = (
        input.items as Array<{ item_code: string; qty: number; against_sales_order?: string }>
      ).map((item) => {
        if (!item.item_code || item.qty == null) {
          throw new Error(
            "[erpnext_delivery_note_create] Each item must have item_code and qty",
          );
        }
        return {
          item_code: item.item_code,
          qty: item.qty,
          against_sales_order: item.against_sales_order ?? undefined,
        };
      });

      const doc = await ctx.client.create("Delivery Note", {
        customer: input.customer as string,
        items,
        posting_date: (input.posting_date as string) ?? undefined,
      });

      return {
        data: doc,
        message: `Delivery Note ${doc.name} created successfully`,
      };
    },
  },

  // ── Shipments ─────────────────────────────────────────────────────────────

  {
    name: "erpnext_shipment_list",
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
    description:
      "List Shipments. Filterable by status, pickup_from date range. " +
      "Fields: name, status, pickup_date, delivery_date, carrier, shipment_amount.",
    category: "delivery",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default 20)" },
        status: {
          type: "string",
          description: "Filter by status (Draft, Submitted, Booked, Delivered, Cancelled, etc.)",
        },
        carrier: { type: "string", description: "Filter by carrier name" },
        date_from: { type: "string", description: "Pickup date start filter YYYY-MM-DD" },
        date_to: { type: "string", description: "Pickup date end filter YYYY-MM-DD" },
      },
    },
    handler: async (input, ctx) => {
      const limit = (input.limit as number) ?? 20;
      const filters: FrappeFilter[] = [];
      if (input.status) {
        filters.push(["status", "=", input.status as string]);
      }
      if (input.carrier) {
        filters.push(["carrier", "=", input.carrier as string]);
      }
      if (input.date_from) {
        filters.push(["pickup_date", ">=", input.date_from as string]);
      }
      if (input.date_to) {
        filters.push(["pickup_date", "<=", input.date_to as string]);
      }

      const docs = await ctx.client.list("Shipment", {
        fields: [
          "name",
          "status",
          "pickup_date",
          "delivery_date",
          "carrier",
          "shipment_amount",
        ],
        filters,
        limit,
        order_by: "modified desc",
      });

      return {
        doctype: "Shipment",
        count: docs.length,
        data: docs,
        _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
      };
    },
  },

  {
    name: "erpnext_shipment_get",
    description: "Get a single Shipment by name. Returns full shipment details including parcels.",
    category: "delivery",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Shipment name (ID)" },
      },
      required: ["name"],
    },
    handler: async (input, ctx) => {
      if (!input.name) {
        throw new Error("[erpnext_shipment_get] 'name' is required");
      }
      const doc = await ctx.client.get("Shipment", input.name as string);
      return { data: doc };
    },
  },
];
