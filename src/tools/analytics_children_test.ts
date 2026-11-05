import { assert, assertEquals, assertRejects } from "@std/assert";
import { FrappeAPIError } from "../api/frappe-client.ts";
import type { FrappeClient } from "../api/frappe-client.ts";
import type { FrappeListOptions } from "../api/types.ts";
import { analyticsTools } from "./analytics.ts";
import { estimateGrossMargin } from "./analytics-gross-margin.ts";
import { AnalyticsDataError } from "./analytics-money.ts";

const childCases: Array<[string, Record<string, unknown>, string, string]> = [
  [
    "erpnext_sales_chart",
    { group_by: "item" },
    "Sales Invoice Item",
    "Sales Invoice",
  ],
  [
    "erpnext_product_radar",
    { items: ["A", "B"] },
    "Sales Order Item",
    "Sales Order",
  ],
  ["erpnext_price_vs_qty", {}, "Sales Order Item", "Sales Order"],
  ["erpnext_kpi_gross_margin", {}, "Sales Order Item", "Sales Order"],
  [
    "erpnext_gross_profit",
    { group_by: "item" },
    "Sales Invoice Item",
    "Sales Invoice",
  ],
  [
    "erpnext_gross_profit",
    { group_by: "customer" },
    "Sales Invoice Item",
    "Sales Invoice",
  ],
];

for (const [name, input, child, parent] of childCases) {
  Deno.test(`${name} ${input.group_by ?? ""} - child reads carry the permission parent`, async () => {
    let childCalls = 0;
    const client = {
      list: async (doctype: string, options: FrappeListOptions = {}) => {
        if (doctype === child) {
          childCalls++;
          if (options.parent !== parent) {
            throw new FrappeAPIError("Insufficient Permission", 403, null);
          }
        }
        return [];
      },
    } as unknown as FrappeClient;
    const tool = analyticsTools.find((tool) => tool.name === name)!;
    await tool.handler(input, { client });
    assertEquals(childCalls, 1);
  });
}

type Row = Record<string, unknown>;
const order = { item_code: "ITEM-A", qty: 2, amount: 100 };
const bin = { item_code: "ITEM-A", valuation_rate: 20 };

function fixture(orders: Row[] = [order], bins: Row[] = [bin]) {
  const calls: Array<{ doctype: string; options: FrappeListOptions }> = [];
  const client = {
    list: async (doctype: string, options: FrappeListOptions) => {
      calls.push({ doctype, options });
      return doctype === "Sales Order Item" ? orders : bins;
    },
  } as unknown as FrappeClient;
  return { client, calls };
}

async function rejectsEstimate(
  orders: Row[],
  bins: Row[],
  code: AnalyticsDataError["code"],
) {
  const { client } = fixture(orders, bins);
  const error = await assertRejects(
    () => estimateGrossMargin(client),
    AnalyticsDataError,
  );
  assertEquals(error.code, code);
  assert(error.message.includes("Recovery:"));
  return error;
}

Deno.test("gross margin - complete estimate accepts numeric strings and equal warehouse rates", async () => {
  const { client } = fixture(
    [{ item_code: "ITEM-A", qty: "2", amount: "100" }],
    [bin, { item_code: "ITEM-A", valuation_rate: "20" }],
  );
  assertEquals(await estimateGrossMargin(client), 60);
});

Deno.test("gross margin - boundary-sized complete data is allowed, with an overflow probe", async () => {
  const { client, calls } = fixture(
    Array.from({ length: 1000 }, () => ({ ...order })),
    Array.from({ length: 500 }, () => ({ ...bin })),
  );
  assertEquals(await estimateGrossMargin(client), 60);
  assertEquals(calls.map(({ options }) => options.limit), [1001, 501]);
});

Deno.test("gross margin - refuses a partial order aggregate before reading costs", async () => {
  const { client, calls } = fixture(
    Array.from({ length: 1001 }, () => ({ ...order })),
  );
  const error = await assertRejects(
    () => estimateGrossMargin(client),
    AnalyticsDataError,
    "no partial margin",
  );
  assertEquals(error.code, "INCOMPLETE_DATA");
  assertEquals(calls.length, 1);
});

Deno.test("gross margin - refuses a partial Bin aggregate", async () => {
  await rejectsEstimate(
    [order],
    Array.from({ length: 501 }, () => ({ ...bin })),
    "INCOMPLETE_DATA",
  );
});

Deno.test("gross margin - an empty order set needs no Bin permission", async () => {
  const { client, calls } = fixture([], []);
  assertEquals(await estimateGrossMargin(client), 0);
  assertEquals(calls.length, 1);
});

Deno.test("gross margin - missing and malformed amounts or quantities never become zero", async () => {
  for (const field of ["amount", "qty"] as const) {
    for (
      const value of [undefined, null, "", " ", "invalid", Infinity, NaN, true]
    ) {
      const error = await rejectsEstimate(
        [{ ...order, [field]: value }],
        [bin],
        "INVALID_AMOUNT",
      );
      assertEquals(error.context.field, field);
    }
  }
});

Deno.test("gross margin - a missing item identity cannot match costs", async () => {
  await rejectsEstimate([{ qty: 2, amount: 100 }], [bin], "INVALID_DATA");
});

Deno.test("gross margin - missing costs are not treated as zero", async () => {
  await rejectsEstimate([order], [], "MISSING_VALUATION");
  await rejectsEstimate(
    [order],
    [{ item_code: "OTHER-ITEM", valuation_rate: 20 }],
    "MISSING_VALUATION",
  );
});

Deno.test("gross margin - a Bin without item identity cannot be silently ignored", async () => {
  await rejectsEstimate([order], [bin, { valuation_rate: 30 }], "INVALID_DATA");
});

Deno.test("gross margin - unreadable valuation fields are rejected", async () => {
  for (const value of [undefined, null, "", Infinity, "invalid"]) {
    await rejectsEstimate(
      [order],
      [{ ...bin, valuation_rate: value }],
      "INVALID_AMOUNT",
    );
  }
});

Deno.test("gross margin - an explicit zero valuation remains zero cost", async () => {
  const { client, calls } = fixture([order], [{ ...bin, valuation_rate: 0 }]);
  assertEquals(await estimateGrossMargin(client), 100);
  assertEquals(calls[1].options.filters, undefined);
});

Deno.test("gross margin - conflicting warehouse valuations are never selected arbitrarily", async () => {
  for (
    const bins of [[bin, { ...bin, valuation_rate: 30 }], [{
      ...bin,
      valuation_rate: 30,
    }, bin]]
  ) {
    await rejectsEstimate([order], bins, "AMBIGUOUS_VALUATION");
  }
});

Deno.test("gross margin - unrelated warehouse valuations cannot invalidate the estimate", async () => {
  const { client } = fixture(
    [order],
    [bin, { item_code: "OTHER-ITEM" }, {
      item_code: "OTHER-ITEM",
      valuation_rate: 5,
    }],
  );
  assertEquals(await estimateGrossMargin(client), 60);
});

Deno.test("gross margin - numeric overflow is rejected", async () => {
  await rejectsEstimate(
    [{ ...order, qty: Number.MAX_VALUE }],
    [bin],
    "INVALID_AMOUNT",
  );
});

Deno.test("gross margin - actual permission errors are preserved", async () => {
  const denied = new FrappeAPIError("Insufficient Permission", 403, null);
  const client = {
    list: () => Promise.reject(denied),
  } as unknown as FrappeClient;
  const error = await assertRejects(
    () => estimateGrossMargin(client),
    FrappeAPIError,
  );
  assertEquals(error, denied);
});
