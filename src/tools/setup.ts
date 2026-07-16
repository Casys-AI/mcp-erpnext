/**
 * ERPNext Setup Tools
 *
 * MCP tools for instance setup and master data: companies, UOMs, item groups, etc.
 * These are prerequisites for all other ERPNext operations.
 *
 * @module lib/erpnext/tools/setup
 */

import type { FrappeFilter } from "../api/types.ts";
import type { ErpNextTool } from "./types.ts";
import { DOCLIST_META } from "./viewer-meta.ts";

export const setupTools: ErpNextTool[] = [
  // ── Users ──────────────────────────────────────────────────────────────────

  {
    name: "erpnext_user_list",
    annotations: { readOnlyHint: true },
    _meta: DOCLIST_META,
    description:
      "List assignable ERPNext users. Defaults to enabled System Users, " +
      "excluding Administrator and Guest — the population valid for document " +
      "assignment (erpnext_doc_assign, task assign_to). " +
      "Fields: name (email), full_name, enabled.",
    category: "setup",
    inputSchema: {
      type: "object",
      properties: {
        search: {
          type: "string",
          description: "Substring match on full name",
        },
        include_disabled: {
          type: "boolean",
          description: "Include disabled users (default false)",
        },
        limit: { type: "number", description: "Max results (default 50)" },
      },
    },
    handler: async (input, ctx) => {
      const limit = (input.limit as number) ?? 50;
      const filters: FrappeFilter[] = [
        ["user_type", "=", "System User"],
        ["name", "not in", ["Administrator", "Guest"]],
      ];
      if (!input.include_disabled) {
        filters.push(["enabled", "=", 1]);
      }
      if (input.search) {
        // Escape LIKE wildcards so search is a literal substring match.
        const literal = (input.search as string).replace(
          /[\\%_]/g,
          (match) => `\\${match}`,
        );
        filters.push(["full_name", "like", `%${literal}%`]);
      }

      const docs = await ctx.client.list("User", {
        fields: ["name", "full_name", "enabled"],
        filters,
        limit,
        order_by: "full_name asc",
      });

      return {
        doctype: "User",
        count: docs.length,
        data: docs,
        _meta: DOCLIST_META,
      };
    },
  },

  // ── Companies ──────────────────────────────────────────────────────────────

  {
    name: "erpnext_company_list",
    annotations: { readOnlyHint: true },
    _meta: DOCLIST_META,
    description: "List ERPNext companies. " +
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
        _meta: DOCLIST_META,
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
        abbr: {
          type: "string",
          description: "Abbreviation (e.g. CI for Casys Industries)",
        },
        default_currency: {
          type: "string",
          description: "Currency code (e.g. EUR, USD)",
        },
        country: {
          type: "string",
          description: "Country name (e.g. France, United States)",
        },
        domain: {
          type: "string",
          description:
            "Business domain (Manufacturing, Services, Retail, Distribution, Education, etc.)",
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
        throw new Error(
          "[erpnext_company_create] 'default_currency' is required",
        );
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
