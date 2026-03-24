/**
 * Setup Tools Tests
 *
 * Tests for erpnext_company_list and erpnext_company_create.
 *
 * @module lib/erpnext/tests/tools/setup_test
 */

import { assertEquals, assertRejects } from "jsr:@std/assert";
import { setupTools } from "../../src/tools/setup.ts";
import { FrappeClient } from "../../src/api/frappe-client.ts";
import type { ErpNextToolContext } from "../../src/tools/types.ts";

// deno-lint-ignore no-explicit-any
type AnyFn = (...args: any[]) => any;

function makeMockClient(overrides: Record<string, AnyFn> = {}): FrappeClient {
  const mock: Record<string, AnyFn> = {
    list: async () => [],
    get: async () => ({ name: "TEST-001" }),
    create: async (_doctype: string, data: unknown) => ({
      name: "New Company",
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
  const tool = setupTools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool;
}

// ── erpnext_company_list ────────────────────────────────────────────────────

Deno.test("erpnext_company_list - returns formatted result with _meta.ui", async () => {
  const mockClient = makeMockClient({
    list: async (doctype: string) => {
      assertEquals(doctype, "Company");
      return [
        { name: "Casys Industries", abbr: "CI", default_currency: "EUR", country: "France" },
      ];
    },
  });

  const tool = getTool("erpnext_company_list");
  const result = await tool.handler({}, makeCtx(mockClient)) as Record<string, unknown>;

  assertEquals(result.count, 1);
  assertEquals((result.data as unknown[]).length, 1);
  assertEquals((result._meta as { ui: { resourceUri: string } }).ui.resourceUri, "ui://mcp-erpnext/doclist-viewer");
});

Deno.test("erpnext_company_list - has _meta.ui on tool definition", () => {
  const tool = getTool("erpnext_company_list");
  assertEquals(tool._meta?.ui.resourceUri, "ui://mcp-erpnext/doclist-viewer");
});

Deno.test("erpnext_company_list - passes limit", async () => {
  let capturedLimit = 0;
  const mockClient = makeMockClient({
    list: async (_doctype: string, opts: { limit?: number }) => {
      capturedLimit = opts?.limit ?? 0;
      return [];
    },
  });

  const tool = getTool("erpnext_company_list");
  await tool.handler({ limit: 3 }, makeCtx(mockClient));
  assertEquals(capturedLimit, 3);
});

// ── erpnext_company_create ──────────────────────────────────────────────────

Deno.test("erpnext_company_create - throws if company_name missing", async () => {
  const tool = getTool("erpnext_company_create");
  await assertRejects(
    () => tool.handler({ abbr: "CI", default_currency: "EUR", country: "France" }, makeCtx(makeMockClient())),
    Error,
    "company_name",
  );
});

Deno.test("erpnext_company_create - throws if abbr missing", async () => {
  const tool = getTool("erpnext_company_create");
  await assertRejects(
    () => tool.handler({ company_name: "Test", default_currency: "EUR", country: "France" }, makeCtx(makeMockClient())),
    Error,
    "abbr",
  );
});

Deno.test("erpnext_company_create - throws if default_currency missing", async () => {
  const tool = getTool("erpnext_company_create");
  await assertRejects(
    () => tool.handler({ company_name: "Test", abbr: "T", country: "France" }, makeCtx(makeMockClient())),
    Error,
    "default_currency",
  );
});

Deno.test("erpnext_company_create - throws if country missing", async () => {
  const tool = getTool("erpnext_company_create");
  await assertRejects(
    () => tool.handler({ company_name: "Test", abbr: "T", default_currency: "EUR" }, makeCtx(makeMockClient())),
    Error,
    "country",
  );
});

Deno.test("erpnext_company_create - creates company with all fields", async () => {
  let capturedDoctype = "";
  let capturedData: Record<string, unknown> = {};

  const mockClient = makeMockClient({
    create: async (doctype: string, data: Record<string, unknown>) => {
      capturedDoctype = doctype;
      capturedData = data;
      return { name: "Casys Industries", ...data };
    },
  });

  const tool = getTool("erpnext_company_create");
  const result = await tool.handler(
    {
      company_name: "Casys Industries",
      abbr: "CI",
      default_currency: "EUR",
      country: "France",
      domain: "Manufacturing",
    },
    makeCtx(mockClient),
  ) as Record<string, unknown>;

  assertEquals(capturedDoctype, "Company");
  assertEquals(capturedData.company_name, "Casys Industries");
  assertEquals(capturedData.abbr, "CI");
  assertEquals(capturedData.default_currency, "EUR");
  assertEquals(capturedData.country, "France");
  assertEquals(capturedData.domain, "Manufacturing");

  const doc = result.data as Record<string, unknown>;
  assertEquals(doc.name, "Casys Industries");
  assertEquals(typeof result.message, "string");
});

Deno.test("erpnext_company_create - domain is optional", async () => {
  let capturedData: Record<string, unknown> = {};

  const mockClient = makeMockClient({
    create: async (_doctype: string, data: Record<string, unknown>) => {
      capturedData = data;
      return { name: "Test Co", ...data };
    },
  });

  const tool = getTool("erpnext_company_create");
  await tool.handler(
    { company_name: "Test Co", abbr: "TC", default_currency: "USD", country: "US" },
    makeCtx(mockClient),
  );

  assertEquals(capturedData.domain, undefined);
});
