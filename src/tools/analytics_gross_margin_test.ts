import { assert, assertEquals, assertRejects } from "@std/assert";
import { FrappeAPIError } from "../api/frappe-client.ts";
import type { FrappeClient } from "../api/frappe-client.ts";
import type { FrappeFilter, FrappeListOptions } from "../api/types.ts";
import { estimateGrossMargin } from "./analytics-gross-margin.ts";
import { AnalyticsDataError } from "./analytics-money.ts";
import { analyticsTools } from "./analytics.ts";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;
const ORDER = {
  name: "SO-0001",
  company: "Acme",
  transaction_date: "2026-10-15",
  docstatus: 1,
};
const LINE = {
  name: "LINE-0001",
  parent: "SO-0001",
  parenttype: "Sales Order",
  docstatus: 1,
  item_code: "ITEM-A",
  warehouse: "Main",
  stock_qty: 2,
  stock_uom: "Nos",
  base_net_amount: 100,
};
const BIN = {
  name: "BIN-0001",
  item_code: "ITEM-A",
  warehouse: "Main",
  valuation_rate: 20,
  stock_uom: "Nos",
};

function matches(row: Row, filter: FrappeFilter): boolean {
  assertEquals(
    filter.length,
    3,
    "fixture expects filters on the listed DocType",
  );
  const [field, operator, expected] = filter;
  const actual = row[field];
  switch (operator) {
    case "=":
      return actual === expected;
    case "!=":
      return actual !== expected;
    case ">":
      return String(actual) > String(expected);
    case ">=":
      return String(actual) >= String(expected);
    case "<=":
      return String(actual) <= String(expected);
    case "in":
      return Array.isArray(expected) && expected.includes(actual as string);
    default:
      throw new Error(`Unsupported fixture operator: ${operator}`);
  }
}

function fixture(overrides: Partial<Tables> = {}, serverPageSize?: number) {
  const tables: Tables = {
    "Sales Order": [ORDER],
    "Sales Order Item": [LINE],
    "Company": [{ name: "Acme", default_currency: "EUR" }],
    "Warehouse": [{ name: "Main", company: "Acme" }],
    "Bin": [BIN],
    ...overrides,
  } as Tables;
  const calls: Array<{
    doctype: string;
    options: FrappeListOptions;
    fresh: boolean;
  }> = [];
  const client = {
    list: async (
      doctype: string,
      options: FrappeListOptions = {},
      request: { skipCache?: boolean } = {},
    ) => {
      calls.push({
        doctype,
        options: structuredClone(options),
        fresh: request.skipCache === true,
      });
      if (doctype === "Sales Order Item" && options.parent !== "Sales Order") {
        throw new FrappeAPIError(
          "Insufficient Permission for Sales Order Item",
          403,
          null,
        );
      }
      let rows = (tables[doctype] ?? []).filter((row) =>
        (options.filters ?? []).every((filter) => matches(row, filter))
      ).slice().sort((a, b) =>
        String(a.name) < String(b.name)
          ? -1
          : String(a.name) > String(b.name)
          ? 1
          : 0
      );
      if (options.limit_start) rows = rows.slice(options.limit_start);
      if (options.limit) rows = rows.slice(0, options.limit);
      if (serverPageSize) rows = rows.slice(0, serverPageSize);
      return rows.map((row) =>
        options.fields?.length && !options.fields.includes("*")
          ? Object.fromEntries(
            options.fields.filter((field) => field in row).map((
              field,
            ) => [field, row[field]]),
          )
          : { ...row }
      );
    },
  } as unknown as FrappeClient;
  return { client, calls };
}

async function rejectsData(overrides: Partial<Tables>, message?: string) {
  const { client } = fixture(overrides);
  const error = await assertRejects(
    () => estimateGrossMargin(client),
    AnalyticsDataError,
    message,
  );
  assert(error.message.includes("Recovery:"));
  return error;
}

