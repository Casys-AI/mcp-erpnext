/**
 * Accounting Tools Tests
 *
 * Tests for ERPNext accounting MCP tools (accounts, journal entries,
 * payment entries). Injects a mock FrappeClient to avoid real network calls.
 *
 * @module lib/erpnext/tests/tools/accounting_test
 */

// deno-lint-ignore-file no-explicit-any

import { assertEquals, assertRejects } from "@std/assert";
import { accountingTools } from "./accounting.ts";
import { FrappeAPIError, type FrappeClient } from "../api/frappe-client.ts";
import type { ErpNextToolContext } from "./types.ts";

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

function makeCtx(client: FrappeClient): ErpNextToolContext {
  return { client };
}

function getTool(name: string) {
  const tool = accountingTools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool;
}

// ── erpnext_payment_entry_list ───────────────────────────────────────────────

Deno.test("erpnext_payment_entry_list - throws if party set without party_type", async () => {
  const tool = getTool("erpnext_payment_entry_list");
  await assertRejects(
    () => tool.handler({ party: "Acme Corp" }, makeCtx(makeMockClient())),
    Error,
    "party_type",
  );
});

Deno.test("erpnext_payment_entry_list - resolves party against the party_type doctype", async () => {
  let resolvedDoctype = "";
  const client = makeMockClient({
    get: async () => {
      throw new FrappeAPIError("not found", 404, null);
    },
    list: async (doctype: string) => {
      if (doctype === "Payment Entry") return [];
      resolvedDoctype = doctype;
      return [{ name: "SUPP-007" }];
    },
  });

  const tool = getTool("erpnext_payment_entry_list");
  await tool.handler(
    { party: "Acme Supplies", party_type: "Supplier" },
    makeCtx(client),
  );

  assertEquals(resolvedDoctype, "Supplier");
});

Deno.test("erpnext_payment_entry_list - works without party/party_type at all", async () => {
  const tool = getTool("erpnext_payment_entry_list");
  const result = await tool.handler({}, makeCtx(makeMockClient())) as Record<
    string,
    unknown
  >;
  assertEquals(result.doctype, "Payment Entry");
});

// ── erpnext_account_list ─────────────────────────────────────────────────────

Deno.test("erpnext_account_list - returns chart of accounts with doclist meta", async () => {
  const mockClient = makeMockClient({
    list: async () => [
      { name: "Cash - C", account_name: "Cash", root_type: "Asset" },
      {
        name: "Sales - C",
        account_name: "Sales",
        root_type: "Income",
      },
    ],
  });

  const tool = getTool("erpnext_account_list");
  const result = await tool.handler({}, makeCtx(mockClient)) as any;

  assertEquals(result.doctype, "Account");
  assertEquals(result.count, 2);
  assertEquals(result._meta.ui.resourceUri, "ui://mcp-erpnext/doclist-viewer");
});

Deno.test("erpnext_account_list - applies root_type filter", async () => {
  let capturedFilters: unknown;
  const mockClient = makeMockClient({
    list: async (_doctype: string, opts: any) => {
      capturedFilters = opts.filters;
      return [];
    },
  });

  const tool = getTool("erpnext_account_list");
  await tool.handler({ root_type: "Income" }, makeCtx(mockClient));

  assertEquals(capturedFilters, [["root_type", "=", "Income"]]);
});

// ── erpnext_journal_entry_create ─────────────────────────────────────────────

Deno.test("erpnext_journal_entry_create - throws if voucher_type missing", async () => {
  const tool = getTool("erpnext_journal_entry_create");
  await assertRejects(
    () =>
      tool.handler(
        { accounts: [{ account: "Cash" }] },
        makeCtx(makeMockClient()),
      ),
    Error,
    "voucher_type",
  );
});

Deno.test("erpnext_journal_entry_create - throws if accounts missing or empty", async () => {
  const tool = getTool("erpnext_journal_entry_create");
  await assertRejects(
    () =>
      tool.handler(
        { voucher_type: "Bank Entry", accounts: [] },
        makeCtx(makeMockClient()),
      ),
    Error,
    "accounts",
  );
});

Deno.test("erpnext_journal_entry_create - creates journal entry and forwards accounts", async () => {
  let capturedData: any;
  const mockClient = makeMockClient({
    create: async (_doctype: string, data: any) => {
      capturedData = data;
      return { name: "JE-2026-001" };
    },
  });

  const tool = getTool("erpnext_journal_entry_create");
  const result = await tool.handler(
    {
      voucher_type: "Bank Entry",
      accounts: [
        { account: "Cash - C", debit_in_account_currency: 1000 },
        { account: "Sales - C", credit_in_account_currency: 1000 },
      ],
      remark: "Test JE",
    },
    makeCtx(mockClient),
  ) as any;

  assertEquals(result.data.name, "JE-2026-001");
  assertEquals(capturedData.voucher_type, "Bank Entry");
  assertEquals(capturedData.accounts.length, 2);
  assertEquals(capturedData.remark, "Test JE");
});

// ── erpnext_payment_entry_get ────────────────────────────────────────────────

Deno.test("erpnext_payment_entry_get - throws if name missing", async () => {
  const tool = getTool("erpnext_payment_entry_get");
  await assertRejects(
    () => tool.handler({}, makeCtx(makeMockClient())),
    Error,
    "name",
  );
});

Deno.test("erpnext_payment_entry_get - returns payment entry data", async () => {
  const mockClient = makeMockClient({
    get: async () => ({
      name: "PE-00001",
      payment_type: "Receive",
      paid_amount: 1500,
    }),
  });

  const tool = getTool("erpnext_payment_entry_get");
  const result = await tool.handler(
    { name: "PE-00001" },
    makeCtx(mockClient),
  ) as any;

  assertEquals(result.data.name, "PE-00001");
  assertEquals(result.data.paid_amount, 1500);
});

// ── Tool registry sanity ────────────────────────────────────────────────────

Deno.test("all accounting tools have name, description, category, handler", () => {
  for (const tool of accountingTools) {
    assertEquals(typeof tool.name, "string");
    assertEquals(typeof tool.description, "string");
    assertEquals(tool.category, "accounting");
    assertEquals(typeof tool.handler, "function");
  }
});
