import { assertEquals, assertStrictEquals } from "@std/assert";
import {
  chartJumpHint,
  chartPointLabel,
  chartSelectionAt,
  chartSeriesFromTarget,
  contextFallbackForJump,
  moveChartCursor,
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
    chartSelectionAt({ labels: [], datasets: DATA.datasets }, {
      labelIndex: 0,
      seriesIndex: 0,
    }),
    null,
  );
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

Deno.test("chart activation - inline jump suppresses only the prompt fallback", () => {
  assertEquals(
    contextFallbackForJump(true, "Show submitted purchase orders"),
    undefined,
  );
  assertEquals(
    contextFallbackForJump(false, "Show submitted purchase orders"),
    "Show submitted purchase orders",
  );
});
