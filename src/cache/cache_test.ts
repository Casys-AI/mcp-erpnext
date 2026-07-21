/**
 * Cache Singleton Tests
 *
 * @module lib/erpnext/tests/cache/cache_test
 */

import { assertEquals, assertStrictEquals } from "@std/assert";
import {
  DEFAULT_CACHE_TTL_MS,
  getCache,
  getCacheTtlMs,
  setCache,
} from "./cache.ts";
import { MemoryCache } from "./memory.ts";

function withEnv(
  key: string,
  value: string | undefined,
  fn: () => void,
) {
  const original = Deno.env.get(key);
  if (value === undefined) Deno.env.delete(key);
  else Deno.env.set(key, value);
  try {
    fn();
  } finally {
    if (original === undefined) Deno.env.delete(key);
    else Deno.env.set(key, original);
  }
}

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

Deno.test("getCacheTtlMs() - returns the default when MCP_CACHE_TTL_MS is unset", () => {
  withEnv("MCP_CACHE_TTL_MS", undefined, () => {
    assertEquals(getCacheTtlMs(), DEFAULT_CACHE_TTL_MS);
  });
});

Deno.test("getCacheTtlMs() - returns a valid explicit value", () => {
  withEnv("MCP_CACHE_TTL_MS", "5000", () => {
    assertEquals(getCacheTtlMs(), 5000);
  });
});

Deno.test("getCacheTtlMs() - 0 is a valid explicit value (immediate expiry)", () => {
  withEnv("MCP_CACHE_TTL_MS", "0", () => {
    assertEquals(getCacheTtlMs(), 0);
  });
});

Deno.test("getCacheTtlMs() - logs and falls back to the default on a non-numeric value", () => {
  const originalError = console.error;
  let loggedMessage = "";
  console.error = (msg: string) => {
    loggedMessage = msg;
  };
  try {
    withEnv("MCP_CACHE_TTL_MS", "abc", () => {
      assertEquals(getCacheTtlMs(), DEFAULT_CACHE_TTL_MS);
    });
  } finally {
    console.error = originalError;
  }
  assertEquals(loggedMessage.includes("Invalid MCP_CACHE_TTL_MS"), true);
});

Deno.test("getCacheTtlMs() - logs and falls back to the default on a negative value", () => {
  const originalError = console.error;
  let loggedMessage = "";
  console.error = (msg: string) => {
    loggedMessage = msg;
  };
  try {
    withEnv("MCP_CACHE_TTL_MS", "-5", () => {
      assertEquals(getCacheTtlMs(), DEFAULT_CACHE_TTL_MS);
    });
  } finally {
    console.error = originalError;
  }
  assertEquals(loggedMessage.includes("Invalid MCP_CACHE_TTL_MS"), true);
});
