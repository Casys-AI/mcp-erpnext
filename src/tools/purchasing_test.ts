/**
 * Purchasing Tools Tests
 *
 * Tests for erpnext_supplier_create and other purchasing tools.
 *
 * @module lib/erpnext/tests/tools/purchasing_test
 */

import { assertEquals, assertRejects } from "@std/assert";
import { AmbiguousLinkError } from "../api/resolve.ts";
import { purchasingTools } from "./purchasing.ts";
import { FrappeAPIError, type FrappeClient } from "../api/frappe-client.ts";
import type { ErpNextToolContext } from "./types.ts";

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
    () =>
      tool.handler({ supplier_group: "Hardware" }, makeCtx(makeMockClient())),
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
  assertEquals(tool._meta?.ui?.resourceUri, "ui://mcp-erpnext/doclist-viewer");
});

// ── erpnext_purchase_order_create ───────────────────────────────────────────

Deno.test("erpnext_purchase_order_create - throws if supplier missing", async () => {
  const tool = getTool("erpnext_purchase_order_create");
  await assertRejects(
    () =>
      tool.handler(
        { items: [{ item_code: "X", qty: 1, rate: 10 }] },
        makeCtx(makeMockClient()),
      ),
    Error,
    "supplier",
  );
});

// ── erpnext_supplier_quotation_list ─────────────────────────────────────────

Deno.test("erpnext_supplier_quotation_list - filters by date range", async () => {
  let capturedFilters: unknown[][] = [];
  const client = makeMockClient({
    list: async (_doctype: string, opts: { filters?: unknown[][] }) => {
      capturedFilters = opts?.filters ?? [];
      return [];
    },
  });

  const tool = getTool("erpnext_supplier_quotation_list");
  await tool.handler(
    { date_from: "2026-01-01", date_to: "2026-01-31" },
    makeCtx(client),
  );

  const hasStart = capturedFilters.some(
    (f) =>
      f[0] === "transaction_date" && f[1] === ">=" && f[2] === "2026-01-01",
  );
  const hasEnd = capturedFilters.some(
    (f) =>
      f[0] === "transaction_date" && f[1] === "<=" && f[2] === "2026-01-31",
  );
  assertEquals(hasStart, true);
  assertEquals(hasEnd, true);
});

// ── write-path link resolution ──────────────────────────────────────────────

Deno.test("erpnext_purchase_order_create - accepts a supplier name, not just an ID", async () => {
  // The list counterpart already resolved human-readable names while the create
  // handler required the opaque ID, so an agent asked to "order from Acme
  // Supplies" could not succeed at all — Frappe 404s on the display name.
  //
  // resolveLink probes get() first, so an ID still passes straight through; this
  // covers the name path that used to fail.
  let created: Record<string, unknown> | undefined;
  const mockClient = makeMockClient({
    get: async (_doctype: string, name: string) => {
      // Unknown as an ID — this is what a display name does.
      if (name === "Acme Supplies") {
        throw new FrappeAPIError("Not Found", 404, null);
      }
      return { name };
    },
    list: async (doctype: string) =>
      doctype === "Supplier"
        ? [{ name: "SUPP-00031", supplier_name: "Acme Supplies" }]
        : [],
    create: async (_doctype: string, data: unknown) => {
      created = data as Record<string, unknown>;
      return { name: "PO-00001", ...(data as object) };
    },
  });

  const tool = getTool("erpnext_purchase_order_create");
  await tool.handler(
    {
      supplier: "Acme Supplies",
      items: [{ item_code: "ITEM-A", qty: 2, rate: 10 }],
    },
    makeCtx(mockClient),
  );

  assertEquals(created?.supplier, "SUPP-00031");
});

Deno.test("erpnext_purchase_order_create - refuses to guess between two suppliers", async () => {
  // The invariant that matters on a write path: two candidates must abort, never
  // pick one. A purchase order attached to the wrong supplier is not something
  // the agent can discover afterwards.
  //
  // This is why the handler passes allowPartialMatch: false — the convenience
  // wrapper used by the list tools defaults it to true, which would silently
  // fuzzy-match here.
  let createCalled = false;
  const mockClient = makeMockClient({
    get: async (_doctype: string, name: string) => {
      if (name === "Acme") throw new FrappeAPIError("Not Found", 404, null);
      return { name };
    },
    list: async (doctype: string) =>
      doctype === "Supplier"
        ? [
          { name: "SUPP-00031", supplier_name: "Acme" },
          { name: "SUPP-00087", supplier_name: "Acme" },
        ]
        : [],
    create: async () => {
      createCalled = true;
      return { name: "PO-00001" };
    },
  });

  const tool = getTool("erpnext_purchase_order_create");
  const error = await assertRejects(
    () =>
      tool.handler(
        { supplier: "Acme", items: [{ item_code: "ITEM-A", qty: 1, rate: 5 }] },
        makeCtx(mockClient),
      ),
    AmbiguousLinkError,
  );

  assertEquals(createCalled, false, "must not create against a guess");
  assertEquals(error.inputPath, "supplier");
  // The agent recovers by re-calling with an ID, which it can only do if the
  // candidates are named.
  assertEquals(error.message.includes("SUPP-00031"), true);
  assertEquals(error.message.includes("SUPP-00087"), true);
});
