/**
 * ERPNext Setup Tools
 *
 * MCP tools for instance setup and master data: companies, UOMs, item groups, etc.
 * These are prerequisites for all other ERPNext operations.
 *
 * @module lib/erpnext/tools/setup
 */

import type { ErpNextTool } from "./types.ts";

export const setupTools: ErpNextTool[] = [
  // ── Companies ──────────────────────────────────────────────────────────────

  {
    name: "erpnext_company_list",
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
    description:
      "List ERPNext companies. " +
      "Fields: name, abbr, default_currency, country, domain.",
    category: "setup",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default 20)" },
      },
    },
    handler: async (input, ctx) => {
      const limit = (input.limit as number) ?? 20;

      const docs = await ctx.client.list("Company", {
        fields: ["name", "abbr", "default_currency", "country", "domain"],
        limit,
        order_by: "modified desc",
      });

      return {
        doctype: "Company",
        count: docs.length,
        data: docs,
        _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
      };
    },
  },

  {
    name: "erpnext_company_create",
    description:
      "Create an ERPNext Company. Requires company_name, abbr, default_currency, country. " +
      "Prerequisites: Warehouse Type 'Transit' and 'Default' must exist. " +
      "Use erpnext_doc_create to create them first if needed.",
    category: "setup",
    inputSchema: {
      type: "object",
      properties: {
        company_name: { type: "string", description: "Company name" },
        abbr: { type: "string", description: "Abbreviation (e.g. CI for Casys Industries)" },
        default_currency: { type: "string", description: "Currency code (e.g. EUR, USD)" },
        country: { type: "string", description: "Country name (e.g. France, United States)" },
        domain: {
          type: "string",
          description: "Business domain (Manufacturing, Services, Retail, Distribution, Education, etc.)",
        },
      },
      required: ["company_name", "abbr", "default_currency", "country"],
    },
    handler: async (input, ctx) => {
      if (!input.company_name) {
        throw new Error("[erpnext_company_create] 'company_name' is required");
      }
      if (!input.abbr) {
        throw new Error("[erpnext_company_create] 'abbr' is required");
      }
      if (!input.default_currency) {
        throw new Error("[erpnext_company_create] 'default_currency' is required");
      }
      if (!input.country) {
        throw new Error("[erpnext_company_create] 'country' is required");
      }

      const data: Record<string, unknown> = {
        company_name: input.company_name,
        abbr: input.abbr,
        default_currency: input.default_currency,
        country: input.country,
      };
      if (input.domain) data.domain = input.domain;

      const doc = await ctx.client.create("Company", data);

      return {
        data: doc,
        message: `Company ${doc.name} created successfully`,
      };
    },
  },
];