Deno.test("gross margin - reads company net revenue and stock units without requiring amount", async () => {
  const { client, calls } = fixture({
    "Sales Order Item": [{
      ...LINE,
      stock_qty: "2",
      base_net_amount: "100",
      qty: 1,
      amount: 500,
    }],
  });
  const result = await estimateGrossMargin(client);
  assertEquals(result.margin, 60);
  assertEquals(result.company, "Acme");
  assertEquals(result.currency, "EUR");
  assert(
    calls.every(({ fresh }) => fresh),
    "the estimate cannot mix stale cached pages",
  );
  for (
    const call of calls.filter(({ doctype }) => doctype === "Sales Order Item")
  ) {
    assertEquals(call.options.parent, "Sales Order");
  }
});

Deno.test("gross margin - all 2400 order lines contribute, including the final expensive line", async () => {
  const orders = Array.from(
    { length: 2400 },
    (_, i) => ({ ...ORDER, name: `SO-${String(i).padStart(5, "0")}` }),
  );
  const lines = orders.map((order, i) => ({
    ...LINE,
    name: `LINE-${String(i).padStart(5, "0")}`,
    parent: order.name,
    stock_qty: i === orders.length - 1 ? 101 : 1,
  }));
  const { client, calls } = fixture({
    "Sales Order": orders,
    "Sales Order Item": lines,
  });
  const result = await estimateGrossMargin(client);
  assertEquals(result.margin, ((240000 - 50000) / 240000) * 100);
  assert(calls.filter(({ doctype }) => doctype === "Sales Order").length > 1);
  assert(
    calls.filter(({ doctype }) => doctype === "Sales Order Item").length > 1,
  );
  assert(
    calls.every(({ options }) => options.limit !== 0),
    "large reads stay paginated",
  );
});

Deno.test("gross margin - a single order with 2400 lines and 600 Bins is complete", async () => {
  const lines = Array.from({ length: 2400 }, (_, i) => ({
    ...LINE,
    name: `LINE-${String(i).padStart(5, "0")}`,
    item_code: `ITEM-${String(i % 600).padStart(4, "0")}`,
    stock_qty: 1,
    base_net_amount: 100,
  }));
  const bins = Array.from({ length: 600 }, (_, i) => ({
    ...BIN,
    name: `BIN-${String(i).padStart(4, "0")}`,
    item_code: `ITEM-${String(i).padStart(4, "0")}`,
    valuation_rate: i === 599 ? 50 : 20,
  }));
  const { client, calls } = fixture({ "Sales Order Item": lines, "Bin": bins });
  assertEquals((await estimateGrossMargin(client)).margin, 79.95);
  assert(
    calls.filter(({ doctype }) => doctype === "Sales Order Item").length > 12,
  );
  assert(calls.filter(({ doctype }) => doctype === "Bin").length > 1);
});

Deno.test("gross margin - short server pages cannot hide remaining order lines", async () => {
  const lines = Array.from(
    { length: 21 },
    (_, i) => ({
      ...LINE,
      name: `LINE-${String(i).padStart(3, "0")}`,
      stock_qty: i === 20 ? 12 : 2,
    }),
  );
  const { client } = fixture({ "Sales Order Item": lines }, 7);
  assertEquals(
    (await estimateGrossMargin(client)).margin,
    ((2100 - 1040) / 2100) * 100,
  );
});

