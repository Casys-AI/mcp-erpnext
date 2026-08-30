import { assertEquals, assertStrictEquals } from "@std/assert";
import {
  chartCursorCounts,
  chartDetailHintPlacement,
  chartJumpHint,
  chartNavigationGroups,
  chartPointActionPlan,
  chartPointExpansionState,
  chartPointLabel,
  chartScatterPointLabel,
  chartSelectionAt,
  chartSeriesFromTarget,
  moveChartCursor,
  resolveChartStageHeight,
} from "./chart-interactions.ts";
import type { ChartData } from "./types.ts";

const DATA: ChartData = {
  title: "Profit & Loss",
  labels: ["Jul 26", "Aug 26"],
  datasets: [
    { label: "Income", values: [10, 20] },
    { label: "Expenses", values: [4, 7] },
  ],
};

Deno.test("chart keyboard cursor - arrows move labels and series with wrapping", () => {
  assertEquals(
    moveChartCursor(
      { labelIndex: 0, seriesIndex: 0 },
      "previous-label",
      2,
      2,
    ),
    { labelIndex: 1, seriesIndex: 0 },
  );
  assertEquals(
    moveChartCursor(
      { labelIndex: 1, seriesIndex: 0 },
      "next-label",
      2,
      2,
    ),
    { labelIndex: 0, seriesIndex: 0 },
  );
  assertEquals(
    moveChartCursor(
      { labelIndex: 0, seriesIndex: 0 },
      "previous-series",
      2,
      2,
    ),
    { labelIndex: 0, seriesIndex: 1 },
  );
  assertEquals(
    moveChartCursor(
      { labelIndex: 0, seriesIndex: 1 },
      "next-series",
      2,
      2,
    ),
    { labelIndex: 0, seriesIndex: 0 },
  );
});

Deno.test("chart keyboard cursor - exposes the exact series value", () => {
  assertEquals(chartSelectionAt(DATA, { labelIndex: 1, seriesIndex: 1 }), {
    label: "Aug 26",
    series: "Expenses",
    value: 7,
  });
  assertEquals(
    chartSelectionAt({ title: "Empty", labels: [], datasets: DATA.datasets }, {
      labelIndex: 0,
      seriesIndex: 0,
    }),
    null,
  );
});

Deno.test("chart keyboard cursor - uses named scatter points without inventing labels", () => {
  const data: ChartData = {
    title: "Price vs quantity",
    type: "scatter",
    labels: [],
    datasets: [],
    scatterData: [
      {
        label: "Items",
        points: [
          { x: 12.5, y: 420, label: "BOLT-M6" },
          { x: 44, y: 96 },
          { x: 18, y: 210, label: "GADGET-1" },
          { x: Number.NaN, y: 12, label: "NOT-RENDERED" },
        ],
      },
    ],
  };

  assertEquals(chartNavigationGroups(data), [[
    {
      label: "BOLT-M6",
      series: "Items",
      value: 420,
      x: 12.5,
      y: 420,
    },
    {
      label: "GADGET-1",
      series: "Items",
      value: 210,
      x: 18,
      y: 210,
    },
  ]]);
  assertEquals(chartSelectionAt(data, { labelIndex: 1, seriesIndex: 0 }), {
    label: "GADGET-1",
    series: "Items",
    value: 210,
    x: 18,
    y: 210,
  });
  assertEquals(chartCursorCounts(data, { labelIndex: 0, seriesIndex: 0 }), {
    labelCount: 2,
    seriesCount: 1,
  });
});

Deno.test("chart keyboard cursor - traverses treemap leaves only", () => {
  const data: ChartData = {
    title: "Stock",
    type: "treemap",
    labels: [],
    datasets: [],
    treeData: [
      {
        name: "Mechanical",
        children: [
          { name: "Bearings", value: 48_200 },
          { name: "Belts", value: 31_700 },
          { name: "No value" },
        ],
      },
    ],
  };

  assertEquals(chartNavigationGroups(data), [[
    { label: "Bearings", value: 48_200 },
    { label: "Belts", value: 31_700 },
  ]]);
  assertEquals(chartSelectionAt(data, { labelIndex: 1, seriesIndex: 0 }), {
    label: "Belts",
    value: 31_700,
  });
});

