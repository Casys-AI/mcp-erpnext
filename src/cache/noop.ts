/**
 * No-op cache — every read misses, every write is discarded.
 *
 * Lets caching be fully disabled via config (MCP_CACHE_ENABLED=false)
 * without branching inside FrappeClient.
 *
 * @module lib/erpnext/cache/noop
 */

import type { Cache } from "./types.ts";

export class NoopCache implements Cache {
  get<T>(_key: string): T | undefined {
    return undefined;
  }
  set<T>(_key: string, _value: T, _ttlMs: number): void {}
  delete(_key: string): void {}
  deleteByPrefix(_prefix: string): void {}
  clear(): void {}
}
