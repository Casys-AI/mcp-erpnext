/**
 * ERPNext Inventory Tools
 *
 * MCP tools for inventory operations: items, stock balance, warehouses, stock entries.
 *
 * @module lib/erpnext/tools/inventory
 */

import type { FrappeFilter } from "../api/types.ts";
import type { ErpNextTool } from "./types.ts";

export const inventoryTools: ErpNextTool[] = [
  // ── Items ─────────────────────────────────────────────────────────────────

  {
    name: "erpnext_item_list",
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
    description:
      "List ERPNext Items. Returns active items by default. " +
      "Fields: name, item_code, item_name, item_group, stock_uom, is_stock_item, standard_rate. " +
      "Filterable by item_group, is_stock_item.",
    category: "inventory",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default 20)" },
        item_group: { type: "string", description: "Filter by item group" },
        is_stock_item: {
          type: "boolean",
          description: "Filter by stock item flag (true=stock items only)",
        },
        include_disabled: {
          type: "boolean",
          description: "Include disabled items (default false)",
        },
      },
    },
    handler: async (input, ctx) => {
      const limit = (input.limit as number) ?? 20;
      const filters: FrappeFilter[] = [];
      if (!(input.include_disabled as boolean)) {
        filters.push(["disabled", "=", 0]);
      }
      if (input.item_group) {
        filters.push(["item_group", "=", input.item_group as string]);
      }
      if (input.is_stock_item !== undefined) {
        filters.push(["is_stock_item", "=", (input.is_stock_item as boolean) ? 1 : 0]);
      }

      const docs = await ctx.client.list("Item", {
        fields: [
          "name",
          "item_code",
          "item_name",
          "item_group",
          "stock_uom",
          "is_stock_item",
          "standard_rate",
        ],
        filters,
        limit,
        order_by: "modified desc",
      });

      return {
        doctype: "Item",
        count: docs.length,
        data: docs,
        _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
      };
    },
  },

  {
    name: "erpnext_item_get",
    description:
      "Get a single ERPNext Item by name/item_code. Returns all fields including pricing and stock details.",
    category: "inventory",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Item name or item_code" },
      },
      required: ["name"],
    },
    handler: async (input, ctx) => {
      if (!input.name) {
        throw new Error("[erpnext_item_get] 'name' is required");
      }
      const doc = await ctx.client.get("Item", input.name as string);
      return { data: doc };
    },
  },

  {
    name: "erpnext_item_create",
    description:
      "Create a new Item (product or service). Requires item_code and item_name. " +
      "Set is_stock_item=false for service/non-stocked items.",
    category: "inventory",
    inputSchema: {
      type: "object",
      properties: {
        item_code: { type: "string", description: "Unique item code" },
        item_name: { type: "string", description: "Human-readable item name" },
        item_group: {
          type: "string",
          description: "Item group (default: 'All Item Groups')",
        },
        uom: { type: "string", description: "Unit of measure (default: 'Nos')" },
        is_stock_item: {
          type: "boolean",
          description: "True for physical stock items (default: true)",
        },
        standard_rate: { type: "number", description: "Default selling rate" },
        description: { type: "string", description: "Item description" },
      },
      required: ["item_code", "item_name"],
    },
    handler: async (input, ctx) => {
      if (!input.item_code) {
        throw new Error("[erpnext_item_create] 'item_code' is required");
      }
      if (!input.item_name) {
        throw new Error("[erpnext_item_create] 'item_name' is required");
      }

      const data: Record<string, unknown> = {
        item_code: input.item_code as string,
        item_name: input.item_name as string,
      };
      if (input.item_group) data.item_group = input.item_group as string;
      if (input.uom) data.uom = input.uom as string;
      if (input.is_stock_item !== undefined) data.is_stock_item = input.is_stock_item;
      if (input.standard_rate !== undefined) data.standard_rate = input.standard_rate;
      if (input.description) data.description = input.description as string;

      const doc = await ctx.client.create("Item", data);
      return {
        data: doc,
        message: `Item ${doc.name} created successfully`,
      };
    },
  },

  {
    name: "erpnext_item_update",
    description:
      "Update an existing Item. Pass only the fields you want to change.",
    category: "inventory",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Item name/item_code" },
        item_name: { type: "string", description: "New item name" },
        item_group: { type: "string", description: "New item group" },
        standard_rate: { type: "number", description: "New default selling rate" },
        description: { type: "string", description: "New description" },
        disabled: { type: "boolean", description: "Set to true to disable the item" },
      },
      required: ["name"],
    },
    handler: async (input, ctx) => {
      if (!input.name) {
        throw new Error("[erpnext_item_update] 'name' is required");
      }

      const { name, ...rest } = input;
      const data: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) {
        if (v !== undefined) data[k] = v;
      }

      if (Object.keys(data).length === 0) {
        throw new Error("[erpnext_item_update] At least one field to update is required");
      }

      const doc = await ctx.client.update("Item", name as string, data);
      return {
        data: doc,
        message: `Item ${name} updated successfully`,
      };
    },
  },

  // ── Stock Balance (Bin) ───────────────────────────────────────────────────

  {
    name: "erpnext_stock_balance",
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/stock-viewer" } },
    description:
      "Get stock balance by item and/or warehouse. Reads from the Bin DocType. " +
      "Fields: item_code, warehouse, actual_qty, reserved_qty, projected_qty, valuation_rate, stock_value. " +
      "Filterable by item_code, warehouse.",
    category: "inventory",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default 50)" },
        item_code: { type: "string", description: "Filter by item code" },
        warehouse: { type: "string", description: "Filter by warehouse" },
      },
    },
    handler: async (input, ctx) => {
      const limit = (input.limit as number) ?? 50;
      const filters: FrappeFilter[] = [];
      if (input.item_code) {
        filters.push(["item_code", "=", input.item_code as string]);
      }
      if (input.warehouse) {
        filters.push(["warehouse", "=", input.warehouse as string]);
      }

      const docs = await ctx.client.list("Bin", {
        fields: [
          "name",
          "item_code",
          "warehouse",
          "actual_qty",
          "reserved_qty",
          "projected_qty",
          "valuation_rate",
          "stock_value",
        ],
        filters,
        limit,
        order_by: "modified desc",
      });

      return {
        doctype: "Bin",
        count: docs.length,
        data: docs,
        _meta: { ui: { resourceUri: "ui://mcp-erpnext/stock-viewer" } },
      };
    },
  },

  // ── Warehouses ────────────────────────────────────────────────────────────

  {
    name: "erpnext_warehouse_list",
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
    description:
      "List ERPNext Warehouses. " +
      "Fields: name, warehouse_name, warehouse_type, company.",
    category: "inventory",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default 20)" },
        company: { type: "string", description: "Filter by company" },
        warehouse_type: { type: "string", description: "Filter by warehouse type" },
      },
    },
    handler: async (input, ctx) => {
      const limit = (input.limit as number) ?? 20;
      const filters: FrappeFilter[] = [];
      if (input.company) {
        filters.push(["company", "=", input.company as string]);
      }
      if (input.warehouse_type) {
        filters.push(["warehouse_type", "=", input.warehouse_type as string]);
      }

      const docs = await ctx.client.list("Warehouse", {
        fields: ["name", "warehouse_name", "warehouse_type", "company"],
        filters,
        limit,
        order_by: "modified desc",
      });

      return {
        doctype: "Warehouse",
        count: docs.length,
        data: docs,
        _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
      };
    },
  },

  // ── Stock Entries ─────────────────────────────────────────────────────────

  {
    name: "erpnext_stock_entry_list",
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
    description:
      "List Stock Entries (material transfers, receipts, issues). " +
      "Fields: name, stock_entry_type, posting_date, from_warehouse, to_warehouse, total_amount. " +
      "Filterable by stock_entry_type, date range.",
    category: "inventory",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default 20)" },
        stock_entry_type: {
          type: "string",
          description:
            "Filter by type (Material Issue, Material Receipt, Material Transfer, etc.)",
        },
        date_from: { type: "string", description: "Start date filter YYYY-MM-DD" },
        date_to: { type: "string", description: "End date filter YYYY-MM-DD" },
      },
    },
    handler: async (input, ctx) => {
      const limit = (input.limit as number) ?? 20;
      const filters: FrappeFilter[] = [];
      if (input.stock_entry_type) {
        filters.push(["stock_entry_type", "=", input.stock_entry_type as string]);
      }
      if (input.date_from) {
        filters.push(["posting_date", ">=", input.date_from as string]);
      }
      if (input.date_to) {
        filters.push(["posting_date", "<=", input.date_to as string]);
      }

      const docs = await ctx.client.list("Stock Entry", {
        fields: [
          "name",
          "stock_entry_type",
          "posting_date",
          "from_warehouse",
          "to_warehouse",
          "total_amount",
        ],
        filters,
        limit,
        order_by: "modified desc",
      });

      return {
        doctype: "Stock Entry",
        count: docs.length,
        data: docs,
        _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
      };
    },
  },

  {
    name: "erpnext_stock_entry_get",
    description:
      "Get a single Stock Entry by name. Returns full document with item details.",
    category: "inventory",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Stock Entry name (e.g. STE-00001)" },
      },
      required: ["name"],
    },
    handler: async (input, ctx) => {
      if (!input.name) {
        throw new Error("[erpnext_stock_entry_get] 'name' is required");
      }
      const doc = await ctx.client.get("Stock Entry", input.name as string);
      return { data: doc };
    },
  },

  {
    name: "erpnext_stock_entry_create",
    description:
      "Create a new Stock Entry (material issue, receipt, or transfer). " +
      "Requires stock_entry_type and items with item_code and qty. " +
      "For Material Issue: set s_warehouse. For Material Receipt: set t_warehouse. " +
      "For Material Transfer: set both s_warehouse and t_warehouse.",
    category: "inventory",
    inputSchema: {
      type: "object",
      properties: {
        stock_entry_type: {
          type: "string",
          description: "Entry type: Material Issue, Material Receipt, Material Transfer",
          enum: ["Material Issue", "Material Receipt", "Material Transfer"],
        },
        items: {
          type: "array",
          description:
            "Items to move: [{item_code, qty, s_warehouse?, t_warehouse?, basic_rate?}]",
          items: {
            type: "object",
            properties: {
              item_code: { type: "string" },
              qty: { type: "number" },
              s_warehouse: { type: "string", description: "Source warehouse" },
              t_warehouse: { type: "string", description: "Target warehouse" },
              basic_rate: { type: "number", description: "Valuation rate (for receipts)" },
            },
            required: ["item_code", "qty"],
          },
        },
        from_warehouse: {
          type: "string",
          description: "Default source warehouse (applies to all items if not per-item)",
        },
        to_warehouse: {
          type: "string",
          description: "Default target warehouse (applies to all items if not per-item)",
        },
        posting_date: { type: "string", description: "Posting date YYYY-MM-DD" },
        remarks: { type: "string", description: "Optional remarks" },
      },
      required: ["stock_entry_type", "items"],
    },
    handler: async (input, ctx) => {
      if (!input.stock_entry_type) {
        throw new Error("[erpnext_stock_entry_create] 'stock_entry_type' is required");
      }
      if (!input.items || !Array.isArray(input.items) || input.items.length === 0) {
        throw new Error("[erpnext_stock_entry_create] 'items' must be a non-empty array");
      }

      const data: Record<string, unknown> = {
        stock_entry_type: input.stock_entry_type as string,
        items: input.items,
      };
      if (input.from_warehouse) data.from_warehouse = input.from_warehouse as string;
      if (input.to_warehouse) data.to_warehouse = input.to_warehouse as string;
      if (input.posting_date) data.posting_date = input.posting_date as string;
      if (input.remarks) data.remarks = input.remarks as string;

      const doc = await ctx.client.create("Stock Entry", data);
      return {
        data: doc,
        message: `Stock Entry ${doc.name} created successfully`,
      };
    },
  },
];
