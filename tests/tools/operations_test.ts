/**
 * Operations Tools Tests
 *
 * Tests for erpnext_doc_create and other generic operation tools.
 *
 * @module lib/erpnext/tests/tools/operations_test
 */

import { assertEquals, assertRejects } from "jsr:@std/assert";
import { operationsTools } from "../../src/tools/operations.ts";
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
  const tool = operationsTools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool;
}

// ── erpnext_doc_create ──────────────────────────────────────────────────────

Deno.test("erpnext_doc_create - exists in operations tools", () => {
  const tool = getTool("erpnext_doc_create");
  assertEquals(tool.name, "erpnext_doc_create");
  assertEquals(tool.category, "operations");
});

Deno.test("erpnext_doc_create - throws if doctype missing", async () => {
  const tool = getTool("erpnext_doc_create");
  await assertRejects(
    () => tool.handler({ data: {} }, makeCtx(makeMockClient())),
    Error,
    "doctype",
  );
});

Deno.test("erpnext_doc_create - throws if data missing", async () => {
  const tool = getTool("erpnext_doc_create");
  await assertRejects(
    () => tool.handler({ doctype: "Item" }, makeCtx(makeMockClient())),
    Error,
    "data",
  );
});

Deno.test("erpnext_doc_create - throws if data is not object", async () => {
  const tool = getTool("erpnext_doc_create");
  await assertRejects(
    () => tool.handler({ doctype: "Item", data: "bad" }, makeCtx(makeMockClient())),
    Error,
    "data",
  );
});

Deno.test("erpnext_doc_create - calls client.create with correct args", async () => {
  let capturedDoctype = "";
  let capturedData: Record<string, unknown> = {};

  const mockClient = makeMockClient({
    create: async (doctype: string, data: Record<string, unknown>) => {
      capturedDoctype = doctype;
      capturedData = data;
      return { name: "Transit", ...data };
    },
  });

  const tool = getTool("erpnext_doc_create");
  const result = await tool.handler(
    {
      doctype: "Warehouse Type",
      data: { name: "Transit", warehouse_type: "Transit" },
    },
    makeCtx(mockClient),
  ) as Record<string, unknown>;

  assertEquals(capturedDoctype, "Warehouse Type");
  assertEquals(capturedData.name, "Transit");
  assertEquals(capturedData.warehouse_type, "Transit");

  const doc = result.data as Record<string, unknown>;
  assertEquals(doc.name, "Transit");
  assertEquals(typeof result.message, "string");
});

Deno.test("erpnext_doc_create - works with Item Group (tree doctype)", async () => {
  const mockClient = makeMockClient({
    create: async (_doctype: string, data: Record<string, unknown>) => ({
      name: "Products",
      ...data,
    }),
  });

  const tool = getTool("erpnext_doc_create");
  const result = await tool.handler(
    {
      doctype: "Item Group",
      data: {
        name: "Products",
        item_group_name: "Products",
        parent_item_group: "All Item Groups",
      },
    },
    makeCtx(mockClient),
  ) as Record<string, unknown>;

  const doc = result.data as Record<string, unknown>;
  assertEquals(doc.name, "Products");
  assertEquals(doc.parent_item_group, "All Item Groups");
});

// ── erpnext_doc_list ────────────────────────────────────────────────────────

Deno.test("erpnext_doc_list - has _meta.ui for doclist-viewer", () => {
  const tool = getTool("erpnext_doc_list");
  assertEquals(tool._meta?.ui.resourceUri, "ui://mcp-erpnext/doclist-viewer");
});

// ── erpnext_doc_update ──────────────────────────────────────────────────────

Deno.test("erpnext_doc_update - throws if doctype missing", async () => {
  const tool = getTool("erpnext_doc_update");
  await assertRejects(
    () => tool.handler({ name: "X", data: {} }, makeCtx(makeMockClient())),
    Error,
    "doctype",
  );
});

// ── erpnext_doc_delete ──────────────────────────────────────────────────────

Deno.test("erpnext_doc_delete - calls client.delete", async () => {
  let deletedDoctype = "";
  let deletedName = "";

  const mockClient = makeMockClient({
    delete: async (doctype: string, name: string) => {
      deletedDoctype = doctype;
      deletedName = name;
    },
  });

  const tool = getTool("erpnext_doc_delete");
  const result = await tool.handler(
    { doctype: "Customer", name: "CUST-001" },
    makeCtx(mockClient),
  ) as Record<string, unknown>;

  assertEquals(deletedDoctype, "Customer");
  assertEquals(deletedName, "CUST-001");
  assertEquals(result.deleted, true);
});
