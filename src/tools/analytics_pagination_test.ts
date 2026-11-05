import { assertEquals } from "@std/assert";
import type { FrappeClient } from "../api/frappe-client.ts";
import type { FrappeListOptions } from "../api/types.ts";
import { analyticsTools, localCalendarDate } from "./analytics.ts";
import { paginatedFixture } from "./analytics-fixture.test.ts";

type Row = Record<string, unknown>;
interface Chart {
  labels: string[];
  datasets: { label: string; values: number[] }[];
  treeData: { name: string; value: number }[];
  stages: { count: number; value?: number }[];
  scatterData: { points: { x: number; y: number; label: string }[] }[];
}

function rows(count: number, values: Row): Row[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `ROW-${String(i).padStart(6, "0")}`,
    ...values,
  }));
}

async function run(
  name: string,
  tables:
    | Record<string, Row[]>
    | ((doctype: string, options: FrappeListOptions) => Row[]),
  input: Record<string, unknown> = {},
) {
  const list = paginatedFixture(async (doctype, options) =>
    typeof tables === "function"
      ? tables(doctype, options)
      : tables[doctype] ?? []
  );
  const client = { list } as unknown as FrappeClient;
  return await analyticsTools.find((tool) => tool.name === name)!.handler(
    input,
    { client },
  ) as Chart;
}

Deno.test("stock chart - Top N is applied after every warehouse contributes", async () => {
  const result = await run("erpnext_stock_chart", {
    Bin: [...rows(1001, { item_code: "A", actual_qty: 1 }), {
      name: "TAIL",
      item_code: "B",
      actual_qty: 1000,
    }],
  }, { limit: 1 });
  assertEquals(result.labels, ["A"]);
  assertEquals(result.datasets[0].values, [1001]);
});

Deno.test("stock chart - item group membership is complete beyond 1000 items", async () => {
  const result = await run("erpnext_stock_chart", {
    Item: [...rows(1000, {}), { name: "TAIL-ITEM" }],
    Bin: [{ name: "BIN", item_code: "TAIL-ITEM", actual_qty: 10 }],
  }, { item_group: "Parts" });
  assertEquals(result.labels, ["TAIL-ITEM"]);
  assertEquals(result.datasets[0].values, [10]);
});

for (const group_by of ["customer", "status", "item"]) {
  Deno.test(`sales chart ${group_by} - late rows change the complete ranking`, async () => {
    const population = [
      ...rows(500, {
        customer: "A",
        customer_name: "A",
        status: "A",
        item_code: "A",
        item_name: "A",
        grand_total: 1,
        amount: 1,
      }),
      {
        name: "TAIL",
        customer: "B",
        customer_name: "B",
        status: "B",
        item_code: "B",
        item_name: "B",
        grand_total: 1000,
        amount: 1000,
      },
    ];
    const result = await run("erpnext_sales_chart", {
      "Sales Invoice": population,
      "Sales Invoice Item": population,
    }, { group_by, limit: 1 });
    assertEquals(result.labels[0], "B");
    assertEquals(result.datasets[0].values[0], 1000);
  });
}

for (const type of ["pie", "stacked-bar"]) {
  Deno.test(`order breakdown ${type} - complete totals determine Top N customers`, async () => {
    const result = await run("erpnext_order_breakdown", {
      "Sales Order": [
        ...rows(500, { customer_name: "A", status: "Draft", grand_total: 1 }),
        {
          name: "TAIL",
          customer_name: "B",
          status: "Draft",
          grand_total: 1000,
        },
      ],
    }, { type, limit: 1 });
    assertEquals(result.labels, ["B"]);
    assertEquals(result.datasets[0].values, [1000]);
  });
}

Deno.test("revenue vs orders - late orders contribute to both revenue and count", async () => {
  const result = await run("erpnext_revenue_vs_orders", {
    "Sales Order": rows(501, { customer_name: "Acme", grand_total: 2 }),
  });
  assertEquals(result.datasets[0].values, [1002]);
  assertEquals(result.datasets[1].values, [501]);
});

for (const group_by of ["item", "warehouse"]) {
  Deno.test(`stock treemap ${group_by} - complete values determine Top N entries`, async () => {
    const result = await run("erpnext_stock_treemap", {
      Bin: [...rows(500, { item_code: "A", warehouse: "A", stock_value: 1 }), {
        name: "TAIL",
        item_code: "B",
        warehouse: "B",
        stock_value: 1000,
      }],
    }, { group_by, limit: 1 });
    assertEquals(result.treeData.map(({ name, value }) => ({ name, value })), [{
      name: "B",
      value: 1000,
    }]);
  });
}

