/**
 * Method Allowlist — gates `erpnext_method_call` against ERPNEXT_METHOD_ALLOWLIST.
 *
 * Deny-by-default: with the variable unset, no method is callable. `*` opts
 * a session fully in. Entries are either an exact dotted path or a
 * `prefix.*` wildcard matching any method under that module prefix.
 *
 * @module lib/erpnext/tools/method-allowlist
 */

import { env } from "../runtime.ts";

const METHOD_PATH_RE = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;

/** Validates a dotted Frappe method path (no wildcard, no leading/trailing dot). */
export function isValidMethodPath(method: string): boolean {
  return METHOD_PATH_RE.test(method);
}

function parseAllowlist(raw: string | undefined): string[] {
  if (!raw || !raw.trim()) return [];
  return raw.split(",").map((entry) => entry.trim()).filter(Boolean);
}

/**
 * Returns true if `method` is permitted by `allowlist`.
 * Each allowlist entry is either an exact match or a `prefix.*` wildcard.
 */
export function isMethodAllowed(method: string, allowlist: string[]): boolean {
  for (const entry of allowlist) {
    if (entry === "*") return true;
    if (entry === method) return true;
    if (entry.endsWith(".*")) {
      const prefix = entry.slice(0, -1); // keep trailing "."
      if (method.startsWith(prefix) && method.length > prefix.length) {
        return true;
      }
    }
  }
  return false;
}

/** Reads and parses ERPNEXT_METHOD_ALLOWLIST from the environment. */
export function loadMethodAllowlist(): string[] {
  return parseAllowlist(env("ERPNEXT_METHOD_ALLOWLIST"));
}

/** Enforce the same environment policy at confirmation and invocation time. */
export function allowedMethod(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(
      "[erpnext_method_call] 'method' must be a non-empty dotted path",
    );
  }
  const method = value.trim();
  if (!isValidMethodPath(method)) {
    throw new Error(
      `[erpnext_method_call] 'method' is not a valid dotted path: '${method}'`,
    );
  }

  const allowlist = loadMethodAllowlist();
  if (!isMethodAllowed(method, allowlist)) {
    throw new Error(
      `[erpnext_method_call] '${method}' is not permitted. Add it (or a ` +
        "'prefix.*' covering it) to ERPNEXT_METHOD_ALLOWLIST, or set " +
        "ERPNEXT_METHOD_ALLOWLIST=* to allow any method.",
    );
  }
  return method;
}
