/**
 * Cache Singleton Tests
 *
 * @module lib/erpnext/tests/cache/cache_test
 */

import { assertEquals, assertStrictEquals } from "@std/assert";
import { getCache, setCache } from "./cache.ts";
import { MemoryCache } from "./memory.ts";

Deno.test("getCache() - returns the same instance across calls", () => {
  setCache(new MemoryCache());
  const a = getCache();
  const b = getCache();
  assertStrictEquals(a, b);
});

Deno.test("setCache() - overrides the singleton", () => {
  const custom = new MemoryCache();
  custom.set("marker", "custom", 1000);
  setCache(custom);
  assertStrictEquals(getCache(), custom);

  const other = new MemoryCache();
  setCache(other);
  assertStrictEquals(getCache(), other);
  assertEquals(getCache().get("marker"), undefined);
});
