/**
 * Purchasing Tools Tests
 *
 * Tests for erpnext_supplier_create and other purchasing tools.
 *
 * @module lib/erpnext/tests/tools/purchasing_test
 */

import { assertEquals, assertRejects } from "jsr:@std/assert";
import { purchasingTools } from "../../src/tools/purchasing.ts";
import { FrappeClient } from "../../src/api/frappe-client.ts";
import type { ErpNextToolContext } from "../../src/tools/types.ts";

// deno-lint-ignore no-explicit-any
type AnyFn = (...args: any[]) => any;

function makeMockClient(overrides: Record<string, AnyFn> = {}): FrappeClient {
  const mock: Record<string, AnyFn> = {
    list: async () => [],
    get: async () => ({ name: "TEST-001" }),
    create: async (_doctype: string, data: unknown) => ({
      name: "NEW-001",
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
  const tool = purchasingTools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool;
}

// ── erpnext_supplier_create ─────────────────────────────────────────────────

Deno.test("erpnext_supplier_create - exists in purchasing tools", () => {
  const tool = getTool("erpnext_supplier_create");
  assertEquals(tool.name, "erpnext_supplier_create");
  assertEquals(tool.category, "purchasing");
});

Deno.test("erpnext_supplier_create - throws if supplier_name missing", async () => {
  const tool = getTool("erpnext_supplier_create");
  await assertRejects(
    () => tool.handler({ supplier_group: "Hardware" }, makeCtx(makeMockClient())),
    Error,
    "supplier_name",
  );
});

Deno.test("erpnext_supplier_create - throws if supplier_group missing", async () => {
  const tool = getTool("erpnext_supplier_create");
  await assertRejects(
    () => tool.handler({ supplier_name: "Farnell" }, makeCtx(makeMockClient())),
    Error,
    "supplier_group",
  );
});

Deno.test("erpnext_supplier_create - creates supplier with required fields", async () => {
  let capturedDoctype = "";
  let capturedData: Record<string, unknown> = {};

  const mockClient = makeMockClient({
    create: async (doctype: string, data: Record<string, unknown>) => {
      capturedDoctype = doctype;
      capturedData = data;
      return { name: "Farnell Electronics", ...data };
    },
  });

  const tool = getTool("erpnext_supplier_create");
  const result = await tool.handler(
    { supplier_name: "Farnell Electronics", supplier_group: "Hardware" },
    makeCtx(mockClient),
  ) as Record<string, unknown>;

  assertEquals(capturedDoctype, "Supplier");
  assertEquals(capturedData.supplier_name, "Farnell Electronics");
  assertEquals(capturedData.supplier_group, "Hardware");
  assertEquals(capturedData.supplier_type, "Company"); // default

  const doc = result.data as Record<string, unknown>;
  assertEquals(doc.name, "Farnell Electronics");
});

Deno.test("erpnext_supplier_create - passes optional fields", async () => {
  let capturedData: Record<string, unknown> = {};

  const mockClient = makeMockClient({
    create: async (_doctype: string, data: Record<string, unknown>) => {
      capturedData = data;
      return { name: "Test Supplier", ...data };
    },
  });

  const tool = getTool("erpnext_supplier_create");
  await tool.handler(
    {
      supplier_name: "Test Supplier",
      supplier_group: "Services",
      supplier_type: "Individual",
      country: "Germany",
      default_currency: "EUR",
    },
    makeCtx(mockClient),
  );

  assertEquals(capturedData.supplier_type, "Individual");
  assertEquals(capturedData.country, "Germany");
  assertEquals(capturedData.default_currency, "EUR");
});

// ── erpnext_supplier_list ───────────────────────────────────────────────────

Deno.test("erpnext_supplier_list - has _meta.ui", () => {
  const tool = getTool("erpnext_supplier_list");
  assertEquals(tool._meta?.ui.resourceUri, "ui://mcp-erpnext/doclist-viewer");
});

// ── erpnext_purchase_order_create ───────────────────────────────────────────

Deno.test("erpnext_purchase_order_create - throws if supplier missing", async () => {
  const tool = getTool("erpnext_purchase_order_create");
  await assertRejects(
    () => tool.handler({ items: [{ item_code: "X", qty: 1, rate: 10 }] }, makeCtx(makeMockClient())),
    Error,
    "supplier",
  );
});