Deno.test("gross margin - scopes parent orders by inclusive date range and company", async () => {
  const orders = [
    { ...ORDER, name: "SO-START", transaction_date: "2026-10-01" },
    { ...ORDER, name: "SO-END", transaction_date: "2026-10-31" },
    { ...ORDER, name: "SO-BEFORE", transaction_date: "2026-09-30" },
    { ...ORDER, name: "SO-AFTER", transaction_date: "2026-11-01" },
    { ...ORDER, name: "SO-OTHER", company: "Other" },
    { ...ORDER, name: "SO-CANCELLED", docstatus: 2 },
  ];
  const lines = orders.map((order) => ({
    ...LINE,
    name: `LINE-${order.name}`,
    parent: order.name,
    stock_qty: order.name === "SO-END" ? 3 : 2,
  }));
  const { client } = fixture({
    "Sales Order": orders,
    "Sales Order Item": lines,
  });
  const result = await estimateGrossMargin(client, {
    company: "Acme",
    date_from: "2026-10-01",
    date_to: "2026-10-31",
  });
  assertEquals(result.margin, 50);
  assertEquals(result.company, "Acme");
  assertEquals(result.date_from, "2026-10-01");
  assertEquals(result.date_to, "2026-10-31");
});

Deno.test("gross margin - valuation belongs to each line's warehouse", async () => {
  const { client } = fixture({
    "Sales Order Item": [LINE, {
      ...LINE,
      name: "LINE-0002",
      warehouse: "Secondary",
    }],
    "Warehouse": [{ name: "Main", company: "Acme" }, {
      name: "Secondary",
      company: "Acme",
    }],
    "Bin": [BIN, {
      ...BIN,
      name: "BIN-0002",
      warehouse: "Secondary",
      valuation_rate: 30,
    }],
  });
  assertEquals((await estimateGrossMargin(client)).margin, 50);
});

Deno.test("gross margin - mixed companies cannot combine company-currency amounts", async () => {
  await rejectsData({
    "Sales Order": [ORDER, { ...ORDER, name: "SO-0002", company: "Other" }],
    "Sales Order Item": [LINE, {
      ...LINE,
      name: "LINE-0002",
      parent: "SO-0002",
    }],
  });
});

Deno.test("gross margin - warehouse from another company cannot supply cost", async () => {
  await rejectsData({ "Warehouse": [{ name: "Main", company: "Other" }] });
});

Deno.test("gross margin - the stock unit must be readable and match valuation", async () => {
  for (const stock_uom of [undefined, "", "Box"]) {
    const error = await rejectsData({ "Bin": [{ ...BIN, stock_uom }] });
    assertEquals(error.code, "INVALID_DATA");
  }
  const error = await rejectsData({
    "Sales Order Item": [{ ...LINE, stock_uom: undefined }],
  });
  assertEquals(error.code, "INVALID_DATA");
});

Deno.test("gross margin - irrelevant warehouses and items cannot invalidate scoped valuations", async () => {
  const { client } = fixture({
    "Bin": [BIN, {
      ...BIN,
      name: "BIN-OTHER-ITEM",
      item_code: "OTHER",
      valuation_rate: null,
    }, {
      ...BIN,
      name: "BIN-OTHER-WH",
      warehouse: "Unrelated",
      valuation_rate: 50,
    }],
  });
  assertEquals((await estimateGrossMargin(client)).margin, 60);
});

Deno.test("gross margin - missing required company amounts or stock units remain errors", async () => {
  for (const field of ["base_net_amount", "stock_qty"] as const) {
    for (const value of [undefined, null, "", " ", true, NaN, Infinity]) {
      const error = await rejectsData({
        "Sales Order Item": [{ ...LINE, [field]: value, amount: 100, qty: 2 }],
      });
      assertEquals(error.code, "INVALID_AMOUNT");
    }
  }
});

Deno.test("gross margin - missing warehouse, identity or cost cannot become zero", async () => {
  for (const field of ["warehouse", "item_code"] as const) {
    await rejectsData({
      "Sales Order Item": [{ ...LINE, [field]: undefined }],
    });
  }
  const error = await rejectsData({ "Bin": [] });
  assertEquals(error.code, "MISSING_VALUATION");
});

