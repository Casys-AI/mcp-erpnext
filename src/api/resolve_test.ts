/**
 * Link Resolution Tests
 *
 * @module lib/erpnext/tests/api/resolve_test
 */

import { assertEquals, assertRejects } from "@std/assert";
import { resolveDynamicLink, resolveEmployee, resolveLink } from "./resolve.ts";
import { FrappeAPIError, type FrappeClient } from "./frappe-client.ts";
import { setCache } from "../cache/cache.ts";
import { MemoryCache } from "../cache/memory.ts";

// deno-lint-ignore no-explicit-any
type AnyFn = (...args: any[]) => any;

function makeMockClient(overrides: Record<string, AnyFn> = {}): FrappeClient {
  const mock: Record<string, AnyFn> = {
    get: async () => {
      throw new FrappeAPIError("not found", 404, null);
    },
    list: async () => [],
    ...overrides,
  };
  return mock as unknown as FrappeClient;
}

Deno.test("resolveLink - fast path: identifier is already a valid ID", async () => {
  setCache(new MemoryCache());
  const client = makeMockClient({
    get: async (_doctype: string, name: string) => ({ name }),
  });
  const result = await resolveLink(
    client,
    "Employee",
    "HR-EMP-00001",
    "employee_name",
  );
  assertEquals(result, "HR-EMP-00001");
});

Deno.test("resolveLink - falls back to exact match on search field", async () => {
  setCache(new MemoryCache());
  const client = makeMockClient({
    list: async (_doctype: string, options: { filters?: unknown[] }) => {
      const [field, op] = (options.filters?.[0] as [string, string, string]) ??
        [];
      if (field === "employee_name" && op === "=") {
        return [{ name: "HR-EMP-00002" }];
      }
      return [];
    },
  });
  const result = await resolveEmployee(client, "John Doe");
  assertEquals(result, "HR-EMP-00002");
});

Deno.test("resolveLink - falls back to partial match when exact match misses", async () => {
  setCache(new MemoryCache());
  const client = makeMockClient({
    list: async (_doctype: string, options: { filters?: unknown[] }) => {
      const [, op] = (options.filters?.[0] as [string, string, string]) ?? [];
      if (op === "like") return [{ name: "HR-EMP-00003" }];
      return [];
    },
  });
  const result = await resolveEmployee(client, "John");
  assertEquals(result, "HR-EMP-00003");
});

Deno.test("resolveLink - throws when nothing matches", async () => {
  setCache(new MemoryCache());
  const client = makeMockClient();
  await assertRejects(
    () => resolveEmployee(client, "Nobody"),
    Error,
    'No Employee found matching "Nobody"',
  );
});

Deno.test("resolveLink - rethrows non-404 errors from the fast-path get", async () => {
  setCache(new MemoryCache());
  const client = makeMockClient({
    get: async () => {
      throw new FrappeAPIError("server error", 500, null);
    },
  });
  await assertRejects(
    () => resolveEmployee(client, "HR-EMP-00001"),
    FrappeAPIError,
  );
});

Deno.test("resolveLink - caches a confirmed 404 so repeat calls skip the get() probe", async () => {
  setCache(new MemoryCache());
  let getCount = 0;
  let listCount = 0;
  const client = makeMockClient({
    get: async () => {
      getCount++;
      throw new FrappeAPIError("not found", 404, null);
    },
    list: async (_doctype: string, options: { filters?: unknown[] }) => {
      listCount++;
      const [field, op] = (options.filters?.[0] as [string, string, string]) ??
        [];
      if (field === "employee_name" && op === "=") {
        return [{ name: "HR-EMP-00002" }];
      }
      return [];
    },
  });

  await resolveEmployee(client, "John Doe");
  await resolveEmployee(client, "John Doe");

  assertEquals(
    getCount,
    1,
    "second call should skip the fast-path get() probe",
  );
  assertEquals(
    listCount,
    2,
    "list() fallback still runs each call (not memoized itself)",
  );
});

Deno.test("resolveDynamicLink - resolves against the target doctype's search field", async () => {
  setCache(new MemoryCache());
  const client = makeMockClient({
    list: async (doctype: string, options: { filters?: unknown[] }) => {
      const [field, , value] =
        (options.filters?.[0] as [string, string, string]) ?? [];
      if (
        doctype === "Supplier" && field === "supplier_name" &&
        value === "Acme Supplies"
      ) {
        return [{ name: "SUPP-00042" }];
      }
      return [];
    },
  });
  const result = await resolveDynamicLink(client, "Supplier", "Acme Supplies");
  assertEquals(result, "SUPP-00042");
});

Deno.test("resolveDynamicLink - throws for an unsupported target doctype", async () => {
  const client = makeMockClient();
  await assertRejects(
    () => resolveDynamicLink(client, "Not A Real Doctype", "whatever"),
    Error,
    'Unsupported dynamic-link target doctype "Not A Real Doctype"',
  );
});

Deno.test("resolveDynamicLink - supports Customer, Employee, and Lead targets", async () => {
  setCache(new MemoryCache());
  const searchFieldByDoctype: Record<string, string> = {
    Customer: "customer_name",
    Employee: "employee_name",
    Lead: "lead_name",
  };
  for (const [doctype, searchField] of Object.entries(searchFieldByDoctype)) {
    const client = makeMockClient({
      list: async (dt: string, options: { filters?: unknown[] }) => {
        const [field] = (options.filters?.[0] as [string, string, string]) ??
          [];
        if (dt === doctype && field === searchField) {
          return [{ name: `${doctype}-ID` }];
        }
        return [];
      },
    });
    const result = await resolveDynamicLink(client, doctype, "some name");
    assertEquals(result, `${doctype}-ID`);
  }
});
