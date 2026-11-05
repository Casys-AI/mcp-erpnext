import type { FrappeFilter } from "../api/types.ts";
import { ToolInputError } from "./errors.ts";
import type { JSONSchema } from "./types.ts";

export interface GrossMarginScope {
  company?: string;
  date_from?: string;
  date_to?: string;
}

export interface GrossMarginOptions extends GrossMarginScope {
  allow_partial?: boolean;
}

export const GROSS_MARGIN_SCHEMA: JSONSchema = {
  type: "object",
  properties: {
    allow_partial: {
      type: "boolean",
      default: false,
      description:
        "Opt in to an estimate on lines with readable Bin valuations only. Missing valuations are reported separately with revenue coverage; strict behavior is the default.",
    },
    company: {
      type: "string",
      minLength: 1,
      description:
        "Company name. Required when matching orders span multiple companies.",
    },
    date_from: {
      type: "string",
      description: "Start order date YYYY-MM-DD (inclusive)",
    },
    date_to: {
      type: "string",
      description: "End order date YYYY-MM-DD (inclusive)",
    },
  },
};

export function parseGrossMarginScope(
  input: Record<string, unknown>,
): GrossMarginOptions {
  const scope: GrossMarginOptions = {};
  if (input.allow_partial !== undefined) {
    if (typeof input.allow_partial !== "boolean") {
      throw new ToolInputError(
        "erpnext_kpi_gross_margin",
        "INVALID_INPUT",
        "'allow_partial' must be a boolean",
        {
          recovery:
            "Pass true to request a partial estimate, false for strict behavior, or omit it.",
          context: { field: "allow_partial" },
        },
      );
    }
    scope.allow_partial = input.allow_partial;
  }
  for (const field of ["company", "date_from", "date_to"] as const) {
    const raw = input[field];
    if (raw === undefined) continue;
    const value = typeof raw === "string" ? raw.trim() : "";
    const date = field === "company"
      ? undefined
      : new Date(`${value}T00:00:00Z`);
    if (
      !value || (date && (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(date.getTime()) ||
        date.toISOString().slice(0, 10) !== value))
    ) {
      throw new ToolInputError(
        "erpnext_kpi_gross_margin",
        "INVALID_INPUT",
        `Invalid '${field}'`,
        {
          recovery: field === "company"
            ? "Pass a non-empty company name or omit it."
            : "Pass a valid calendar date in YYYY-MM-DD format or omit it.",
          context: { field },
        },
      );
    }
    scope[field] = value;
  }
  if (scope.date_from && scope.date_to && scope.date_from > scope.date_to) {
    throw new ToolInputError(
      "erpnext_kpi_gross_margin",
      "INVALID_INPUT",
      "'date_from' is after 'date_to'",
      {
        recovery: "Pass a start date on or before the end date.",
        context: { field: "date_from" },
      },
    );
  }
  return scope;
}

export function grossMarginOrderFilters(
  scope: GrossMarginScope,
): FrappeFilter[] {
  return [
    ["docstatus", "!=", 2],
    ...(scope.company ? [["company", "=", scope.company] as FrappeFilter] : []),
    ...(scope.date_from
      ? [["transaction_date", ">=", scope.date_from] as FrappeFilter]
      : []),
    ...(scope.date_to
      ? [["transaction_date", "<=", scope.date_to] as FrappeFilter]
      : []),
  ];
}