Deno.test("radar - all warehouses and order lines contribute for each selected item", async () => {
  const result = await run("erpnext_product_radar", (doctype, options) => {
    if (doctype === "Bin") {
      const item = options.filters?.find((f) => f[0] === "item_code")?.[2];
      return item === "A"
        ? rows(101, { actual_qty: 1, stock_value: 1 })
        : [{ name: "B", actual_qty: 101, stock_value: 101 }];
    }
    return [...rows(500, { item_code: "A", qty: 1, amount: 1 }), {
      name: "TAIL",
      item_code: "B",
      qty: 1,
      amount: 1000,
    }];
  }, { items: ["A", "B"] });
  assertEquals(result.datasets[0].values, [100, 100, 100, 50]);
  assertEquals(result.datasets[1].values, [100, 100, 0, 100]);
});

Deno.test("price vs quantity - complete quantities use newest price even on a later page", async () => {
  const result = await run("erpnext_price_vs_qty", {
    "Item Price": [
      ...rows(200, {
        item_code: "OTHER",
        price_list_rate: 1,
        modified: "2026-01-01 00:00:00",
      }),
      {
        name: "TAIL-OLD",
        item_code: "A",
        price_list_rate: 10,
        modified: "2026-02-01 00:00:00",
      },
      {
        name: "TAIL-NEW",
        item_code: "A",
        price_list_rate: 100,
        modified: "2026-03-01 00:00:00",
      },
    ],
    "Sales Order Item": rows(501, { item_code: "A", qty: 1 }),
  });
  assertEquals(result.scatterData[0].points.map(({ x, y }) => ({ x, y })), [{
    x: 100,
    y: 501,
  }]);
});

Deno.test("funnel - every stage remains complete beyond 500 rows", async () => {
  const result = await run("erpnext_sales_funnel", {
    Lead: rows(501, {}),
    Opportunity: rows(502, { opportunity_amount: 2 }),
    Quotation: rows(503, { grand_total: 3 }),
    "Sales Order": rows(504, { grand_total: 4 }),
  }, { period: "all" });
  assertEquals(result.stages.map(({ count }) => count), [501, 502, 503, 504]);
  assertEquals(result.stages.slice(1).map(({ value }) => value), [
    1004,
    1509,
    2016,
  ]);
});

Deno.test("AR aging - all outstanding invoices contribute before ranking", async () => {
  const result = await run("erpnext_ar_aging", {
    "Sales Invoice": rows(501, {
      customer_name: "Acme",
      outstanding_amount: 2,
      due_date: localCalendarDate(new Date()),
    }),
  });
  assertEquals(
    result.datasets.reduce((sum, dataset) => sum + dataset.values[0], 0),
    1002,
  );
});

for (const group_by of ["item", "customer"]) {
  Deno.test(`gross profit ${group_by} - line, valuation and invoice-map populations are complete`, async () => {
    const result = await run("erpnext_gross_profit", {
      "Sales Invoice Item": rows(501, {
        parent: "TAIL-INVOICE",
        item_code: "A",
        item_name: "A",
        amount: 100,
        qty: 1,
      }),
      "Sales Invoice": [...rows(500, { customer_name: "Other" }), {
        name: "TAIL-INVOICE",
        customer_name: "Acme",
      }],
      Bin: [...rows(500, { item_code: "A", valuation_rate: 1 }), {
        name: "TAIL-BIN",
        item_code: "A",
        valuation_rate: 20,
      }],
    }, { group_by });
    assertEquals(result.labels, [group_by === "item" ? "A" : "Acme"]);
    assertEquals(result.datasets[0].values, [50100]);
    assertEquals(result.datasets[1].values, [80]);
  });
}

Deno.test("profit and loss - both sides include every order beyond 1000 rows", async () => {
  const date = localCalendarDate(new Date());
  const result = await run("erpnext_profit_loss", {
    "Sales Order": rows(1001, { grand_total: 2, transaction_date: date }),
    "Purchase Order": rows(1001, { grand_total: 1, transaction_date: date }),
  }, { months: 1 });
  assertEquals(result.datasets.map(({ values }) => values[0]), [
    2002,
    1001,
    1001,
  ]);
});
