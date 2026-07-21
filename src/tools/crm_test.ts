/**
 * CRM Tools Tests
 *
 * @module lib/erpnext/tests/tools/crm_test
 */

import { assertEquals, assertRejects } from "@std/assert";
import { crmTools } from "./crm.ts";
import { FrappeAPIError, type FrappeClient } from "../api/frappe-client.ts";
import type { ErpNextToolContext } from "./types.ts";

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

function makeCtx(client: FrappeClient): ErpNextToolContext {
  return { client };
}

function getTool(name: string) {
  const tool = crmTools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool;
}

Deno.test("erpnext_campaign_list - filters by date range", async () => {
  let capturedFilters: unknown[][] = [];
  const client = makeMockClient({
    list: async (_doctype: string, opts: { filters?: unknown[][] }) => {
      capturedFilters = opts?.filters ?? [];
      return [];
    },
  });

  const tool = getTool("erpnext_campaign_list");
  await tool.handler(
    { date_from: "2026-01-01", date_to: "2026-01-31" },
    makeCtx(client),
  );

  const hasStart = capturedFilters.some((f) =>
    f[0] === "start_date" && f[1] === ">=" && f[2] === "2026-01-01"
  );
  const hasEnd = capturedFilters.some((f) =>
    f[0] === "end_date" && f[1] === "<=" && f[2] === "2026-01-31"
  );
  assertEquals(hasStart, true);
  assertEquals(hasEnd, true);
});

Deno.test("erpnext_opportunity_list - throws if party_name set without opportunity_from", async () => {
  const tool = getTool("erpnext_opportunity_list");
  await assertRejects(
    () => tool.handler({ party_name: "Acme Corp" }, makeCtx(makeMockClient())),
    Error,
    "opportunity_from",
  );
});

Deno.test("erpnext_opportunity_list - resolves party_name against the opportunity_from doctype", async () => {
  let resolvedDoctype = "";
  const client = makeMockClient({
    get: async () => {
      throw new FrappeAPIError("not found", 404, null);
    },
    list: async (doctype: string) => {
      if (doctype === "Opportunity") return [];
      resolvedDoctype = doctype;
      return [{ name: "LEAD-099" }];
    },
  });

  const tool = getTool("erpnext_opportunity_list");
  await tool.handler(
    { party_name: "Jane Prospect", opportunity_from: "Lead" },
    makeCtx(client),
  );

  assertEquals(resolvedDoctype, "Lead");
});
