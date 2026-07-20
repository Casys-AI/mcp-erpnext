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

/**
 * Resolve `identifier` to a document name (ID) within `doctype`.
 *
 * 1. Fast path: `identifier` may already be the real ID — try get() directly.
 * 2. Exact match on `searchField` (e.g. "employee_name" = identifier).
 * 3. Partial match on `searchField` (e.g. "employee_name" like %identifier%).
 *
 * Throws if none of the three resolve to a document. The exact/partial list()
 * calls go through FrappeClient's cache, so repeated resolution of the same
 * identifier within the cache TTL costs nothing extra there.
 *
 * The fast-path get() is different: when `identifier` is a human name (not a
 * real ID), it always 404s, and FrappeClient only caches successful reads —
 * so that 404 would otherwise be re-fetched over the network on every call.
 * We remember confirmed 404s ourselves (keyed by doctype+identifier, app-wide
 * cache) so repeat resolution of a known-not-an-ID name skips straight to the
 * list() fallback instead of re-probing get().
 */
export async function resolveLink(
  client: FrappeClient,
  doctype: string,
  identifier: string,
  searchField: string,
): Promise<string> {
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

  const partial = await client.list(doctype, {
    filters: [[searchField, "like", `%${identifier}%`]],
    fields: ["name"],
    limit: 1,
  });
  if (partial.length > 0) return partial[0].name as string;

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
 * given by `party_type`) or Quotation/Opportunity's `party_name` (target
 * doctype given by `quotation_to`/`opportunity_from`). Unlike the fixed
 * wrappers above, the target doctype isn't known until the companion field's
 * value is read at the call site.
 */
export async function resolveDynamicLink(
  client: FrappeClient,
  targetDoctype: string,
  identifier: string,
): Promise<string> {
  const searchField = DYNAMIC_LINK_SEARCH_FIELDS[targetDoctype];
  if (!searchField) {
    throw new Error(
      `[resolveDynamicLink] Unsupported dynamic-link target doctype "${targetDoctype}"`,
    );
  }
  return resolveLink(client, targetDoctype, identifier, searchField);
}
