/**
 * Inventory Tools Tests
 *
 * Tests for ERPNext inventory MCP tools (items, stock balance, stock entries,
 * warehouses). Injects a mock FrappeClient to avoid real network calls.
 *
 * @module lib/erpnext/src/tools/inventory_test
 */

// deno-lint-ignore-file no-explicit-any

import { assertEquals, assertRejects } from "@std/assert";
import { ToolInputError } from "./errors.ts";
import { inventoryTools } from "./inventory.ts";
import type { FrappeClient } from "../api/frappe-client.ts";
import type { ErpNextToolContext } from "./types.ts";

type AnyFn = (...args: any[]) => any;

function makeMockClient(overrides: Record<string, AnyFn> = {}): FrappeClient {
  const mock: Record<string, AnyFn> = {
    list: async () => [],
    get: async () => ({ name: "TEST-001" }),
    create: async () => ({ name: "ITEM-NEW-001" }),
    update: async () => ({ name: "TEST-001" }),
    delete: async () => {},
    callMethod: async () => null,
    ...overrides,
  };
  return mock as unknown as FrappeClient;
}

function makeCtx(client: FrappeClient): ErpNextToolContext {
  return { client };
}

function getTool(name: string) {
  const tool = inventoryTools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool;
}

// ── erpnext_item_create ──────────────────────────────────────────────────────

Deno.test("erpnext_item_create - throws if item_code missing", async () => {
  const tool = getTool("erpnext_item_create");
  await assertRejects(
    () => tool.handler({ item_name: "Widget" }, makeCtx(makeMockClient())),
    Error,
    "item_code",
  );
});

Deno.test("erpnext_item_create - throws if item_name missing", async () => {
  const tool = getTool("erpnext_item_create");
  await assertRejects(
    () => tool.handler({ item_code: "WIDGET-1" }, makeCtx(makeMockClient())),
    Error,
    "item_name",
  );
});

Deno.test("erpnext_item_create - forwards optional fields", async () => {
  let capturedData: any;
  const mockClient = makeMockClient({
    create: async (_doctype: string, data: any) => {
      capturedData = data;
      return { name: "WIDGET-1" };
    },
  });

  const tool = getTool("erpnext_item_create");
  await tool.handler(
    {
      item_code: "WIDGET-1",
      item_name: "Widget",
      item_group: "Products",
      is_stock_item: true,
      standard_rate: 25.5,
    },
    makeCtx(mockClient),
  );

  assertEquals(capturedData.item_code, "WIDGET-1");
  assertEquals(capturedData.item_group, "Products");
  assertEquals(capturedData.is_stock_item, true);
  assertEquals(capturedData.standard_rate, 25.5);
});

Deno.test("erpnext_item_create - maps public uom to ERPNext stock_uom", async () => {
  let capturedData: Record<string, unknown> | undefined;
  const mockClient = makeMockClient({
    create: async (_doctype: string, data: Record<string, unknown>) => {
      capturedData = data;
      return { name: "WIDGET-1" };
    },
  });

  const tool = getTool("erpnext_item_create");
  await tool.handler(
    { item_code: "WIDGET-1", item_name: "Widget", uom: "Nos" },
    makeCtx(mockClient),
  );

  assertEquals(capturedData?.stock_uom, "Nos");
  assertEquals(capturedData && "uom" in capturedData, false);
});

// ── erpnext_item_update ──────────────────────────────────────────────────────

Deno.test("erpnext_item_update - requires at least one field beyond name", async () => {
  const tool = getTool("erpnext_item_update");
  await assertRejects(
    () => tool.handler({ name: "WIDGET-1" }, makeCtx(makeMockClient())),
    Error,
    "At least one field",
  );
});

Deno.test("erpnext_item_update - sends only provided fields", async () => {
  let capturedData: any;
  let capturedName: string | undefined;
  const mockClient = makeMockClient({
    update: async (_doctype: string, name: string, data: any) => {
      capturedName = name;
      capturedData = data;
      return { name };
    },
  });

  const tool = getTool("erpnext_item_update");
  await tool.handler(
    { name: "WIDGET-1", standard_rate: 30 },
    makeCtx(mockClient),
  );

  assertEquals(capturedName, "WIDGET-1");
  assertEquals(capturedData, { standard_rate: 30 });
});

// ── erpnext_stock_balance ────────────────────────────────────────────────────

Deno.test("erpnext_stock_balance - applies item_code and warehouse filters", async () => {
  let capturedFilters: unknown;
  const mockClient = makeMockClient({
    list: async (_doctype: string, opts: any) => {
      capturedFilters = opts.filters;
      return [{
        item_code: "WIDGET-1",
        warehouse: "Stores - C",
        actual_qty: 10,
      }];
    },
  });

  const tool = getTool("erpnext_stock_balance");
  const result = await tool.handler(
    { item_code: "WIDGET-1", warehouse: "Stores - C" },
    makeCtx(mockClient),
  ) as any;

  assertEquals(capturedFilters, [
    ["item_code", "=", "WIDGET-1"],
    ["warehouse", "=", "Stores - C"],
  ]);
  assertEquals(result.doctype, "Bin");
  assertEquals(result.count, 1);
});

