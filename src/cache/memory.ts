/**
 * In-memory TTL cache.
 *
 * Zero-dependency, hand-rolled Map with lazy expiry (checked on read/write,
 * no background timers) so behavior is identical on Deno and Node.
 *
 * @module lib/erpnext/cache/memory
 */

import type { Cache } from "./types.ts";

interface Entry {
  value: unknown;
  expiresAt: number;
}

export class MemoryCache implements Cache {
  private store = new Map<string, Entry>();

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    // Clone on every read: callers get an independent copy, so mutating a
    // returned doc/array (e.g. a future `docs.sort()` or `doc.x = ...`)
    // can't corrupt what later callers read back within the TTL.
    return structuredClone(entry.value) as T;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  deleteByPrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  clear(): void {
    this.store.clear();
  }
}
