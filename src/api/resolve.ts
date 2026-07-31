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
 * How many candidates to fetch per match rung when checking for ambiguity.
 * `EXACT_MATCH_PROBE_LIMIT` only needs to distinguish "unique" from
 * "ambiguous" (2 is enough); the partial rung's error message lists
 * candidates for the caller, so it fetches a few more.
 */
const EXACT_MATCH_PROBE_LIMIT = 2;
const PARTIAL_MATCH_PROBE_LIMIT = 5;

export interface ResolveLinkOptions {
  /** Default true. Pass false on write paths — a fuzzy match there can silently attach the wrong record. */
  allowPartialMatch?: boolean;
  /** Top-level tool input field to replace when an MCP client disambiguates via MRTR. */
  inputPath?: string;
}

export interface LinkCandidate {
  id: string;
  label: string;
}

/** Structured ambiguity used by the MCP layer to offer a safe MRTR choice. */
export class AmbiguousLinkError extends Error {
  readonly doctype: string;
  readonly identifier: string;
  readonly inputPath?: string;
  readonly candidates: LinkCandidate[];
  readonly truncated: boolean;

  constructor(options: {
    message: string;
    doctype: string;
    identifier: string;
    inputPath?: string;
    candidates: LinkCandidate[];
    truncated: boolean;
  }) {
    super(options.message);
    this.name = "AmbiguousLinkError";
    this.doctype = options.doctype;
    this.identifier = options.identifier;
    this.inputPath = options.inputPath;
    this.candidates = options.candidates;
    this.truncated = options.truncated;
  }
}

/**
 * Run a `searchField <op> value` list() query, probing up to `probeLimit`
 * rows. Returns the name on a unique hit, `undefined` on no match, and
 * throws an ambiguity error (listing candidates) when more than one row
 * matches — display-name fields like `customer_name` aren't unique in
 * ERPNext, so "matches" is not the same as "safe to resolve silently".
 */
async function resolveUnique(
  client: FrappeClient,
  doctype: string,
  identifier: string,
  searchField: string,
  op: "=" | "like",
  value: string,
  probeLimit: number,
  ambiguityHint: string,
  inputPath?: string,
): Promise<string | undefined> {
  const rows = await client.list(doctype, {
    filters: [[searchField, op, value]],
    fields: ["name", searchField],
    limit: probeLimit,
  });
  if (rows.length === 0) return undefined;
  if (rows.length === 1) return rows[0].name as string;

  const candidates = rows.map((row) => ({
    id: String(row.name),
    label: String(row[searchField] ?? row.name),
  }));
  const candidateText = candidates.map(({ id, label }) => `${id} (${label})`)
    .join(", ");
  const truncated = rows.length === probeLimit;
  const suffix = truncated ? ", and possibly more" : "";
  throw new AmbiguousLinkError({
    message: `[resolveLink] Ambiguous ${doctype} identifier "${identifier}": ` +
      `did you mean ${candidateText}${suffix}? ${ambiguityHint}`,
    doctype,
    identifier,
    inputPath,
    candidates,
    truncated,
  });
}

/**
 * Resolve `identifier` to a document name (ID) within `doctype`: fast-path
 * get(), then exact match on `searchField`, then partial match (unless
 * `allowPartialMatch` is false). Both the exact and partial rungs only
 * resolve silently when the match is unique; multiple candidates throw with
 * the list instead of guessing — display-name fields aren't unique keys, so
 * even an "exact" name match can hit more than one document.
 */
export async function resolveLink(
  client: FrappeClient,
  doctype: string,
  identifier: string,
  searchField: string,
  options: ResolveLinkOptions = {},
): Promise<string> {
  const { allowPartialMatch = true, inputPath } = options;
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

  const exact = await resolveUnique(
    client,
    doctype,
    identifier,
    searchField,
    "=",
    identifier,
    EXACT_MATCH_PROBE_LIMIT,
    "Please pass the record's ID directly.",
    inputPath,
  );
  if (exact !== undefined) return exact;

  if (allowPartialMatch) {
    const partial = await resolveUnique(
      client,
      doctype,
      identifier,
      searchField,
      "like",
      `%${identifier}%`,
      PARTIAL_MATCH_PROBE_LIMIT,
      "Please pass an exact value.",
      inputPath,
    );
    if (partial !== undefined) return partial;
  }

  throw new Error(`[resolveLink] No ${doctype} found matching "${identifier}"`);
}

export function resolveEmployee(
  client: FrappeClient,
  identifier: string,
  options: ResolveLinkOptions = {},
): Promise<string> {
  return resolveLink(client, "Employee", identifier, "employee_name", options);
}

export function resolveCustomer(
  client: FrappeClient,
  identifier: string,
  options: ResolveLinkOptions = {},
): Promise<string> {
  return resolveLink(client, "Customer", identifier, "customer_name", options);
}

export function resolveSupplier(
  client: FrappeClient,
  identifier: string,
  options: ResolveLinkOptions = {},
): Promise<string> {
  return resolveLink(client, "Supplier", identifier, "supplier_name", options);
}

export function resolveItem(
  client: FrappeClient,
  identifier: string,
  options: ResolveLinkOptions = {},
): Promise<string> {
  return resolveLink(client, "Item", identifier, "item_name", options);
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
