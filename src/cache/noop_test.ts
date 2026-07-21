/**
 * NoopCache Tests
 *
 * @module lib/erpnext/tests/cache/noop_test
 */

import { assertEquals } from "@std/assert";
import { NoopCache } from "./noop.ts";

Deno.test("NoopCache - get always returns undefined, even right after set", () => {
  const cache = new NoopCache();
  cache.set("a", "value", 1000);
  assertEquals(cache.get("a"), undefined);
});

Deno.test("NoopCache - delete is a no-op that doesn't throw", () => {
  const cache = new NoopCache();
  cache.set("a", "value", 1000);
  cache.delete("a");
  assertEquals(cache.get("a"), undefined);
});

Deno.test("NoopCache - deleteByPrefix is a no-op that doesn't throw", () => {
  const cache = new NoopCache();
  cache.set("list:Customer:x", [1], 1000);
  cache.deleteByPrefix("list:Customer:");
  assertEquals(cache.get("list:Customer:x"), undefined);
});

Deno.test("NoopCache - clear is a no-op that doesn't throw", () => {
  const cache = new NoopCache();
  cache.set("a", "value", 1000);
  cache.clear();
  assertEquals(cache.get("a"), undefined);
});