Deno.test("chart jump - exact series takes priority over the category fallback", () => {
  const category = { label: "August", tool: "all", args: {} };
  const expenses = { label: "Expenses", tool: "purchase", args: {} };
  const data: ChartData = {
    ...DATA,
    _pointJumps: { "Aug 26": category },
    _seriesPointJumps: { "Aug 26": { Expenses: expenses } },
  };

  assertStrictEquals(chartJumpHint(data, "Aug 26", "Expenses"), expenses);
  assertStrictEquals(chartJumpHint(data, "Aug 26", "Income"), category);
  assertStrictEquals(chartJumpHint(data, "Aug 26"), category);
  assertEquals(chartJumpHint(data, "Missing", "Expenses"), undefined);
});

Deno.test("chart jump - a derived series can remain context-only", () => {
  const income = { label: "Income", tool: "sales", args: {} };
  const data: ChartData = {
    ...DATA,
    _seriesPointJumps: { "Aug 26": { Income: income } },
  };

  assertStrictEquals(chartJumpHint(data, "Aug 26", "Income"), income);
  assertEquals(chartJumpHint(data, "Aug 26", "Net Profit"), undefined);
});

Deno.test("chart mouse target - preserves point and exact marked series", () => {
  assertEquals(chartPointLabel(["0", "Aug 26"], { activeLabel: 0 }), "0");
  assertEquals(
    chartPointLabel(["Jul 26", "Aug 26"], { activeTooltipIndex: "1" }),
    "Aug 26",
  );
  assertEquals(
    chartPointLabel(["Jul 26"], { activeLabel: "stale", activeIndex: 4 }),
    undefined,
  );

  const marker = {
    getAttribute: (name: string) =>
      name === "data-chart-series" ? "Expenses" : null,
  };
  const child = { closest: () => marker };
  assertEquals(
    chartSeriesFromTarget(child, ["Income", "Expenses"]),
    "Expenses",
  );
  assertEquals(chartSeriesFromTarget(child, ["Income"]), undefined);
  assertEquals(chartSeriesFromTarget(null, ["Expenses"]), undefined);
});

Deno.test("chart activation - single click updates context only", () => {
  assertEquals(chartPointActionPlan("context", true, true, true), {
    toggleLevel: false,
    updateContext: true,
    sendMessage: false,
  });
  assertEquals(chartPointActionPlan("context", true, false, true), {
    toggleLevel: false,
    updateContext: false,
    sendMessage: false,
  });
});

Deno.test("chart activation - double click toggles detail or uses its explicit fallback", () => {
  assertEquals(chartPointActionPlan("drilldown", true, true, true), {
    toggleLevel: true,
    updateContext: false,
    sendMessage: false,
  });
  assertEquals(chartPointActionPlan("drilldown", false, true, true), {
    toggleLevel: false,
    updateContext: false,
    sendMessage: true,
  });
  assertEquals(chartPointActionPlan("drilldown", false, true, false), {
    toggleLevel: false,
    updateContext: false,
    sendMessage: false,
  });
  assertEquals(chartPointExpansionState(true, false), false);
  assertEquals(chartPointExpansionState(true, true), true);
  assertEquals(chartPointExpansionState(false, false), undefined);
});

Deno.test("chart scatter target - accepts only an explicit point label", () => {
  assertEquals(chartScatterPointLabel({ label: " BOLT-M6 " }), "BOLT-M6");
  assertEquals(
    chartScatterPointLabel({ payload: { label: "GADGET-1" } }),
    "GADGET-1",
  );
  assertEquals(chartScatterPointLabel({ payload: { label: " " } }), undefined);
  assertEquals(chartScatterPointLabel({ x: 12, y: 4 }), undefined);
});

Deno.test("chart stage height - uses an intrinsic default and clamps payloads", () => {
  assertEquals(resolveChartStageHeight(undefined, false), 300);
  assertEquals(resolveChartStageHeight(undefined, true), 260);
  assertEquals(resolveChartStageHeight(Number.NaN, false), 300);
  assertEquals(resolveChartStageHeight(180, false), 240);
  assertEquals(resolveChartStageHeight(360.4, false), 360);
  assertEquals(resolveChartStageHeight(900, false), 520);
});

Deno.test("chart detail helper - uses the side with the actual available space", () => {
  assertEquals(chartDetailHintPlacement(320, 30, 28), {
    side: "right",
    maxWidth: 248,
  });
  assertEquals(chartDetailHintPlacement(320, 180, 28), {
    side: "left",
    maxWidth: 166,
  });
  assertEquals(chartDetailHintPlacement(180, 80, 40), {
    side: "left",
    maxWidth: 66,
  });
});
