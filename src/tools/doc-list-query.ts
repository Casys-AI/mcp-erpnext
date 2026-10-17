/**
 * Query contract shared by the tools that forward Frappe `get_list` filters
 * (`erpnext_doc_list`, `erpnext_stock_entry_list`).
 *
 * - `FRAPPE_FILTERS_INPUT_SCHEMA`: the portable JSON Schema advertised to hosts.
 *   Arity and value types are checked by `parseFrappeFilters`, not by the schema.
 * - `parsePagination`: `limit` / `offset` semantics aligned on Frappe.
 * - `planListQuery`: the `order_by` / `group_by` sent to Frappe once a filter
 *   targets a child table (LEFT JOIN).
 *
 * Frappe references (versions 14, 15, 16):
 * - `frappe/utils/data.py: get_filter` accepts 3 elements
 *   (`[field, operator, value]`), 4 elements
 *   (`[doctype, field, operator, value]`) and silently truncates longer lists
 *   to the first 4; it throws below 3.
 * - `frappe/api/v1.py: document_list` (`frappe/api/api.py` in v14) sends
 *   `limit` as `limit_page_length`; `frappe/model/db_query.py: add_limit` emits
 *   no LIMIT clause (and therefore ignores the offset) when it is 0.
 * - `db_query.py: validate_order_by_and_group_by` only lets
 *   `[a-z0-9-_ ,`'".()]` through and requires a qualified column's table to be
 *   part of the query, which `` `tab<Doctype>` `` always is.
 *
 * @module lib/erpnext/tools/doc-list-query
 */

import type { FrappeFilter } from "../api/types.ts";
import type { JSONSchema } from "./types.ts";
import { ToolInputError } from "./errors.ts";

export const DOC_LIST_DEFAULT_LIMIT = 20;
export const DEFAULT_ORDER_BY = "modified desc";

const FILTER_FORMS =
  "[fieldname, operator, value] or [child doctype, fieldname, operator, value]";

// ── Input schema ────────────────────────────────────────────────────────────

/**
 * Portable `filters` schema: every array has `items`, no `prefixItems`,
 * no `oneOf`, no `type` next to `anyOf`, no type-arrays (see
 * `schema_portability_test.ts` for the host rules behind each constraint).
 * The 3-or-4 arity is deliberately absent: a tuple-precise schema is not
 * portable, so `parseFrappeFilters` enforces it with an `INVALID_FILTER` error.
 */
export const FRAPPE_FILTERS_INPUT_SCHEMA = {
  type: "array",
  description: "Frappe filters: an array of " + FILTER_FORMS + ". " +
    "The 4-element form filters on a child table (e.g. " +
    '["Sales Invoice Item","item_code","=","SKU-1"]). ' +
    "Values may be strings, numbers, booleans or null, or an array of " +
    'strings/numbers for "in" / "not in". ' +
    'Example: [["status","=","Open"],["company","=","Acme"]]. ' +
    "Fewer than 3 elements are rejected with INVALID_FILTER. " +
    "Longer tuples stay accepted for compatibility; Frappe reads only the first 4 elements.",
  items: {
    type: "array",
    items: {
      anyOf: [
        { type: "string" },
        { type: "number" },
        { type: "boolean" },
        { type: "null" },
        {
          type: "array",
          items: { anyOf: [{ type: "string" }, { type: "number" }] },
        },
      ],
    },
  },
  // `anyOf` nodes carry no `type` on purpose (Gemini rejects both together),
  // which the shared `JSONSchema` type cannot express.
} as unknown as JSONSchema;

// ── Filters ─────────────────────────────────────────────────────────────────

