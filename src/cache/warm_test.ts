/**
 * Cache Warming Tests
 *
 * @module lib/erpnext/tests/cache/warm_test
 */

import { assertEquals } from "@std/assert";
import { allTools } from "../tools/mod.ts";
import { warmCache } from "./warm.ts";
import { setFrappeClient } from "../api/frappe-client.ts";
import type { FrappeClient } from "../api/frappe-client.ts";

// deno-lint-ignore no-explicit-any
type AnyFn = (...args: any[]) => any;

function makeMockClient(overrides: Record<string, AnyFn> = {}): FrappeClient {
  const mock: Record<string, AnyFn> = {
    list: async () => [],
    get: async () => ({ name: "TEST-001" }),
    create: async () => ({ name: "NEW-001" }),
    update: async () => ({ name: "TEST-001" }),
    delete: async () => {},
    callMethod: async () => null,
    invalidate: () => {},
    ...overrides,
  };
  return mock as unknown as FrappeClient;
}

function withEnv(
  key: string,
  value: string | undefined,
  fn: () => Promise<void>,
) {
  const original = Deno.env.get(key);
  if (value === undefined) Deno.env.delete(key);
  else Deno.env.set(key, value);
  return fn().finally(() => {
    if (original === undefined) Deno.env.delete(key);
    else Deno.env.set(key, original);
  });
}

Deno.test("warmCache - no-op when MCP_CACHE_WARM_TOOLS is unset", async () => {
  await withEnv("MCP_CACHE_WARM_TOOLS", undefined, async () => {
    let listCalled = false;
    setFrappeClient(
      makeMockClient({ list: async () => (listCalled = true, []) }),
    );
    await warmCache();
    assertEquals(listCalled, false);
  });
});

Deno.test("warmCache - calls handler for a configured read-only list tool", async () => {
  await withEnv("MCP_CACHE_WARM_TOOLS", "erpnext_employee_list", async () => {
    let listCalled = false;
    setFrappeClient(
      makeMockClient({ list: async () => (listCalled = true, []) }),
    );
    await warmCache();
    assertEquals(listCalled, true);
  });
});

Deno.test("warmCache - skips an unknown tool name without throwing", async () => {
  await withEnv(
    "MCP_CACHE_WARM_TOOLS",
    "erpnext_totally_fake_tool_xyz",
    async () => {
      setFrappeClient(makeMockClient());
      await warmCache(); // should not throw
    },
  );
});

Deno.test("warmCache - refuses to call a non-read-only tool", async () => {
  await withEnv("MCP_CACHE_WARM_TOOLS", "erpnext_doc_create", async () => {
    let createCalled = false;
    setFrappeClient(
      makeMockClient({ create: async () => (createCalled = true, {}) }),
    );
    await warmCache();
    assertEquals(createCalled, false);
  });
});

Deno.test("warmCache - one tool failing doesn't stop the rest", async () => {
  await withEnv(
    "MCP_CACHE_WARM_TOOLS",
    "erpnext_customer_list,erpnext_employee_list",
    async () => {
      let employeeListCalled = false;
      setFrappeClient(makeMockClient({
        list: async (doctype: string) => {
          if (doctype === "Customer") {
            throw new Error("simulated network failure");
          }
          if (doctype === "Employee") employeeListCalled = true;
          return [];
        },
      }));
      await warmCache(); // should not throw despite Customer list failing
      assertEquals(employeeListCalled, true);
    },
  );
});

Deno.test("warmCache - never runs a tool outside the active selection", async () => {
  await withEnv("MCP_CACHE_WARM_TOOLS", "erpnext_file_list", async () => {
    let called = false;
    setFrappeClient(makeMockClient({
      list: async () => (called = true, []),
      callMethod: async () => (called = true, null),
    }));
    const active = allTools.filter((t) => t.name !== "erpnext_file_list");
    const logs: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => logs.push(args.join(" "));
    try {
      await warmCache(active);
    } finally {
      console.error = original;
    }
    assertEquals(called, false);
    assertEquals(
      logs.some((l) => l.includes("not in active tool selection")),
      true,
    );
  });
});

Deno.test("warmCache - an active read-only tool is still warmed", async () => {
  await withEnv("MCP_CACHE_WARM_TOOLS", "erpnext_employee_list", async () => {
    let listCalled = false;
    setFrappeClient(
      makeMockClient({ list: async () => (listCalled = true, []) }),
    );
    await warmCache(allTools.filter((t) => t.name === "erpnext_employee_list"));
    assertEquals(listCalled, true);
  });
});
