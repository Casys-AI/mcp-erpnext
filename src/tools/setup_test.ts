/**
 * Setup Tools Tests
 *
 * Tests for erpnext_user_list, erpnext_company_list, and
 * erpnext_company_create.
 *
 * @module lib/erpnext/tests/tools/setup_test
 */

import { assertEquals, assertRejects } from "@std/assert";
import { setupTools } from "./setup.ts";
import type { FrappeClient } from "../api/frappe-client.ts";
import type { ErpNextToolContext } from "./types.ts";

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

// ── erpnext_setup_check ─────────────────────────────────────────────────────

interface SetupCheckResult {
  ready: boolean;
  summary: string;
  checks: Array<{
    id: string;
    label: string;
    status: "ok" | "missing" | "error";
    found?: number;
    examples?: string[];
    detail: string;
    fix?: string;
    error?: string;
  }>;
  missing: string[];
  unverified: string[];
}

/**
 * Mock `list` driven by a per-doctype table. The Price List probes are
 * distinguished by their `selling`/`buying` filter, not by doctype.
 */
function makeSetupClient(
  present: Record<string, boolean>,
  onError?: (doctype: string) => Error | undefined,
): FrappeClient {
  return makeMockClient({
    list: async (
      doctype: string,
      options: { filters?: FrappeFilterTuple[] },
    ) => {
      const failure = onError?.(doctype);
      if (failure) throw failure;

      let key = doctype;
      if (doctype === "Price List") {
        const selling = options.filters?.some((f) => f[0] === "selling");
        key = selling ? "Price List:selling" : "Price List:buying";
      }
      return present[key] ? [{ name: `${key}-001` }] : [];
    },
  });
}

type FrappeFilterTuple = [string, string, unknown];

const ALL_PRESENT: Record<string, boolean> = {
  "Company": true,
  "Price List:selling": true,
  "Price List:buying": true,
  "Warehouse": true,
  "Item Group": true,
  "UOM": true,
};

Deno.test("erpnext_setup_check - ready when every prerequisite is present", async () => {
  const result = await getTool("erpnext_setup_check").handler(
    {},
    makeCtx(makeSetupClient(ALL_PRESENT)),
  ) as unknown as SetupCheckResult;

  assertEquals(result.ready, true);
  assertEquals(result.missing, []);
  assertEquals(result.unverified, []);
  assertEquals(result.checks.length, 6);
  assertEquals(result.checks.every((c) => c.status === "ok"), true);
});

Deno.test("erpnext_setup_check - reports missing prerequisites with a fix", async () => {
  const result = await getTool("erpnext_setup_check").handler(
    {},
    makeCtx(makeSetupClient({
      ...ALL_PRESENT,
      "Price List:selling": false,
      "Warehouse": false,
    })),
  ) as unknown as SetupCheckResult;

  assertEquals(result.ready, false);
  assertEquals(result.missing, ["selling_price_list", "warehouse"]);

  const priceList = result.checks.find((c) => c.id === "selling_price_list")!;
  assertEquals(priceList.status, "missing");
  assertEquals(priceList.found, 0);
  // The fix must name the tool the agent should call next.
  assertEquals(priceList.fix?.startsWith("erpnext_doc_create("), true);
});

Deno.test("erpnext_setup_check - probes each doctype with the right filters", async () => {
  const captured: Array<[string, FrappeFilterTuple[] | undefined]> = [];
  await getTool("erpnext_setup_check").handler(
    {},
    makeCtx(makeMockClient({
      list: async (
        doctype: string,
        options: { filters?: FrappeFilterTuple[] },
      ) => {
        captured.push([doctype, options.filters]);
        return [{ name: "X" }];
      },
    })),
  );

  assertEquals(captured.map(([doctype]) => doctype), [
    "Company",
    "Price List",
    "Price List",
    "Warehouse",
    "Item Group",
    "UOM",
  ]);
  assertEquals(captured[1][1], [["selling", "=", 1], ["enabled", "=", 1]]);
  assertEquals(captured[2][1], [["buying", "=", 1], ["enabled", "=", 1]]);
  // Group warehouses cannot hold stock, so they must not satisfy the probe.
  assertEquals(captured[3][1], [["is_group", "=", 0]]);
});

Deno.test("erpnext_setup_check - surfaces a failed probe without aborting the rest", async () => {
  const result = await getTool("erpnext_setup_check").handler(
    {},
    makeCtx(makeSetupClient(
      ALL_PRESENT,
      (doctype) =>
        doctype === "Warehouse"
          ? new Error("PermissionError: not permitted")
          : undefined,
    )),
  ) as unknown as SetupCheckResult;

  assertEquals(result.ready, false);
  assertEquals(result.unverified, ["warehouse"]);
  assertEquals(result.missing, []);

  const warehouse = result.checks.find((c) => c.id === "warehouse")!;
  assertEquals(warehouse.status, "error");
  // The underlying message is preserved verbatim, not swallowed.
  assertEquals(warehouse.error, "PermissionError: not permitted");

  // Every other probe still ran.
  assertEquals(result.checks.filter((c) => c.status === "ok").length, 5);
});