function preview(value: unknown): string {
  let text: string;
  try {
    text = JSON.stringify(value) ?? String(value);
  } catch {
    text = String(value);
  }
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

function kind(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isFilterValue(value: unknown): boolean {
  if (value === null || typeof value === "string") return true;
  if (typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  return Array.isArray(value) &&
    value.every((item) =>
      typeof item === "string" ||
      (typeof item === "number" && Number.isFinite(item))
    );
}

/**
 * Validates `filters` as Frappe will read them and returns them untouched.
 *
 * Accepted: entries of 3 elements, 4 elements, or more (Frappe keeps the first
 * 4 — kept for 3.0.x compatibility, so nothing Frappe accepts is rejected here).
 * Rejected: non-array entries, fewer than 3 elements (Frappe throws), and
 * wrongly typed positions.
 */
export function parseFrappeFilters(
  tool: string,
  raw: unknown,
): FrappeFilter[] {
  if (raw === undefined) return [];
  const recovery = `Send filters as an array of ${FILTER_FORMS}, ` +
    'for example [["status","=","Open"]].';
  if (!Array.isArray(raw)) {
    throw new ToolInputError(
      tool,
      "INVALID_FILTER",
      `'filters' must be an array of filter tuples, got ${kind(raw)}`,
      { recovery, context: { received: kind(raw) } },
    );
  }

  raw.forEach((entry, index) => {
    const at = `filters[${index}]`;
    const fail = (detail: string, extra: Record<string, unknown> = {}) => {
      throw new ToolInputError(
        tool,
        "INVALID_FILTER",
        `${at} ${detail} (got ${preview(entry)})`,
        { recovery, context: { index, ...extra } },
      );
    };

    if (!Array.isArray(entry)) {
      fail(`must be an array, got ${kind(entry)}`);
      return;
    }
    if (entry.length < 3) {
      fail(`has ${entry.length} element(s); expected 3 or 4`, {
        arity: entry.length,
      });
      return;
    }
    const child = entry.length >= 4;
    const names = child
      ? ["child doctype", "fieldname", "operator"]
      : ["fieldname", "operator"];
    names.forEach((label, position) => {
      const value = entry[position];
      // An empty operator is legal in Frappe (it defaults to "="), the others
      // must name something.
      const ok = label === "operator"
        ? typeof value === "string"
        : isNonEmptyString(value);
      if (!ok) {
        fail(
          `has an invalid ${label} at position ${position}: expected a ${
            label === "operator" ? "string" : "non-empty string"
          }, got ${
            value === "" || (typeof value === "string" && !value.trim())
              ? "empty string"
              : kind(value)
          }`,
          { position },
        );
      }
    });
    const valuePosition = child ? 3 : 2;
    if (!isFilterValue(entry[valuePosition])) {
      fail(
        `has an invalid value at position ${valuePosition}: expected a string, ` +
          "number, boolean, null, or an array of strings/numbers",
        { position: valuePosition },
      );
    }
  });

  return raw as FrappeFilter[];
}

// ── Pagination ──────────────────────────────────────────────────────────────

export interface Pagination {
  limit: number;
  offset?: number;
}

/**
 * `limit` / `offset` as Frappe reads them: no server-side ceiling, and
 * `limit = 0` means "every row" — in which case Frappe drops the offset and
 * would return the first rows again, so that combination is refused.
 *
 * The advertised schema (`integer`, `minimum: 0`) already rejects most of this
 * on the wire; these checks cover programmatic callers and unsafe integers.
 */
export function parsePagination(
  tool: string,
  input: { limit?: unknown; offset?: unknown },
): Pagination {
  const invalid = (
    field: "limit" | "offset",
    value: unknown,
  ): never => {
    throw new ToolInputError(
      tool,
      "INVALID_PAGINATION",
      `'${field}' must be a non-negative integer, got ${preview(value)}`,
      {
        recovery: field === "limit"
          ? "Send an integer >= 1 (default 20), or 0 for every row."
          : "Send an integer >= 0, or omit 'offset'.",
        context: { field, value },
      },
    );
  };

  const limit = input.limit === undefined
    ? DOC_LIST_DEFAULT_LIMIT
    : input.limit;
  if (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit < 0) {
    return invalid("limit", input.limit);
  }
  const offset = input.offset;
  if (offset !== undefined) {
    if (
      typeof offset !== "number" || !Number.isSafeInteger(offset) || offset < 0
    ) {
      return invalid("offset", offset);
    }
    if (limit === 0 && offset > 0) {
      throw new ToolInputError(
        tool,
        "INVALID_PAGINATION",
        `'limit' 0 means "every row" in Frappe, which then ignores 'offset' ` +
          `(${offset}) and would return the wrong rows`,
        {
          recovery:
            "Use a positive 'limit' together with 'offset', or drop 'offset' when 'limit' is 0.",
          context: { limit, offset },
        },
      );
    }
    return { limit, offset };
  }
  return { limit };
}

// ── Child-table queries: ordering and de-duplication ────────────────────────

/** Doctype names `db_query.py` lets through once wrapped as `` `tab<name>` ``. */
const QUOTABLE_DOCTYPE = /^[A-Za-z0-9_ -]+$/;
const PLAIN_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
// A bare column, optionally quoted with backticks: `modified` desc.
const BARE_ORDER_CLAUSE = /^`?([A-Za-z_][A-Za-z0-9_]*)`?(?:\s+(asc|desc))?$/i;

function tableOf(doctype: string): string {
  return `\`tab${doctype}\``;
}

/** True when a filter targets another doctype than the listed one (LEFT JOIN). */
export function hasChildTableFilter(
  doctype: string,
  filters: readonly unknown[],
): boolean {
  return filters.some((filter) =>
    Array.isArray(filter) && filter.length >= 4 && filter[0] !== doctype
  );
}

function qualifyOrderBy(doctype: string, orderBy: string): string {
  // Anything with a function call is left to the caller: splitting on commas
  // would misread its arguments as columns.
  if (orderBy.includes("(")) return orderBy;
  return orderBy.split(",").map((clause) => {
    const trimmed = clause.trim();
    const bare = BARE_ORDER_CLAUSE.exec(trimmed);
    return bare
      ? `${tableOf(doctype)}.${bare[1]}${bare[2] ? ` ${bare[2]}` : ""}`
      : trimmed;
  }).join(", ");
}

export interface ListQueryPlan {
  /** Absent means "let Frappe apply the doctype's own default ordering". */
  order_by?: string;
  /** Present only to collapse the rows the child-table join duplicates. */
  group_by?: string;
}

/**
 * Decides the `order_by` / `group_by` to send to Frappe.
 *
 * Without a child-table filter nothing changes: `order_by` is the caller's, or
 * `modified desc`.
 *
 * With one, Frappe LEFT JOINs the child table, which breaks two things:
 * - an unqualified `modified` is ambiguous (MariaDB error 1052, HTTP 500 on
 *   v14/v15), so bare columns are qualified as `` `tab<Doctype>`.<column> ``;
 * - a parent with several matching lines comes back once per line, and each
 *   copy eats the `limit`. Grouping on the parent's primary key returns each
 *   document once (Frappe's REST API has no `distinct`; `group_by` is
 *   forwarded as-is by `frappe.client.get_list`). It is skipped when the
 *   caller selected child columns or expressions, or ordered by one, because
 *   they then want the joined rows.
 *
 * A doctype whose name Frappe's order-by sanitizer would refuse once quoted
 * gets neither: the caller's `order_by` is kept and nothing is grouped.
 */
export function planListQuery(
  doctype: string,
  input: {
    filters: readonly unknown[];
    fields: readonly string[];
    order_by?: string;
  },
): ListQueryPlan {
  const requested = input.order_by;
  if (!hasChildTableFilter(doctype, input.filters)) {
    return { order_by: requested ?? DEFAULT_ORDER_BY };
  }
  if (!QUOTABLE_DOCTYPE.test(doctype)) {
    return requested === undefined ? {} : { order_by: requested };
  }

  const order_by = qualifyOrderBy(doctype, requested ?? DEFAULT_ORDER_BY);
  // An explicit empty ordering means "Frappe's default", same as without joins.
  if (order_by === "") return {};
  const parentColumn = `${tableOf(doctype)}.`;
  const parentOnly =
    input.fields.every((field) =>
      field === "*" || PLAIN_IDENTIFIER.test(field)
    ) &&
    order_by.split(",").every((clause) =>
      clause.trim().startsWith(parentColumn)
    );
  return parentOnly
    ? { order_by, group_by: `${parentColumn}name` }
    : { order_by };
}
