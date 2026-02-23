/**
 * ERPNext Assets Tools
 *
 * MCP tools for fixed asset management: assets, asset movement,
 * asset depreciation, asset maintenance.
 *
 * @module lib/erpnext/tools/assets
 */

import type { FrappeFilter } from "../api/types.ts";
import type { ErpNextTool } from "./types.ts";

export const assetsTools: ErpNextTool[] = [
  // ── Assets ────────────────────────────────────────────────────────────────

  {
    name: "erpnext_asset_list",
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
    description:
      "List Fixed Assets. Filterable by status, asset_category, location, custodian. " +
      "Fields: name, asset_name, asset_category, status, purchase_date, gross_purchase_amount, " +
      "current_value, location, custodian.",
    category: "assets",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default 20)" },
        status: {
          type: "string",
          description:
            "Filter by status (Draft, Submitted, Partially Depreciated, Fully Depreciated, Scrapped, Sold)",
        },
        asset_category: { type: "string", description: "Filter by asset category" },
        location: { type: "string", description: "Filter by location" },
        custodian: { type: "string", description: "Filter by custodian (employee)" },
      },
    },
    handler: async (input, ctx) => {
      const limit = (input.limit as number) ?? 20;
      const filters: FrappeFilter[] = [];
      if (input.status) {
        filters.push(["status", "=", input.status as string]);
      }
      if (input.asset_category) {
        filters.push(["asset_category", "=", input.asset_category as string]);
      }
      if (input.location) {
        filters.push(["location", "=", input.location as string]);
      }
      if (input.custodian) {
        filters.push(["custodian", "=", input.custodian as string]);
      }

      const docs = await ctx.client.list("Asset", {
        fields: [
          "name",
          "asset_name",
          "asset_category",
          "status",
          "purchase_date",
          "gross_purchase_amount",
          "current_value",
          "location",
          "custodian",
        ],
        filters,
        limit,
        order_by: "modified desc",
      });

      return {
        doctype: "Asset",
        count: docs.length,
        data: docs,
        _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
      };
    },
  },

  {
    name: "erpnext_asset_get",
    description:
      "Get a single Asset by name. Returns full details including depreciation schedule and maintenance logs.",
    category: "assets",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Asset name (ID)" },
      },
      required: ["name"],
    },
    handler: async (input, ctx) => {
      if (!input.name) {
        throw new Error("[erpnext_asset_get] 'name' is required");
      }
      const doc = await ctx.client.get("Asset", input.name as string);
      return { data: doc };
    },
  },

  {
    name: "erpnext_asset_create",
    description:
      "Create a new Asset record. Requires asset_name, asset_category, company, purchase_date, " +
      "gross_purchase_amount. Optionally set location, custodian, item_code.",
    category: "assets",
    inputSchema: {
      type: "object",
      properties: {
        asset_name: { type: "string", description: "Name/description of the asset" },
        asset_category: { type: "string", description: "Asset category (e.g. Computers, Vehicles)" },
        company: { type: "string", description: "Company owning the asset" },
        purchase_date: { type: "string", description: "Purchase date YYYY-MM-DD" },
        gross_purchase_amount: { type: "number", description: "Purchase cost (before depreciation)" },
        item_code: { type: "string", description: "Linked item code (optional)" },
        location: { type: "string", description: "Physical location of the asset" },
        custodian: { type: "string", description: "Employee responsible for the asset" },
      },
      required: ["asset_name", "asset_category", "company", "purchase_date", "gross_purchase_amount"],
    },
    handler: async (input, ctx) => {
      if (!input.asset_name) {
        throw new Error("[erpnext_asset_create] 'asset_name' is required");
      }
      if (!input.asset_category) {
        throw new Error("[erpnext_asset_create] 'asset_category' is required");
      }
      if (!input.company) {
        throw new Error("[erpnext_asset_create] 'company' is required");
      }
      if (!input.purchase_date) {
        throw new Error("[erpnext_asset_create] 'purchase_date' is required");
      }
      if (input.gross_purchase_amount == null) {
        throw new Error("[erpnext_asset_create] 'gross_purchase_amount' is required");
      }

      const doc = await ctx.client.create("Asset", {
        asset_name: input.asset_name as string,
        asset_category: input.asset_category as string,
        company: input.company as string,
        purchase_date: input.purchase_date as string,
        gross_purchase_amount: input.gross_purchase_amount as number,
        item_code: (input.item_code as string) ?? undefined,
        location: (input.location as string) ?? undefined,
        custodian: (input.custodian as string) ?? undefined,
      });

      return {
        data: doc,
        message: `Asset ${doc.name} created successfully`,
      };
    },
  },

  // ── Asset Movement ────────────────────────────────────────────────────────

  {
    name: "erpnext_asset_movement_list",
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
    description:
      "List Asset Movements (transfers between locations/custodians). " +
      "Fields: name, transaction_date, purpose, company.",
    category: "assets",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default 20)" },
        purpose: {
          type: "string",
          description: "Filter by purpose (Issue, Transfer, Receipt)",
        },
        date_from: { type: "string", description: "Transaction date from YYYY-MM-DD" },
        date_to: { type: "string", description: "Transaction date to YYYY-MM-DD" },
      },
    },
    handler: async (input, ctx) => {
      const limit = (input.limit as number) ?? 20;
      const filters: FrappeFilter[] = [];
      if (input.purpose) {
        filters.push(["purpose", "=", input.purpose as string]);
      }
      if (input.date_from) {
        filters.push(["transaction_date", ">=", input.date_from as string]);
      }
      if (input.date_to) {
        filters.push(["transaction_date", "<=", input.date_to as string]);
      }

      const docs = await ctx.client.list("Asset Movement", {
        fields: ["name", "transaction_date", "purpose", "company"],
        filters,
        limit,
        order_by: "modified desc",
      });

      return {
        doctype: "Asset Movement",
        count: docs.length,
        data: docs,
        _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
      };
    },
  },

  {
    name: "erpnext_asset_movement_get",
    description:
      "Get a single Asset Movement by name. Returns full details including assets moved.",
    category: "assets",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Asset Movement name (ID)" },
      },
      required: ["name"],
    },
    handler: async (input, ctx) => {
      if (!input.name) {
        throw new Error("[erpnext_asset_movement_get] 'name' is required");
      }
      const doc = await ctx.client.get("Asset Movement", input.name as string);
      return { data: doc };
    },
  },

  // ── Asset Maintenance ─────────────────────────────────────────────────────

  {
    name: "erpnext_asset_maintenance_list",
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
    description:
      "List Asset Maintenance records. Filterable by asset_name, maintenance_status. " +
      "Fields: name, asset_name, asset_category, maintenance_team, maintenance_status.",
    category: "assets",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default 20)" },
        asset_name: { type: "string", description: "Filter by asset name" },
        maintenance_status: {
          type: "string",
          description: "Filter by status (Planned, Overdue, Cancelled, Completed)",
        },
      },
    },
    handler: async (input, ctx) => {
      const limit = (input.limit as number) ?? 20;
      const filters: FrappeFilter[] = [];
      if (input.asset_name) {
        filters.push(["asset_name", "=", input.asset_name as string]);
      }
      if (input.maintenance_status) {
        filters.push(["maintenance_status", "=", input.maintenance_status as string]);
      }

      const docs = await ctx.client.list("Asset Maintenance", {
        fields: [
          "name",
          "asset_name",
          "asset_category",
          "maintenance_team",
          "maintenance_status",
        ],
        filters,
        limit,
        order_by: "modified desc",
      });

      return {
        doctype: "Asset Maintenance",
        count: docs.length,
        data: docs,
        _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
      };
    },
  },

  {
    name: "erpnext_asset_maintenance_get",
    description:
      "Get a single Asset Maintenance record by name. Returns full details including maintenance tasks.",
    category: "assets",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Asset Maintenance name (ID)" },
      },
      required: ["name"],
    },
    handler: async (input, ctx) => {
      if (!input.name) {
        throw new Error("[erpnext_asset_maintenance_get] 'name' is required");
      }
      const doc = await ctx.client.get("Asset Maintenance", input.name as string);
      return { data: doc };
    },
  },

  // ── Asset Categories ──────────────────────────────────────────────────────

  {
    name: "erpnext_asset_category_list",
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
    description:
      "List Asset Categories. " +
      "Fields: name, asset_category_name.",
    category: "assets",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default 20)" },
      },
    },
    handler: async (input, ctx) => {
      const limit = (input.limit as number) ?? 20;

      const docs = await ctx.client.list("Asset Category", {
        fields: ["name", "asset_category_name"],
        filters: [],
        limit,
        order_by: "modified desc",
      });

      return {
        doctype: "Asset Category",
        count: docs.length,
        data: docs,
        _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
      };
    },
  },
];
