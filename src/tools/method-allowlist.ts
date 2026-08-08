/**
 * Allowlist gate for the generic whitelisted-method tool.
 *
 * `erpnext_method_call` can reach any method Frappe has whitelisted, which is a
 * far wider surface than the typed tools. That surface is already bounded by the
 * API key's own ERPNext permissions, so the gate is optional: with no
 * ERPNEXT_METHOD_ALLOWLIST set every whitelisted method is reachable, and
 * setting it narrows the server to the listed paths. Use it when one MCP session
 * should reach less than its user is otherwise allowed to.
 *
 * The dotted-path check below is NOT optional. It runs on every call regardless
 * of the allowlist, because the method name is interpolated into the request
 * path.
 *
 * @module lib/erpnext/tools/method-allowlist
 */

import { env } from "../runtime.ts";

/** A Frappe dotted path: `module.submodule.function`, at least two segments. */
const METHOD_PATH = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+$/;

/**
 * The method name is interpolated straight into the request path, so anything
 * outside `[A-Za-z0-9_.]` (`?`, `/`, `#`, whitespace) could rewrite the target
 * endpoint and slip past an allowlist entry. Reject those before the URL is
 * ever built.
 */
export function isValidMethodPath(method: string): boolean {
  return METHOD_PATH.test(method);
}

/** Parse the comma-separated allowlist. Entries are exact paths or `prefix.*`. */
export function parseMethodAllowlist(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(",").map((entry) => entry.trim()).filter((entry) =>
    entry.length > 0
  );
}

/** Read the configured allowlist from the environment. Empty means unrestricted. */
export function getMethodAllowlist(): string[] {
  return parseMethodAllowlist(env("ERPNEXT_METHOD_ALLOWLIST"));
}

/**
 * Match a method against the allowlist. `*` allows everything, `a.b.*` allows
 * everything under `a.b.`, any other entry must match exactly. Matching is
 * case-sensitive because Python import paths are.
 */
export function isMethodAllowed(method: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    if (pattern === "*") return true;
    if (pattern.endsWith(".*")) return method.startsWith(pattern.slice(0, -1));
    return method === pattern;
  });
}