Deno.test("erpnext_setup_check - is read-only and takes no input", () => {
  const tool = getTool("erpnext_setup_check");
  assertEquals(tool.annotations?.readOnlyHint, true);
  assertEquals(tool.inputSchema.properties, {});
});

// ── erpnext_company_list ────────────────────────────────────────────────────

Deno.test("erpnext_company_list - returns formatted result with _meta.ui", async () => {
  const mockClient = makeMockClient({
    list: async (doctype: string) => {
      assertEquals(doctype, "Company");
      return [
        {
          name: "Casys Industries",
          abbr: "CI",
          default_currency: "EUR",
          country: "France",
        },
      ];
    },
  });

  const tool = getTool("erpnext_company_list");
  const result = await tool.handler({}, makeCtx(mockClient)) as Record<
    string,
    unknown
  >;

  assertEquals(result.count, 1);
  assertEquals((result.data as unknown[]).length, 1);
  assertEquals(
    (result._meta as { ui: { resourceUri: string } }).ui.resourceUri,
    "ui://mcp-erpnext/doclist-viewer",
  );
});

Deno.test("erpnext_company_list - has _meta.ui on tool definition", () => {
  const tool = getTool("erpnext_company_list");
  assertEquals(tool._meta?.ui?.resourceUri, "ui://mcp-erpnext/doclist-viewer");
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
    () =>
      tool.handler(
        { abbr: "CI", default_currency: "EUR", country: "France" },
        makeCtx(makeMockClient()),
      ),
    Error,
    "company_name",
  );
});

Deno.test("erpnext_company_create - throws if abbr missing", async () => {
  const tool = getTool("erpnext_company_create");
  await assertRejects(
    () =>
      tool.handler({
        company_name: "Test",
        default_currency: "EUR",
        country: "France",
      }, makeCtx(makeMockClient())),
    Error,
    "abbr",
  );
});

Deno.test("erpnext_company_create - throws if default_currency missing", async () => {
  const tool = getTool("erpnext_company_create");
  await assertRejects(
    () =>
      tool.handler(
        { company_name: "Test", abbr: "T", country: "France" },
        makeCtx(makeMockClient()),
      ),
    Error,
    "default_currency",
  );
});

Deno.test("erpnext_company_create - throws if country missing", async () => {
  const tool = getTool("erpnext_company_create");
  await assertRejects(
    () =>
      tool.handler(
        { company_name: "Test", abbr: "T", default_currency: "EUR" },
        makeCtx(makeMockClient()),
      ),
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
    {
      company_name: "Test Co",
      abbr: "TC",
      default_currency: "USD",
      country: "US",
    },
    makeCtx(mockClient),
  );

  assertEquals(capturedData.domain, undefined);
});

// ── erpnext_user_list ───────────────────────────────────────────────────────

Deno.test("erpnext_user_list - defaults to enabled System Users without system accounts", async () => {
  let capturedFilters: unknown[][] = [];
  let capturedLimit = 0;
  const result = await getTool("erpnext_user_list").handler(
    {},
    makeCtx(makeMockClient({
      list: async (
        doctype: string,
        options: { filters?: unknown[][]; limit?: number },
      ) => {
        assertEquals(doctype, "User");
        capturedFilters = options.filters ?? [];
        capturedLimit = options.limit ?? 0;
        return [{
          name: "user@example.com",
          full_name: "User One",
          enabled: 1,
        }];
      },
    })),
  ) as Record<string, unknown>;

  assertEquals(capturedFilters, [
    ["user_type", "=", "System User"],
    ["name", "not in", ["Administrator", "Guest"]],
    ["enabled", "=", 1],
  ]);
  assertEquals(capturedLimit, 50);
  assertEquals(result.doctype, "User");
  assertEquals(result.count, 1);
});

Deno.test("erpnext_user_list - supports search and include_disabled", async () => {
  let capturedFilters: unknown[][] = [];
  await getTool("erpnext_user_list").handler(
    { search: "Marie", include_disabled: true, limit: 10 },
    makeCtx(makeMockClient({
      list: async (_doctype: string, options: { filters?: unknown[][] }) => {
        capturedFilters = options.filters ?? [];
        return [];
      },
    })),
  );

  assertEquals(capturedFilters, [
    ["user_type", "=", "System User"],
    ["name", "not in", ["Administrator", "Guest"]],
    ["full_name", "like", "%Marie%"],
  ]);
});

Deno.test("erpnext_user_list - escapes LIKE wildcards in search", async () => {
  let capturedFilters: unknown[][] = [];
  await getTool("erpnext_user_list").handler(
    { search: "100%_done\\x" },
    makeCtx(makeMockClient({
      list: async (_doctype: string, options: { filters?: unknown[][] }) => {
        capturedFilters = options.filters ?? [];
        return [];
      },
    })),
  );

  assertEquals(
    capturedFilters.find((filter) => filter[0] === "full_name"),
    ["full_name", "like", "%100\\%\\_done\\\\x%"],
  );
});
