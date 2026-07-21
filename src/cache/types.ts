/**
 * Cache abstraction.
 *
 * Pluggable seam: MemoryCache is the default in-process implementation;
 * a future backend (e.g. Redis) implements the same interface.
 *
 * @module lib/erpnext/cache/types
 */

export interface Cache {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T, ttlMs: number): void;
  delete(key: string): void;
  deleteByPrefix(prefix: string): void;
  clear(): void;
}
