import { assertEquals, assertRejects } from "@std/assert";
import type { FrappeClient } from "../api/frappe-client.ts";
import type { FrappeFilter } from "../api/types.ts";
import { analyticsTools } from "./analytics.ts";

type ListOptions = NonNullable<Parameters<FrappeClient["list"]>[1]>;

interface ChartResult {
  labels: string[];
  datasets: { label: string; values: number[] }[];
}

async function atLocalMidnight(
  timezone: string,
  run: () => Promise<void>,
): Promise<void> {
  const originalTimezone = Deno.env.get("TZ");
  const OriginalDate = globalThis.Date;
  try {
    Deno.env.set("TZ", timezone);
    const fixedTime = new OriginalDate(2026, 0, 15, 0, 30).getTime();
    globalThis.Date = new Proxy(OriginalDate, {
      construct(target, args) {
        return Reflect.construct(
          target,
          args.length === 0 ? [fixedTime] : args,
        );
      },
    });
    assertEquals(
      new Date().getTimezoneOffset(),
      timezone === "Asia/Taipei" ? -480 : 480,
    );
    await run();
  } finally {
    globalThis.Date = OriginalDate;
    if (originalTimezone === undefined) Deno.env.delete("TZ");
    else Deno.env.set("TZ", originalTimezone);
  }
}

function mockClient(
  list: (
    doctype: string,
    options: ListOptions,
  ) => Promise<Record<string, unknown>[]>,
): FrappeClient {
  return { list } as unknown as FrappeClient;
}