Deno.test("erpnext_stock_entry_list - declares and applies the exact child item_code filter", async () => {
  let capturedDoctype = "";
  let capturedFilters: unknown;
  const mockClient = makeMockClient({
    list: async (doctype: string, opts: { filters?: unknown }) => {
      capturedDoctype = doctype;
      capturedFilters = opts.filters;
      return [];
    },
  });

  const tool = getTool("erpnext_stock_entry_list");
  assertEquals(
    (tool.inputSchema.properties?.item_code as { type?: string })?.type,
    "string",
  );
  await tool.handler(
    { item_code: "WIDGET-1", stock_entry_type: "Material Issue" },
    makeCtx(mockClient),
  );

  assertEquals(capturedDoctype, "Stock Entry");
  assertEquals(capturedFilters, [
    ["Stock Entry Detail", "item_code", "=", "WIDGET-1"],
    ["stock_entry_type", "=", "Material Issue"],
  ]);
});

Deno.test("erpnext_stock_entry_list - item_code lists each entry once, with a qualified order_by", async () => {
  // A Stock Entry holding the item on two lines matches the Stock Entry Detail
  // join twice; Frappe has no DISTINCT in its REST API, so the tool groups on
  // the parent's primary key. Unqualified `modified desc` is ambiguous on
  // Frappe v14/v15 (HTTP 500, MariaDB 1052).
  let capturedOptions: Record<string, unknown> = {};
  const client = makeMockClient({
    list: async (_doctype: string, opts: Record<string, unknown>) => {
      capturedOptions = opts;
      return [];
    },
  });

  await getTool("erpnext_stock_entry_list").handler(
    { item_code: "WIDGET-1", limit: 10 },
    makeCtx(client),
  );

  assertEquals(capturedOptions.order_by, "`tabStock Entry`.modified desc");
  assertEquals(capturedOptions.group_by, "`tabStock Entry`.name");
  assertEquals(capturedOptions.limit, 10);
});

Deno.test("erpnext_stock_entry_list - without item_code the query is the 3.0.x one", async () => {
  let capturedOptions: Record<string, unknown> = {};
  const client = makeMockClient({
    list: async (_doctype: string, opts: Record<string, unknown>) => {
      capturedOptions = opts;
      return [];
    },
  });

  await getTool("erpnext_stock_entry_list").handler(
    { stock_entry_type: "Material Issue", date_from: "2026-01-01" },
    makeCtx(client),
  );

  assertEquals(capturedOptions.order_by, "modified desc");
  assertEquals("group_by" in capturedOptions, false);
  assertEquals(capturedOptions.limit, 20);
});

Deno.test("erpnext_stock_entry_list - invalid limits fail before any Frappe request", async () => {
  let calls = 0;
  const client = makeMockClient({
    list: async () => {
      calls++;
      return [];
    },
  });
  const tool = getTool("erpnext_stock_entry_list");
  for (
    const limit of [
      -1,
      2.5,
      NaN,
      Infinity,
      Number.MAX_SAFE_INTEGER + 1,
      "10",
      true,
      [],
      {},
    ]
  ) {
    const error = await assertRejects(
      () => tool.handler({ limit }, makeCtx(client)),
      ToolInputError,
    );
    assertEquals(error.code, "INVALID_PAGINATION");
    assertEquals(error.tool, "erpnext_stock_entry_list");
    assertEquals(error.context.field, "limit");
    assertEquals(error.retryable, false);
  }
  assertEquals(calls, 0);
});

Deno.test("erpnext_stock_entry_list - keeps default, unbounded and positive limits", async () => {
  const limits: unknown[] = [];
  const client = makeMockClient({
    list: async (_doctype: string, options: { limit: number }) => {
      limits.push(options.limit);
      return [];
    },
  });
  const tool = getTool("erpnext_stock_entry_list");
  for (const input of [{}, { limit: null }, { limit: 0 }, { limit: 5 }]) {
    await tool.handler(input, makeCtx(client));
  }
  assertEquals(limits, [20, 20, 0, 5]);
  assertEquals(tool.inputSchema.properties?.limit?.type, "number");
});

// ── erpnext_stock_entry_create ───────────────────────────────────────────────

Deno.test("erpnext_stock_entry_create - throws if stock_entry_type missing", async () => {
  const tool = getTool("erpnext_stock_entry_create");
  await assertRejects(
    () =>
      tool.handler({ items: [{ item_code: "X" }] }, makeCtx(makeMockClient())),
    Error,
    "stock_entry_type",
  );
});

Deno.test("erpnext_stock_entry_create - throws if items missing or empty", async () => {
  const tool = getTool("erpnext_stock_entry_create");
  await assertRejects(
    () =>
      tool.handler(
        { stock_entry_type: "Material Receipt", items: [] },
        makeCtx(makeMockClient()),
      ),
    Error,
    "items",
  );
});

// ── Tool registry sanity ────────────────────────────────────────────────────

Deno.test("all inventory tools have name, description, category, handler", () => {
  for (const tool of inventoryTools) {
    assertEquals(typeof tool.name, "string");
    assertEquals(typeof tool.description, "string");
    assertEquals(tool.category, "inventory");
    assertEquals(typeof tool.handler, "function");
  }
});
