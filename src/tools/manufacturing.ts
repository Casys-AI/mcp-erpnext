/**
 * ERPNext Manufacturing Tools
 *
 * MCP tools for manufacturing operations: Bill of Materials, Work Orders,
 * Job Cards, production planning.
 *
 * @module lib/erpnext/tools/manufacturing
 */

import type { FrappeFilter } from "../api/types.ts";
import type { ErpNextTool } from "./types.ts";

export const manufacturingTools: ErpNextTool[] = [
  // ── Bill of Materials ─────────────────────────────────────────────────────

  {
    name: "erpnext_bom_list",
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
    description:
      "List Bills of Materials (BOM). Filterable by item, is_active, is_default. " +
      "Fields: name, item, item_name, quantity, uom, is_active, is_default, total_cost.",
    category: "manufacturing",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default 20)" },
        item: { type: "string", description: "Filter by finished goods item code" },
        is_active: {
          type: "boolean",
          description: "Filter by active status (default: all)",
        },
        is_default: {
          type: "boolean",
          description: "Filter for default BOMs only",
        },
      },
    },
    handler: async (input, ctx) => {
      const limit = (input.limit as number) ?? 20;
      const filters: FrappeFilter[] = [];
      if (input.item) {
        filters.push(["item", "=", input.item as string]);
      }
      if (input.is_active !== undefined) {
        filters.push(["is_active", "=", (input.is_active as boolean) ? 1 : 0]);
      }
      if (input.is_default !== undefined) {
        filters.push(["is_default", "=", (input.is_default as boolean) ? 1 : 0]);
      }

      const docs = await ctx.client.list("BOM", {
        fields: [
          "name",
          "item",
          "item_name",
          "quantity",
          "uom",
          "is_active",
          "is_default",
          "total_cost",
        ],
        filters,
        limit,
        order_by: "modified desc",
      });

      return {
        doctype: "BOM",
        count: docs.length,
        data: docs,
        _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
      };
    },
  },

  {
    name: "erpnext_bom_get",
    description:
      "Get a single BOM by name (e.g. BOM-ITEM-00001). Returns full document with raw materials and operations.",
    category: "manufacturing",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "BOM name (e.g. BOM-ITEM-00001)" },
      },
      required: ["name"],
    },
    handler: async (input, ctx) => {
      if (!input.name) {
        throw new Error("[erpnext_bom_get] 'name' is required");
      }
      const doc = await ctx.client.get("BOM", input.name as string);
      return { data: doc };
    },
  },

  // ── Work Orders ───────────────────────────────────────────────────────────

  {
    name: "erpnext_work_order_list",
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
    description:
      "List Work Orders. Filterable by production_item, status, date range. " +
      "Fields: name, production_item, qty, produced_qty, status, planned_start_date, planned_end_date.",
    category: "manufacturing",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default 20)" },
        production_item: { type: "string", description: "Filter by item being produced" },
        status: {
          type: "string",
          description:
            "Filter by status (Draft, Submitted, Not Started, In Process, Completed, Stopped, etc.)",
        },
        date_from: { type: "string", description: "Planned start date from YYYY-MM-DD" },
        date_to: { type: "string", description: "Planned start date to YYYY-MM-DD" },
      },
    },
    handler: async (input, ctx) => {
      const limit = (input.limit as number) ?? 20;
      const filters: FrappeFilter[] = [];
      if (input.production_item) {
        filters.push(["production_item", "=", input.production_item as string]);
      }
      if (input.status) {
        filters.push(["status", "=", input.status as string]);
      }
      if (input.date_from) {
        filters.push(["planned_start_date", ">=", input.date_from as string]);
      }
      if (input.date_to) {
        filters.push(["planned_start_date", "<=", input.date_to as string]);
      }

      const docs = await ctx.client.list("Work Order", {
        fields: [
          "name",
          "production_item",
          "qty",
          "produced_qty",
          "status",
          "planned_start_date",
          "planned_end_date",
        ],
        filters,
        limit,
        order_by: "modified desc",
      });

      return {
        doctype: "Work Order",
        count: docs.length,
        data: docs,
        _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
      };
    },
  },

  {
    name: "erpnext_work_order_get",
    description:
      "Get a single Work Order by name (e.g. MFG-WO-00001). Returns full document with operations and materials.",
    category: "manufacturing",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Work Order name (e.g. MFG-WO-00001)" },
      },
      required: ["name"],
    },
    handler: async (input, ctx) => {
      if (!input.name) {
        throw new Error("[erpnext_work_order_get] 'name' is required");
      }
      const doc = await ctx.client.get("Work Order", input.name as string);
      return { data: doc };
    },
  },

  {
    name: "erpnext_work_order_create",
    description:
      "Create a new Work Order for manufacturing. Requires production_item, bom_no, and qty. " +
      "Optionally set planned_start_date and wip_warehouse.",
    category: "manufacturing",
    inputSchema: {
      type: "object",
      properties: {
        production_item: { type: "string", description: "Item code of the item to produce" },
        bom_no: { type: "string", description: "BOM to use (e.g. BOM-ITEM-00001)" },
        qty: { type: "number", description: "Quantity to produce" },
        planned_start_date: {
          type: "string",
          description: "Planned start date YYYY-MM-DD",
        },
        wip_warehouse: {
          type: "string",
          description: "Work-In-Progress warehouse",
        },
        fg_warehouse: {
          type: "string",
          description: "Finished Goods target warehouse",
        },
      },
      required: ["production_item", "bom_no", "qty"],
    },
    handler: async (input, ctx) => {
      if (!input.production_item) {
        throw new Error("[erpnext_work_order_create] 'production_item' is required");
      }
      if (!input.bom_no) {
        throw new Error("[erpnext_work_order_create] 'bom_no' is required");
      }
      if (input.qty == null) {
        throw new Error("[erpnext_work_order_create] 'qty' is required");
      }

      const doc = await ctx.client.create("Work Order", {
        production_item: input.production_item as string,
        bom_no: input.bom_no as string,
        qty: input.qty as number,
        planned_start_date: (input.planned_start_date as string) ?? undefined,
        wip_warehouse: (input.wip_warehouse as string) ?? undefined,
        fg_warehouse: (input.fg_warehouse as string) ?? undefined,
      });

      return {
        data: doc,
        message: `Work Order ${doc.name} created successfully`,
      };
    },
  },

  // ── Job Cards ─────────────────────────────────────────────────────────────

  {
    name: "erpnext_job_card_list",
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
    description:
      "List Job Cards (production operations tracking). Filterable by work_order, status, operation. " +
      "Fields: name, work_order, operation, status, for_quantity, total_completed_qty, workstation.",
    category: "manufacturing",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default 20)" },
        work_order: { type: "string", description: "Filter by Work Order" },
        status: {
          type: "string",
          description: "Filter by status (Open, Work In Progress, Completed, Cancelled)",
        },
        operation: { type: "string", description: "Filter by operation name" },
      },
    },
    handler: async (input, ctx) => {
      const limit = (input.limit as number) ?? 20;
      const filters: FrappeFilter[] = [];
      if (input.work_order) {
        filters.push(["work_order", "=", input.work_order as string]);
      }
      if (input.status) {
        filters.push(["status", "=", input.status as string]);
      }
      if (input.operation) {
        filters.push(["operation", "=", input.operation as string]);
      }

      const docs = await ctx.client.list("Job Card", {
        fields: [
          "name",
          "work_order",
          "operation",
          "status",
          "for_quantity",
          "total_completed_qty",
          "workstation",
        ],
        filters,
        limit,
        order_by: "modified desc",
      });

      return {
        doctype: "Job Card",
        count: docs.length,
        data: docs,
        _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
      };
    },
  },

  {
    name: "erpnext_job_card_get",
    description:
      "Get a single Job Card by name. Returns full document with time logs and material transfers.",
    category: "manufacturing",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Job Card name (ID)" },
      },
      required: ["name"],
    },
    handler: async (input, ctx) => {
      if (!input.name) {
        throw new Error("[erpnext_job_card_get] 'name' is required");
      }
      const doc = await ctx.client.get("Job Card", input.name as string);
      return { data: doc };
    },
  },
];