function getTool(name: string) {
  const tool = analyticsTools.find((tool) => tool.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool;
}

for (const timezone of ["America/Los_Angeles", "Asia/Taipei"]) {
  for (const groupBy of ["total", "customer"]) {
    Deno.test(`revenue trend keeps calendar months and query boundary (${timezone}, ${groupBy})`, async () => {
      await atLocalMidnight(timezone, async () => {
        let filters: FrappeFilter[] | undefined;
        const client = mockClient(async (_doctype, options) => {
          filters = options.filters;
          // Devise explicite sur chaque ligne : les KPI/tendances monétaires
          // refusent désormais une devise inconnue (MISSING_CURRENCY) au lieu
          // de deviner. Les dates invalides lèvent INVALID_DATE (test dédié).
          return [
            {
              customer_name: "Acme",
              grand_total: 20,
              transaction_date: "2025-11-01",
              currency: "EUR",
            },
            {
              customer_name: "Acme",
              grand_total: 50,
              transaction_date: "2025-12-01",
              currency: "EUR",
            },
            {
              customer_name: "Acme",
              grand_total: 100,
              transaction_date: "2026-01-01",
              currency: "EUR",
            },
          ];
        });
        const result = await getTool("erpnext_revenue_trend").handler(
          { months: 3, group_by: groupBy },
          { client },
        ) as ChartResult;

        assertEquals(result.labels, ["Nov 25", "Dec 25", "Jan 26"]);
        assertEquals(result.datasets[0].values, [20, 50, 100]);
        assertEquals(filters, [
          ["transaction_date", ">=", "2025-11-01"],
          ["transaction_date", "<=", "2026-01-15"],
          ["docstatus", "!=", 2],
        ]);
      });
    });
  }

  Deno.test(`revenue KPI counts first-of-month sales and preserves six-month boundary (${timezone})`, async () => {
    await atLocalMidnight(timezone, async () => {
      let filters: FrappeFilter[] | undefined;
      const client = mockClient(async (_doctype, options) => {
        filters = options.filters;
        return [
          { grand_total: 10, transaction_date: "2025-08-01", currency: "EUR" },
          { grand_total: 50, transaction_date: "2025-12-01", currency: "EUR" },
          { grand_total: 100, transaction_date: "2026-01-01", currency: "EUR" },
        ];
      });
      const result = await getTool("erpnext_kpi_revenue").handler({}, {
        client,
      }) as {
        value: number;
        delta: number;
        sparkline: number[];
        sparklineLabels: string[];
      };

      assertEquals(result.value, 100);
      assertEquals(result.delta, 100);
      assertEquals(result.sparkline, [10, 0, 0, 0, 50, 100]);
      assertEquals(result.sparklineLabels, [
        "Aug 25",
        "Sep 25",
        "Oct 25",
        "Nov 25",
        "Dec 25",
        "Jan 26",
      ]);
      assertEquals(filters, [
        ["transaction_date", ">=", "2025-08-01"],
        ["transaction_date", "<=", "2026-01-15"],
        ["docstatus", "!=", 2],
      ]);
    });
  });

  Deno.test(`orders KPI preserves previous-month calendar boundaries (${timezone})`, async () => {
    await atLocalMidnight(timezone, async () => {
      const filters: (FrappeFilter[] | undefined)[] = [];
      const client = mockClient(async (_doctype, options) => {
        filters.push(options.filters);
        return [{ grand_total: 100 }];
      });
      await getTool("erpnext_kpi_orders").handler({}, { client });

      assertEquals(filters, [
        [
          ["transaction_date", ">=", "2026-01-01"],
          ["transaction_date", "<=", "2026-01-15"],
          ["docstatus", "!=", 2],
        ],
        [
          ["transaction_date", ">=", "2025-12-01"],
          ["transaction_date", "<=", "2025-12-31"],
          ["docstatus", "!=", 2],
        ],
      ]);
    });
  });

  Deno.test(`overdue KPI uses the local calendar day after midnight (${timezone})`, async () => {
    await atLocalMidnight(timezone, async () => {
      let filters: FrappeFilter[] | undefined;
      const client = mockClient(async (_doctype, options) => {
        filters = options.filters;
        return [];
      });
      await getTool("erpnext_kpi_overdue").handler({}, { client });

      assertEquals(filters, [
        ["due_date", "<", "2026-01-15"],
        ["outstanding_amount", ">", 0],
        ["docstatus", "=", 1],
      ]);
    });
  });

  Deno.test(`profit and loss preserves calendar months and query boundaries (${timezone})`, async () => {
    await atLocalMidnight(timezone, async () => {
      const queries: {
        doctype: string;
        filters: FrappeFilter[] | undefined;
      }[] = [];
      const client = mockClient(async (doctype, options) => {
        queries.push({ doctype, filters: options.filters });
        const amounts = doctype === "Sales Order" ? [20, 50, 100] : [5, 15, 30];
        return ["2025-11-01", "2025-12-01", "2026-01-01"].map(
          (transaction_date, index) => ({
            transaction_date,
            grand_total: amounts[index],
          }),
        );
      });
      const result = await getTool("erpnext_profit_loss").handler(
        { months: 3 },
        { client },
      ) as ChartResult;

      assertEquals(result.labels, ["Nov 25", "Dec 25", "Jan 26"]);
      assertEquals(result.datasets.map((dataset) => dataset.values), [
        [20, 50, 100],
        [5, 15, 30],
        [15, 35, 70],
      ]);
      assertEquals(
        queries,
        ["Sales Order", "Purchase Order"].map((doctype) => ({
          doctype,
          filters: [["transaction_date", ">=", "2025-11-01"], [
            "docstatus",
            "=",
            1,
          ]],
        })),
      );
    });
  });
}

// Une date illisible n'est plus ignorée en silence : la tendance et le KPI
// monétaires échouent explicitement (INVALID_DATE) plutôt que de sous-évaluer
// le total. Le compte de résultat, non monétaire scopé, conserve le saut.
Deno.test("revenue trend and revenue KPI reject an unreadable transaction_date", async () => {
  const client = mockClient(async () => [
    {
      customer_name: "Acme",
      grand_total: 999,
      transaction_date: "not-a-date",
      currency: "EUR",
    },
  ]);
  await assertRejects(
    () => getTool("erpnext_revenue_trend").handler({ months: 3 }, { client }),
    Error,
    "INVALID_DATE",
  );
  await assertRejects(
    () => getTool("erpnext_kpi_revenue").handler({}, { client }),
    Error,
    "INVALID_DATE",
  );
});
