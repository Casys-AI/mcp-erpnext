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

  // ── Setup Check ────────────────────────────────────────────────────────────

  {
    name: "erpnext_setup_check",
    annotations: { readOnlyHint: true },
    description:
      "Checks a company for the master data transactional documents need " +
      "before they can be created: a Selling and a Buying Price List, at " +
      "least one Warehouse, at least one Item Group, and a given set of " +
      "UOMs (Nos and Kg by default). Returns what exists and what is " +
      "missing, so an agent can fix gaps before hitting a MandatoryError " +
      "mid-workflow — most useful right after erpnext_company_create on a " +
      "fresh instance.",
    category: "setup",
    inputSchema: {
      type: "object",
      properties: {
        company: {
          type: "string",
          description:
            "Company name to scope the Warehouse check to (e.g. from erpnext_company_list).",
          minLength: 1,
        },
        required_uoms: {
          type: "array",
          items: { type: "string" },
          description: "UOM names that must exist. Defaults to ['Nos', 'Kg'].",
        },
      },
      required: ["company"],
    },
    handler: async (input, ctx) => {
      if (typeof input.company !== "string" || !input.company.trim()) {
        throw new Error(
          "[erpnext_setup_check] 'company' must be a non-empty string",
        );
      }
      const company = input.company.trim();

      let requiredUoms = ["Nos", "Kg"];
      if (input.required_uoms !== undefined) {
        if (
          !Array.isArray(input.required_uoms) ||
          input.required_uoms.some((u) => typeof u !== "string" || !u.trim())
        ) {
          throw new Error(
            "[erpnext_setup_check] 'required_uoms' must be an array of non-empty strings",
          );
        }
        requiredUoms = (input.required_uoms as string[]).map((u) => u.trim());
      }

      // Existence-only queries (limit: 1) — a count is not needed to answer
      // "does at least one exist", and asking for one avoids Frappe's default
      // 20-row page silently hiding a match past the first page.
      const [
        sellingPriceLists,
        buyingPriceLists,
        warehouses,
        itemGroups,
        uoms,
      ] = await Promise.all([
        ctx.client.list<{ name: string }>("Price List", {
          filters: [["enabled", "=", 1], ["selling", "=", 1]],
          fields: ["name"],
          limit: 1,
        }),
        ctx.client.list<{ name: string }>("Price List", {
          filters: [["enabled", "=", 1], ["buying", "=", 1]],
          fields: ["name"],
          limit: 1,
        }),
        ctx.client.list<{ name: string }>("Warehouse", {
          filters: [["company", "=", company]],
          fields: ["name"],
          limit: 1,
        }),
        ctx.client.list<{ name: string }>("Item Group", {
          fields: ["name"],
          limit: 1,
        }),
        // requiredUoms may exceed Frappe's default 20-row page — request
        // exactly as many rows as names being checked.
        ctx.client.list<{ name: string }>("UOM", {
          filters: [["name", "in", requiredUoms]],
          fields: ["name"],
          limit: Math.max(requiredUoms.length, 1),
        }),
      ]);

      const hasSellingPriceList = sellingPriceLists.length > 0;
      const hasBuyingPriceList = buyingPriceLists.length > 0;
      const hasWarehouse = warehouses.length > 0;
      const hasItemGroup = itemGroups.length > 0;
      const existingUoms = new Set(uoms.map((u) => u.name));
      const missingUoms = requiredUoms.filter((u) => !existingUoms.has(u));

      // Only needed for the Price List repair examples below, and only when
      // one of them is actually missing.
      let companyCurrency = "<company default_currency>";
      if (!hasSellingPriceList || !hasBuyingPriceList) {
        const companyDoc = await ctx.client.get<
          { name: string; default_currency?: string }
        >("Company", company);
        if (companyDoc.default_currency) {
          companyCurrency = companyDoc.default_currency;
        }
      }

      const checks = [
        {
          name: "selling_price_list",
          ok: hasSellingPriceList,
          detail: hasSellingPriceList
            ? "At least one enabled selling Price List exists."
            : "No enabled Price List has 'selling' set. " +
              "Create one with erpnext_doc_create({ doctype: 'Price List', " +
              "data: { price_list_name: 'Standard Selling', selling: 1, " +
              `enabled: 1, currency: '${companyCurrency}' } }).`,
        },
        {
          name: "buying_price_list",
          ok: hasBuyingPriceList,
          detail: hasBuyingPriceList
            ? "At least one enabled buying Price List exists."
            : "No enabled Price List has 'buying' set. " +
              "Create one with erpnext_doc_create({ doctype: 'Price List', " +
              "data: { price_list_name: 'Standard Buying', buying: 1, " +
              `enabled: 1, currency: '${companyCurrency}' } }).`,
        },
        {
          name: "warehouse",
          ok: hasWarehouse,
          detail: hasWarehouse
            ? `At least one Warehouse exists for company '${company}'.`
            : `No Warehouse exists for company '${company}'. Create one with ` +
              "erpnext_doc_create({ doctype: 'Warehouse', " +
              `data: { warehouse_name: 'Stores', company: '${company}' } }).`,
        },
        {
          name: "item_group",
          ok: hasItemGroup,
          detail: hasItemGroup
            ? "At least one Item Group exists."
            : "No Item Group exists. Create one with erpnext_doc_create({ " +
              "doctype: 'Item Group', data: { item_group_name: '...' } }).",
        },
        {
          name: "uom",
          ok: missingUoms.length === 0,
          detail: missingUoms.length === 0
            ? `All required UOMs exist (${requiredUoms.join(", ")}).`
            : `Missing UOM(s): ${missingUoms.join(", ")}. Create with ` +
              "erpnext_doc_create({ doctype: 'UOM', data: { uom_name: '...' } }).",
        },
      ];

      const missing = checks.filter((c) => !c.ok).map((c) => c.name);

      return {
        company,
        ready: missing.length === 0,
        missing,
        checks,
      };
    },
  },
];
