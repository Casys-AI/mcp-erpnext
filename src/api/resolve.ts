/**
 * Link-field resolution.
 *
 * Lets tool handlers accept a human-readable identifier (name, email) for a
 * Frappe Link field and resolve it to the document's actual ID server-side,
 * in the same tool call — instead of requiring the agent to first call a
 * `_list` tool to look up the ID and then call the target tool with it.
 *
 * @module lib/erpnext/api/resolve
 */

import { FrappeAPIError, type FrappeClient } from "./frappe-client.ts";
import { getCache } from "../cache/cache.ts";

/** How long a confirmed "identifier is not a valid ID" result is remembered. */
const NEGATIVE_CACHE_TTL_MS = 15_000;

/** How many partial-match candidates to fetch when checking for ambiguity. */
const PARTIAL_MATCH_PROBE_LIMIT = 5;

export interface ResolveLinkOptions {
  /** Default true. Pass false on write paths — a fuzzy match there can silently attach the wrong record. */
  allowPartialMatch?: boolean;
}

/**
 * Resolve `identifier` to a document name (ID) within `doctype`: fast-path
 * get(), then exact match on `searchField`, then partial match (unless
 * `allowPartialMatch` is false). A partial match only resolves silently when
 * it's unique; multiple candidates throw with the list instead of guessing.
 */
export async function resolveLink(
  client: FrappeClient,
  doctype: string,
  identifier: string,
  searchField: string,
  options: ResolveLinkOptions = {},
): Promise<string> {
  const { allowPartialMatch = true } = options;
  const cache = getCache();
  const missKey = `resolve:miss:${doctype}:${identifier}`;

  if (cache.get<boolean>(missKey) === undefined) {
    try {
      await client.get(doctype, identifier);
      return identifier;
    } catch (e) {
      if (!(e instanceof FrappeAPIError) || e.status !== 404) throw e;
      cache.set(missKey, true, NEGATIVE_CACHE_TTL_MS);
    }
  }

  const exact = await client.list(doctype, {
    filters: [[searchField, "=", identifier]],
    fields: ["name"],
    limit: 1,
  });
  if (exact.length > 0) return exact[0].name as string;

  if (allowPartialMatch) {
    const partial = await client.list(doctype, {
      filters: [[searchField, "like", `%${identifier}%`]],
      fields: ["name", searchField],
      limit: PARTIAL_MATCH_PROBE_LIMIT,
    });
    if (partial.length === 1) return partial[0].name as string;
    if (partial.length > 1) {
      const candidates = partial
        .map((r) => `${r.name} (${r[searchField]})`)
        .join(", ");
      const suffix = partial.length === PARTIAL_MATCH_PROBE_LIMIT
        ? ", and possibly more"
        : "";
      throw new Error(
        `[resolveLink] Ambiguous ${doctype} identifier "${identifier}": ` +
          `did you mean ${candidates}${suffix}? Please pass an exact value.`,
      );
    }
  }

  throw new Error(`[resolveLink] No ${doctype} found matching "${identifier}"`);
}

export function resolveEmployee(
  client: FrappeClient,
  identifier: string,
): Promise<string> {
  return resolveLink(client, "Employee", identifier, "employee_name");
}

export function resolveCustomer(
  client: FrappeClient,
  identifier: string,
): Promise<string> {
  return resolveLink(client, "Customer", identifier, "customer_name");
}

export function resolveSupplier(
  client: FrappeClient,
  identifier: string,
): Promise<string> {
  return resolveLink(client, "Supplier", identifier, "supplier_name");
}

export function resolveItem(
  client: FrappeClient,
  identifier: string,
): Promise<string> {
  return resolveLink(client, "Item", identifier, "item_name");
}

/** Human-readable name field per doctype, for dynamic-link resolution. */
const DYNAMIC_LINK_SEARCH_FIELDS: Record<string, string> = {
  Customer: "customer_name",
  Supplier: "supplier_name",
  Employee: "employee_name",
  Lead: "lead_name",
};

/**
 * Resolve a dynamic-link field, e.g. Payment Entry's `party` (target doctype
 * given by `party_type`). Target doctype isn't known until the companion
 * field's value is read at the call site. Falls back to passing `identifier`
 * through unresolved for doctypes not in `DYNAMIC_LINK_SEARCH_FIELDS`.
 */
export async function resolveDynamicLink(
  client: FrappeClient,
  targetDoctype: string,
  identifier: string,
  options: ResolveLinkOptions = {},
): Promise<string> {
  const searchField = DYNAMIC_LINK_SEARCH_FIELDS[targetDoctype];
  if (!searchField) return identifier;
  return resolveLink(client, targetDoctype, identifier, searchField, options);
}
