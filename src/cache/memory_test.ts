/**
 * MemoryCache Tests
 *
 * @module lib/erpnext/tests/cache/memory_test
 */

import { assertEquals } from "@std/assert";
import { MemoryCache } from "./memory.ts";

Deno.test("MemoryCache - set/get round trip", () => {
  const cache = new MemoryCache();
  cache.set("a", { foo: "bar" }, 1000);
  assertEquals(cache.get<{ foo: string }>("a"), { foo: "bar" });
});

Deno.test("MemoryCache - get returns undefined for missing key", () => {
  const cache = new MemoryCache();
  assertEquals(cache.get("missing"), undefined);
});

Deno.test("MemoryCache - entry expires after ttlMs", async () => {
  const cache = new MemoryCache();
  cache.set("a", "value", 10);
  assertEquals(cache.get("a"), "value");
  await new Promise((r) => setTimeout(r, 20));
  assertEquals(cache.get("a"), undefined);
});

Deno.test("MemoryCache - delete removes a single key", () => {
  const cache = new MemoryCache();
  cache.set("a", 1, 1000);
  cache.set("b", 2, 1000);
  cache.delete("a");
  assertEquals(cache.get("a"), undefined);
  assertEquals(cache.get("b"), 2);
});

Deno.test("MemoryCache - deleteByPrefix clears only matching keys", () => {
  const cache = new MemoryCache();
  cache.set("list:Customer:x", [1], 1000);
  cache.set("list:Customer:y", [2], 1000);
  cache.set("get:Customer:CUST-001", { name: "CUST-001" }, 1000);
  cache.deleteByPrefix("list:Customer:");
  assertEquals(cache.get("list:Customer:x"), undefined);
  assertEquals(cache.get("list:Customer:y"), undefined);
  assertEquals(cache.get("get:Customer:CUST-001"), { name: "CUST-001" });
});

Deno.test("MemoryCache - clear removes everything", () => {
  const cache = new MemoryCache();
  cache.set("a", 1, 1000);
  cache.set("b", 2, 1000);
  cache.clear();
  assertEquals(cache.get("a"), undefined);
  assertEquals(cache.get("b"), undefined);
});
