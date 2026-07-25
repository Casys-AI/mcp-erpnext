/**
 * ERPNext Setup Tools
 *
 * MCP tools for instance setup and master data: companies, UOMs, item groups, etc.
 * These are prerequisites for all other ERPNext operations.
 *
 * @module lib/erpnext/tools/setup
 */

import type { FrappeFilter } from "../api/types.ts";
import type { ErpNextTool, ErpNextToolContext } from "./types.ts";
import { DOCLIST_META } from "./viewer-meta.ts";

/** Outcome of a single `erpnext_setup_check` probe. */
interface SetupCheck {
  /** Stable identifier, safe for an agent to branch on. */
  id: string;
  /** What the probe verifies, in human terms. */
  label: string;
  /**
   * `ok` — prerequisite satisfied.
   * `missing` — prerequisite absent; transactional documents will fail.
   * `error` — the probe itself could not run (permissions, network).
   */
  status: "ok" | "missing" | "error";
  /** Number of matching documents found (0 when `missing`, absent on `error`). */
  found?: number;
  /** Sample of matching document names, capped at 5. */
  examples?: string[];
  /** Why this matters, and what breaks without it. */
  detail: string;
  /** Concrete next step — the tool to call, with the doctype to create. */
  fix?: string;
  /** Probe failure message, present only when `status` is `error`. */
  error?: string;
}

/** The prerequisite probes, in the order a fresh instance must satisfy them. */
const SETUP_PROBES: Array<{
  id: string;
  label: string;
  doctype: string;
  filters?: FrappeFilter[];
  detail: string;
  fix: string;
}> = [
  {
    id: "company",
    label: "At least one Company",
    doctype: "Company",
    detail:
      "Every transactional document is scoped to a Company. Without one, " +
      "no Sales Order, Sales Invoice or Stock Entry can be created.",
    fix:
      "erpnext_company_create({ company_name, abbr, default_currency, country })",
  },
  {
    id: "selling_price_list",
    label: "An enabled selling Price List",
    doctype: "Price List",
    filters: [["selling", "=", 1], ["enabled", "=", 1]],
    detail: "Sales Order and Quotation creation fails with " +
      "`MandatoryError: selling_price_list` when none exists. ERPNext " +
      "normally ships 'Standard Selling'; a fresh instance that skipped the " +
      "setup wizard may not have it.",
    fix:
      'erpnext_doc_create({ doctype: "Price List", data: { price_list_name: "Standard Selling", selling: 1, enabled: 1, currency: "<company currency>" } })',
  },
  {
    id: "buying_price_list",
    label: "An enabled buying Price List",
    doctype: "Price List",
    filters: [["buying", "=", 1], ["enabled", "=", 1]],
    detail: "Purchase Order and Purchase Invoice creation fails with " +
      "`MandatoryError: buying_price_list` when none exists. ERPNext " +
      "normally ships 'Standard Buying'.",
    fix:
      'erpnext_doc_create({ doctype: "Price List", data: { price_list_name: "Standard Buying", buying: 1, enabled: 1, currency: "<company currency>" } })',
  },
  {
    id: "warehouse",
    label: "At least one leaf Warehouse",
    doctype: "Warehouse",
    filters: [["is_group", "=", 0]],
    detail: "Submitting a Sales Order that contains stock items requires a " +
      "warehouse on each row. Group warehouses cannot hold stock, so only " +
      "leaf warehouses count. Creating a Company normally auto-creates them.",
    fix:
      'erpnext_doc_create({ doctype: "Warehouse", data: { warehouse_name, company, is_group: 0 } })',
  },
  {
    id: "item_group",
    label: "At least one Item Group",
    doctype: "Item Group",
    detail:
      "`item_group` is mandatory on Item. Without one, erpnext_item_create " +
      "fails.",
    fix:
      'erpnext_doc_create({ doctype: "Item Group", data: { item_group_name, parent_item_group: "All Item Groups", is_group: 0 } })',
  },
  {
    id: "uom",
    label: "At least one UOM",
    doctype: "UOM",
    detail:
      "`stock_uom` is mandatory on Item. ERPNext ships a standard set (Nos, " +
      "Kg, Unit); this only fails on a genuinely empty instance.",
    fix: 'erpnext_doc_create({ doctype: "UOM", data: { uom_name: "Nos" } })',
  },
];

/**
 * Run one probe. A probe that cannot execute is reported as `status: "error"`
 * rather than aborting the whole check — surfacing which prerequisite could
 * not be verified is the entire point of a diagnostic tool. The underlying
 * message is preserved verbatim in `error`, never swallowed.
 */
async function runProbe(
  probe: typeof SETUP_PROBES[number],
  ctx: ErpNextToolContext,
): Promise<SetupCheck> {
  const base = { id: probe.id, label: probe.label, detail: probe.detail };
  try {
    const docs = await ctx.client.list(probe.doctype, {
      fields: ["name"],
      filters: probe.filters,
      limit: 5,
    });
    return docs.length > 0
      ? {
        ...base,
        status: "ok",
        found: docs.length,
        examples: docs.map((doc) => doc.name),
      }
      : { ...base, status: "missing", found: 0, fix: probe.fix };
  } catch (err) {
    return {
      ...base,
      status: "error",
      error: err instanceof Error ? err.message : String(err),
      fix: probe.fix,
    };
  }
}

export const setupTools: ErpNextTool[] = [
  // ── Diagnostics ────────────────────────────────────────────────────────────

  {
    name: "erpnext_setup_check",
    annotations: { readOnlyHint: true },
    description:
      "Check that an ERPNext instance has the master data required before " +
      "transactional documents can be created: a Company, enabled selling " +
      "and buying Price Lists, a leaf Warehouse, an Item Group, and a UOM. " +
      "Returns per-prerequisite status plus the tool call that fixes each " +
      "missing one. Run this first on a fresh instance, or when a create/" +
      "submit fails with a MandatoryError.",
    category: "setup",
    inputSchema: { type: "object", properties: {} },
    handler: async (_input, ctx) => {
      const checks = await Promise.all(
        SETUP_PROBES.map((probe) => runProbe(probe, ctx)),
      );

      const missing = checks.filter((c) => c.status === "missing");
      const failed = checks.filter((c) => c.status === "error");
      const ready = missing.length === 0 && failed.length === 0;

      let summary: string;
      if (ready) {
        summary =
          "Instance is ready: all setup prerequisites are present. Transactional documents can be created.";
      } else if (failed.length > 0) {
        summary =
          `${failed.length} prerequisite(s) could not be verified (${
            failed.map((c) => c.id).join(", ")
          })` +
          (missing.length > 0
            ? `; ${missing.length} confirmed missing (${
              missing.map((c) => c.id).join(", ")
            }).`
            : ". Readiness is unknown until they can be read.");
      } else {
        summary = `${missing.length} prerequisite(s) missing: ${
          missing.map((c) => c.id).join(", ")
        }. Create them before attempting transactional documents — see 'fix' on each check.`;
      }

      return {
        ready,
        summary,
        checks,
        missing: missing.map((c) => c.id),
        unverified: failed.map((c) => c.id),
      };
    },
  },

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
