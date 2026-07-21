/**
 * App-wide cache singleton.
 *
 * Mirrors the getFrappeClient()/setFrappeClient() pattern in
 * src/api/frappe-client.ts. Backend and TTL are configured via env vars:
 *   MCP_CACHE_ENABLED — "false" disables caching (NoopCache). Default: enabled.
 *   MCP_CACHE_TTL_MS   — default TTL in ms for cached entries. Default: 15000.
 *     0 is a valid, explicit value: entries expire immediately (cache
 *     read/write overhead still applies but nothing is ever served stale) —
 *     prefer MCP_CACHE_ENABLED=false to skip that overhead entirely. Any
 *     other invalid value (non-numeric or negative) is logged and falls back
 *     to the default rather than failing silently.
 *
 * @module lib/erpnext/cache/cache
 */

import type { Cache } from "./types.ts";
import { MemoryCache } from "./memory.ts";
import { NoopCache } from "./noop.ts";
import { env } from "../runtime.ts";

export const DEFAULT_CACHE_TTL_MS = 15_000;

let _cache: Cache | null = null;

export function getCacheTtlMs(): number {
  const raw = env("MCP_CACHE_TTL_MS");
  if (raw === undefined) return DEFAULT_CACHE_TTL_MS;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    console.error(
      `[mcp-erpnext] Invalid MCP_CACHE_TTL_MS=${
        JSON.stringify(raw)
      } — must be a non-negative number. Falling back to default (${DEFAULT_CACHE_TTL_MS}ms).`,
    );
    return DEFAULT_CACHE_TTL_MS;
  }
  return parsed;
}

/** Get (or lazily create) the singleton app-wide Cache. */
export function getCache(): Cache {
  if (_cache) return _cache;
  const enabled = env("MCP_CACHE_ENABLED") !== "false";
  _cache = enabled ? new MemoryCache() : new NoopCache();
  return _cache;
}

/** Override the singleton (useful for tests or dependency injection). */
export function setCache(cache: Cache): void {
  _cache = cache;
}
