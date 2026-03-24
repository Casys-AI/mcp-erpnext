/**
 * Sales Tools Tests
 *
 * Tests for the ERPNext sales MCP tools.
 * Injects a mock FrappeClient to avoid real network calls.
 *
 * @module lib/erpnext/tests/tools/sales_test
 */

import { assertEquals, assertRejects } from "jsr:@std/assert";
import { salesTools } from "../../src/tools/sales.ts";
import { FrappeClient } from "../../src/api/frappe-client.ts";
import type { ErpNextToolContext } from "../../src/tools/types.ts";

// ── Mock FrappeClient ─────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
type AnyFn = (...args: any[]) => any;

function makeMockClient(overrides: Record<string, AnyFn> = {}): FrappeClient {
  const mock: Record<string, AnyFn> = {
    list: async () => [],
    get: async () => ({ name: "TEST-001" }),
    create: async (_doctype: string, data: unknown) => ({
      name: "SO-NEW-001",
      ...(data as object),
    }),
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
  const tool = salesTools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool;
}

// ── erpnext_customer_list ─────────────────────────────────────────────────────

Deno.test("erpnext_customer_list - returns formatted result", async () => {
  const mockClient = makeMockClient({
    list: async (doctype: string) => {
      assertEquals(doctype, "Customer");
      return [
        { name: "CUST-001", customer_name: "Acme Corp", disabled: 0 },
        { name: "CUST-002", customer_name: "Globex", disabled: 0 },
      ];
    },
  });

  const tool = getTool("erpnext_customer_list");
  const result = await tool.handler({}, makeCtx(mockClient)) as Record<string, unknown>;

  assertEquals(result.count, 2);
  assertEquals((result.data as unknown[]).length, 2);
  assertEquals((result._meta as { ui: { resourceUri: string } }).ui.resourceUri, "ui://mcp-erpnext/doclist-viewer");
});

Deno.test("erpnext_customer_list - passes limit parameter", async () => {
  let capturedLimit = 0;
  const mockClient = makeMockClient({
    list: async (_doctype: string, opts: { limit?: number }) => {
      capturedLimit = opts?.limit ?? 0;
      return [];
    },
  });

  const tool = getTool("erpnext_customer_list");
  await tool.handler({ limit: 5 }, makeCtx(mockClient));

  assertEquals(capturedLimit, 5);
});

Deno.test("erpnext_customer_list - filters disabled by default", async () => {
  let capturedFilters: unknown[][] = [];
  const mockClient = makeMockClient({
    list: async (_doctype: string, opts: { filters?: unknown[][] }) => {
      capturedFilters = opts?.filters ?? [];
      return [];
    },
  });

  const tool = getTool("erpnext_customer_list");
  await tool.handler({}, makeCtx(mockClient));

  const hasDisabledFilter = capturedFilters.some(
    (f) => f[0] === "disabled" && f[1] === "=" && f[2] === 0,
  );
  assertEquals(hasDisabledFilter, true);
});

// ── erpnext_sales_order_get ───────────────────────────────────────────────────

Deno.test("erpnext_sales_order_get - throws if name missing", async () => {
  const tool = getTool("erpnext_sales_order_get");
  await assertRejects(
    () => tool.handler({}, makeCtx(makeMockClient())),
    Error,
    "name",
  );
});

Deno.test("erpnext_sales_order_get - returns sales order data", async () => {
  const mockClient = makeMockClient({
    get: async (doctype: string, name: string) => {
      assertEquals(doctype, "Sales Order");
      assertEquals(name, "SO-001");
      return {
        name: "SO-001",
        customer: "CUST-001",
        grand_total: 2500,
        items: [{ item_code: "ITEM-001", qty: 5, rate: 500, amount: 2500 }],
      };
    },
  });

  const tool = getTool("erpnext_sales_order_get");
  const result = await tool.handler({ name: "SO-001" }, makeCtx(mockClient)) as Record<string, unknown>;

  // Tool returns { data: doc } — _meta optional
  const doc = (result.data ?? result) as Record<string, unknown>;
  assertEquals(doc.name, "SO-001");
  assertEquals(doc.customer, "CUST-001");
});

// ── erpnext_sales_order_create ────────────────────────────────────────────────

Deno.test("erpnext_sales_order_create - throws if customer missing", async () => {
  const tool = getTool("erpnext_sales_order_create");
  await assertRejects(
    () => tool.handler({ items: [] }, makeCtx(makeMockClient())),
    Error,
    "customer",
  );
});

Deno.test("erpnext_sales_order_create - throws if items missing", async () => {
  const tool = getTool("erpnext_sales_order_create");
  await assertRejects(
    () => tool.handler({ customer: "CUST-001" }, makeCtx(makeMockClient())),
    Error,
    "items",
  );
});

Deno.test("erpnext_sales_order_create - creates order successfully", async () => {
  let createdData: Record<string, unknown> = {};
  const mockClient = makeMockClient({
    create: async (doctype: string, data: Record<string, unknown>) => {
      assertEquals(doctype, "Sales Order");
      createdData = data;
      return { name: "SO-NEW-001", ...data };
    },
  });

  const tool = getTool("erpnext_sales_order_create");
  const result = await tool.handler(
    {
      customer: "CUST-001",
      items: [{ item_code: "ITEM-001", qty: 2, rate: 100 }],
      delivery_date: "2026-03-01",
    },
    makeCtx(mockClient),
  ) as Record<string, unknown>;

  // Tool returns { data: doc, message: "..." }
  const doc = (result.data ?? result) as Record<string, unknown>;
  assertEquals(doc.name, "SO-NEW-001");
  assertEquals(createdData.customer, "CUST-001");
});

// ── erpnext_sales_invoice_list ────────────────────────────────────────────────

Deno.test("erpnext_sales_invoice_list - returns invoices with _meta.ui", async () => {
  const mockClient = makeMockClient({
    list: async (doctype: string) => {
      assertEquals(doctype, "Sales Invoice");
      return [
        { name: "SINV-001", customer: "CUST-001", grand_total: 1000, status: "Paid" },
      ];
    },
  });

  const tool = getTool("erpnext_sales_invoice_list");
  const result = await tool.handler({}, makeCtx(mockClient)) as Record<string, unknown>;

  assertEquals(result.count, 1);
  // Sales invoices list uses doclist viewer
  assertEquals((result._meta as { ui: { resourceUri: string } }).ui.resourceUri, "ui://mcp-erpnext/doclist-viewer");
});