Deno.test("gross margin - explicit zero cost is allowed but unreadable valuation is rejected", async () => {
  assertEquals(
    (await estimateGrossMargin(
      fixture({ "Bin": [{ ...BIN, valuation_rate: 0 }] }).client,
    )).margin,
    100,
  );
  for (const value of [undefined, null, "", Infinity, "invalid"]) {
    const error = await rejectsData({
      "Bin": [{ ...BIN, valuation_rate: value }],
    });
    assertEquals(error.code, "INVALID_AMOUNT");
  }
});

Deno.test("gross margin - two conflicting Bins for the same warehouse/item are rejected", async () => {
  await rejectsData({
    "Bin": [BIN, { ...BIN, name: "BIN-0002", valuation_rate: 30 }],
  });
});

Deno.test("gross margin - empty scope needs no stock valuation permissions", async () => {
  const { client, calls } = fixture({ "Sales Order": [] });
  assertEquals((await estimateGrossMargin(client)).margin, 0);
  assert(calls.every(({ doctype }) => doctype === "Sales Order"));
});

Deno.test("gross margin - invalid scopes fail before any ERP request", async () => {
  for (
    const input of [
      { company: " " },
      { company: 12 },
      { date_from: "2026-02-30" },
      { date_to: "2026-13-01" },
      { date_from: "2026-10-01T00:00:00Z" },
      { date_from: "2026-11-01", date_to: "2026-10-01" },
    ]
  ) {
    const { client, calls } = fixture();
    await assertRejects(() => estimateGrossMargin(client, input));
    assertEquals(calls.length, 0);
  }
});

Deno.test("gross margin - finite values that overflow during aggregation are rejected", async () => {
  const error = await rejectsData({
    "Sales Order Item": [{ ...LINE, stock_qty: Number.MAX_VALUE }],
  });
  assertEquals(error.code, "INVALID_AMOUNT");
});

Deno.test("gross margin - actual permission errors are preserved", async () => {
  const denied = new FrappeAPIError("Insufficient Permission", 403, null);
  const client = {
    list: () => Promise.reject(denied),
  } as unknown as FrappeClient;
  assertEquals(
    await assertRejects(() => estimateGrossMargin(client), FrappeAPIError),
    denied,
  );
});

Deno.test("gross margin - a later page failure cannot return a partial percentage", async () => {
  const lines = Array.from({ length: 401 }, (_, i) => ({
    ...LINE,
    name: `LINE-${String(i).padStart(4, "0")}`,
  }));
  const { client } = fixture({ "Sales Order Item": lines });
  const originalList = client.list.bind(client);
  const unavailable = new FrappeAPIError("ERP unavailable", 503, null);
  client.list =
    ((doctype: string, options: FrappeListOptions = {}, request = {}) => {
      if (
        doctype === "Sales Order Item" &&
        options.filters?.some((filter) =>
          filter[0] === "name" && filter[1] === ">"
        )
      ) {
        return Promise.reject(unavailable);
      }
      return originalList(doctype, options, request);
    }) as FrappeClient["list"];
  assertEquals(
    await assertRejects(() => estimateGrossMargin(client), FrappeAPIError),
    unavailable,
  );
});

Deno.test("gross margin tool - optional scope reaches the estimate and preserves percent output", async () => {
  const { client } = fixture();
  const tool = analyticsTools.find(({ name }) =>
    name === "erpnext_kpi_gross_margin"
  )!;
  const result = await tool.handler({
    company: "Acme",
    date_from: "2026-10-01",
    date_to: "2026-10-31",
  }, { client }) as Record<string, unknown>;
  assertEquals(result.value, 60);
  assertEquals(result.unit, "%");
  assertEquals(result.company, "Acme");
  assertEquals(result.date_from, "2026-10-01");
  assertEquals(result.date_to, "2026-10-31");
  assertEquals(result.calculation, {
    revenue: 100,
    estimatedCost: 40,
    currency: "EUR",
  });
  assertEquals(
    "currency" in result,
    false,
    "percent KPI must not be rendered as currency",
  );
});
