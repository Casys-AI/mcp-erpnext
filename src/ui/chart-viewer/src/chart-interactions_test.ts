import { assert, assertEquals, assertStrictEquals } from "@std/assert";
import {
  activeContextSnapshot,
  reconcileActiveContextViewSelections,
  removeActiveContextSelection,
} from "../../shared/active-context.ts";
import {
  chartContextNamespace,
  chartContextSelection,
  chartCursorCounts,
  chartJumpHint,
  chartNavigationGroups,
  chartPointActionPlan,
  chartPointContextItem,
  chartPointExpansionState,
  chartPointLabel,
  chartScatterPointLabel,
  chartSelectionAt,
  chartSeriesFromTarget,
  chartSeriesNames,
  chartViewContextCandidates,
  chartVisibleSeriesNames,
  filterVisibleChartSeries,
  moveChartCursor,
  normalizeHiddenChartSeries,
  resolveChartStageHeight,
  shouldHandleChartPointActivation,
  toggleHiddenChartSeries,
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

Deno.test("chart activation - a context-only double click preserves the first click", () => {
  assertEquals(shouldHandleChartPointActivation("context", 1, false), true);
  assertEquals(shouldHandleChartPointActivation("context", 2, false), false);
  assertEquals(shouldHandleChartPointActivation("drilldown", 2, false), false);
  assertEquals(shouldHandleChartPointActivation("context", 2, true), true);
  assertEquals(shouldHandleChartPointActivation("drilldown", 2, true), true);
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

Deno.test("chart legend visibility - toggles series but preserves one visible", () => {
  assertEquals(chartSeriesNames(DATA), ["Income", "Expenses"]);
  assertEquals(normalizeHiddenChartSeries(DATA, ["Unknown", "Income"]), [
    "Income",
  ]);
  assertEquals(
    normalizeHiddenChartSeries(DATA, ["Income", "Expenses"]),
    ["Expenses"],
  );

  const incomeHidden = toggleHiddenChartSeries(DATA, [], "Income");
  assertEquals(incomeHidden, ["Income"]);
  assertEquals(chartVisibleSeriesNames(DATA, incomeHidden), ["Expenses"]);
  assertEquals(
    toggleHiddenChartSeries(DATA, incomeHidden, "Expenses"),
    incomeHidden,
  );
  assertEquals(toggleHiddenChartSeries(DATA, incomeHidden, "Income"), []);

  const duplicateLabels: ChartData = {
    ...DATA,
    datasets: [
      { label: "Income", values: [10, 20] },
      { label: " Income ", values: [30, 40] },
    ],
  };
  assertEquals(chartSeriesNames(duplicateLabels), ["Income"]);
  assertEquals(toggleHiddenChartSeries(duplicateLabels, [], "Income"), []);
  assertEquals(filterVisibleChartSeries(duplicateLabels, []).datasets, [
    { label: "Income", values: [10, 20] },
  ]);
});

Deno.test("chart legend visibility - filters composed datasets without mutating input", () => {
  const composed: ChartData = {
    ...DATA,
    type: "composed",
    datasets: [
      { label: "Income", values: [10, 20], type: "bar" },
      { label: "Expenses", values: [4, 7], type: "line" },
    ],
  };

  const filtered = filterVisibleChartSeries(composed, ["Income"]);
  assertEquals(filtered.datasets, [{
    label: "Expenses",
    values: [4, 7],
    type: "line",
  }]);
  assertEquals(composed.datasets.length, 2);
});

Deno.test("chart legend visibility - filters scatter series and keyboard targets", () => {
  const scatter: ChartData = {
    title: "Price vs quantity",
    type: "scatter",
    labels: [],
    datasets: [],
    scatterData: [
      { label: "Hardware", points: [{ x: 1, y: 2, label: "BOLT" }] },
      { label: "Software", points: [{ x: 3, y: 4, label: "ERP" }] },
    ],
  };

  const filtered = filterVisibleChartSeries(scatter, ["Hardware"]);
  assertEquals(filtered.scatterData, [{
    label: "Software",
    points: [{ x: 3, y: 4, label: "ERP" }],
  }]);
  assertEquals(chartNavigationGroups(filtered), [[{
    label: "ERP",
    series: "Software",
    x: 3,
    y: 4,
    value: 4,
  }]]);
});

Deno.test("chart legend visibility - derives series-bound subtitle and axes", () => {
  const radar: ChartData = {
    title: "Product Comparison",
    subtitle: "ITEM-A vs ITEM-B",
    type: "radar",
    labels: ["Revenue"],
    datasets: [
      { label: "ITEM-A", values: [80] },
      { label: "ITEM-B", values: [60] },
    ],
  };
  const radarVisible = filterVisibleChartSeries(radar, ["ITEM-B"]);
  assertEquals(radarVisible.subtitle, "ITEM-A");

  const composed: ChartData = {
    title: "Revenue vs Order Count",
    subtitle: "Top 8 customers",
    type: "composed",
    labels: ["Acme"],
    datasets: [
      { label: "Revenue", values: [100], type: "bar" },
      {
        label: "Orders",
        values: [3],
        type: "line",
        yAxisId: "right",
        unit: "orders",
      },
    ],
    yAxisLabel: "Revenue (€)",
    showRightAxis: true,
    rightAxisLabel: "# Orders",
    currency: "EUR",
  };

  const revenueOnly = filterVisibleChartSeries(composed, ["Orders"]);
  assertEquals(revenueOnly.yAxisLabel, "Revenue (€)");
  assertEquals(revenueOnly.showRightAxis, false);
  assertEquals(revenueOnly.rightAxisLabel, undefined);
  assertEquals(revenueOnly.subtitle, "Top 8 customers");

  const ordersOnly = filterVisibleChartSeries(composed, ["Revenue"]);
  assertEquals(ordersOnly.yAxisLabel, undefined);
  assertEquals(ordersOnly.showRightAxis, true);
  assertEquals(ordersOnly.rightAxisLabel, "# Orders");

  const ordersResource = chartContextSelection(
    composed,
    ["Revenue"],
    "Visible chart",
    "chart:revenue-vs-orders",
  ).resource;
  assert(ordersResource);
  assertEquals(
    "currency" in JSON.parse(new TextDecoder().decode(ordersResource.bytes)),
    false,
  );

  const dated = filterVisibleChartSeries({
    ...composed,
    subtitle: "Last 6 months",
  }, ["Orders"]);
  assertEquals(dated.subtitle, "Last 6 months");

  const seriesBound = filterVisibleChartSeries({
    ...composed,
    subtitle: "Revenue and Orders by customer",
  }, ["Orders"]);
  assertEquals(seriesBound.subtitle, undefined);

  const resource = chartContextSelection(
    composed,
    ["Orders"],
    "Visible chart",
    "chart:revenue-vs-orders",
  ).resource;
  assert(resource);
  assertEquals(JSON.parse(new TextDecoder().decode(resource.bytes)), {
    title: "Revenue vs Order Count",
    subtitle: "Top 8 customers",
    type: "composed",
    labels: ["Acme"],
    datasets: [{
      label: "Revenue",
      values: [100],
      type: "bar",
      currency: "EUR",
    }],
    yAxisLabel: "Revenue (€)",
  });

  const marginResource = chartContextSelection(
    {
      ...composed,
      title: "Gross Profit by Customer",
      datasets: [
        { label: "Revenue", values: [100], type: "bar" },
        {
          label: "Margin %",
          values: [28],
          type: "line",
          yAxisId: "right",
        },
      ],
      rightAxisLabel: "Margin %",
    },
    ["Revenue"],
    "Visible chart",
    "chart:gross-profit",
  ).resource;
  assert(marginResource);
  const marginPayload = JSON.parse(
    new TextDecoder().decode(marginResource.bytes),
  );
  assertEquals(marginPayload.datasets, [{
    label: "Margin %",
    values: [28],
    type: "line",
    yAxisId: "right",
    unit: "%",
  }]);
  assertEquals("currency" in marginPayload, false);
});

Deno.test("chart whole context - keeps one id and contains only visible values", () => {
  const identity = "chart:revenue-request";
  const whole = chartContextSelection(DATA, [], "Visible chart", identity);
  const incomeOnly = chartContextSelection(
    DATA,
    ["Expenses"],
    "Visible chart",
    identity,
  );

  assertEquals(incomeOnly.id, whole.id);
  assertEquals(incomeOnly.value, "Income · Jul 26 → Aug 26");
  assertEquals(activeContextSnapshot([incomeOnly]).items, [{
    id: `${chartContextNamespace(identity)}:whole`,
    view: "Profit & Loss",
    label: "Visible chart",
    value: "Income · Jul 26 → Aug 26",
  }]);

  assert(incomeOnly.resource);
  const payload = JSON.parse(
    new TextDecoder().decode(incomeOnly.resource.bytes),
  );
  assertEquals(payload, {
    title: "Profit & Loss",
    type: "bar",
    labels: ["Jul 26", "Aug 26"],
    datasets: [{ label: "Income", values: [10, 20] }],
  });
  assertEquals(JSON.stringify(payload).includes("Expenses"), false);
  assertEquals(JSON.stringify(payload).includes("[4,7]"), false);
  assertEquals(
    incomeOnly.resource.textFallback,
    new TextDecoder().decode(incomeOnly.resource.bytes),
  );
});

Deno.test("chart visibility - hidden selected points stay, whole chart follows the visible subset", () => {
  const identity = "chart:revenue-request";
  const whole = chartContextSelection(DATA, [], "Visible chart", identity);
  const hiddenPoint = chartPointContextItem(
    DATA,
    identity,
    "Aug 26",
    "Expenses",
  );
  const visibleWhole = chartContextSelection(
    DATA,
    ["Expenses"],
    "Visible chart",
    identity,
  );
  const hiddenCandidates = chartViewContextCandidates(
    DATA,
    ["Expenses"],
    "Visible chart",
    identity,
  );

  assertEquals(
    hiddenCandidates.some((candidate) => candidate.id === hiddenPoint.id),
    true,
  );
  const wholeCandidate = hiddenCandidates.find((candidate) =>
    candidate.id === whole.id
  );
  assertEquals(wholeCandidate?.value, visibleWhole.value);
  assert(wholeCandidate?.resource);
  const visiblePayload = JSON.parse(
    new TextDecoder().decode(wholeCandidate.resource.bytes),
  );
  assertEquals(visiblePayload.datasets, [{
    label: "Income",
    values: [10, 20],
  }]);
  assertEquals(JSON.stringify(visiblePayload).includes("Expenses"), false);

  const reconciled = reconcileActiveContextViewSelections(
    [{ scopeKey: "chart-root", item: whole }, {
      scopeKey: "chart-root",
      item: hiddenPoint,
    }],
    "chart-root",
    identity,
    hiddenCandidates,
  );

  assertEquals(reconciled.map((selection) => selection.item.id), [
    whole.id,
    hiddenPoint.id,
  ]);
  assertEquals(reconciled[0].item.value, "Income · Jul 26 → Aug 26");
  assertEquals(reconciled[1].item.value, hiddenPoint.value);

  const shown = reconcileActiveContextViewSelections(
    reconciled,
    "chart-root",
    identity,
    chartViewContextCandidates(DATA, [], "Visible chart", identity),
  );
  assertEquals(
    shown.some((selection) => selection.item.id === hiddenPoint.id),
    true,
  );
  assertEquals(shown[0].item.value, whole.value);

  const removed = removeActiveContextSelection(shown, {
    scopeKey: "chart-root",
    item: hiddenPoint,
  });
  assertEquals(
    removed.some((selection) => selection.item.id === hiddenPoint.id),
    false,
  );
  assertEquals(removed.map((selection) => selection.item.id), [whole.id]);
});

Deno.test("chart visibility - refresh updates a hidden point; dropping it from data removes it", () => {
  const identity = "chart:revenue-request";
  const hiddenPoint = chartPointContextItem(
    DATA,
    identity,
    "Aug 26",
    "Expenses",
  );
  const refreshed: ChartData = {
    ...DATA,
    datasets: [
      { label: "Income", values: [10, 20] },
      { label: "Expenses", values: [4, 17_000] },
    ],
  };
  const refreshedPoint = chartPointContextItem(
    refreshed,
    identity,
    "Aug 26",
    "Expenses",
  );
  assertEquals(refreshedPoint.id, hiddenPoint.id);
  assertEquals(refreshedPoint.value === hiddenPoint.value, false);

  const whileHidden = reconcileActiveContextViewSelections(
    [{ scopeKey: identity, item: hiddenPoint }],
    identity,
    identity,
    chartViewContextCandidates(
      refreshed,
      ["Expenses"],
      "Visible chart",
      identity,
    ),
  );
  assertEquals(whileHidden.length, 1);
  assertEquals(whileHidden[0].item.value, refreshedPoint.value);

  const withoutExpenses: ChartData = {
    ...DATA,
    datasets: [{ label: "Income", values: [10, 20] }],
  };
  const dropped = reconcileActiveContextViewSelections(
    whileHidden,
    identity,
    identity,
    chartViewContextCandidates(
      withoutExpenses,
      [],
      "Visible chart",
      identity,
    ),
  );
  assertEquals(
    dropped.some((selection) => selection.item.id === hiddenPoint.id),
    false,
  );

  const otherRoot = chartViewContextCandidates(
    DATA,
    [],
    "Visible chart",
    "chart:other-request",
  );
  assertEquals(
    otherRoot.some((candidate) => candidate.id === hiddenPoint.id),
    false,
  );
});

Deno.test("chart whole context - a refresh title change keeps and refreshes the same selection", () => {
  const identity =
    'chart:{"request":{"args":{"limit":30},"name":"erpnext_price_vs_qty"}}';
  const before = chartContextSelection(
    {
      title: "Valuation Rate vs Stock Qty",
      type: "scatter",
      labels: [],
      datasets: [],
      scatterData: [{
        label: "Items",
        points: [{ x: 10, y: 4, label: "BOLT" }],
      }],
    },
    [],
    "Visible chart",
    identity,
  );
  const after = chartContextSelection(
    {
      title: "Price vs Quantity Ordered",
      type: "scatter",
      labels: [],
      datasets: [],
      scatterData: [{
        label: "Items",
        points: [{ x: 12, y: 6, label: "BOLT" }],
      }],
    },
    [],
    "Visible chart",
    identity,
  );

  assertEquals(after.id, before.id);
  const reconciled = reconcileActiveContextViewSelections(
    [{ scopeKey: identity, item: before }],
    identity,
    identity,
    [after],
  );
  assertEquals(reconciled.length, 1);
  assertEquals(reconciled[0].item.view, "Price vs Quantity Ordered");
  assert(reconciled[0].item.resource);
  assertEquals(
    JSON.parse(
      new TextDecoder().decode(reconciled[0].item.resource?.bytes),
    ).scatterData[0].points[0],
    { x: 12, y: 6, label: "BOLT" },
  );
});

Deno.test("chart refresh context - aggregates repeated labels in payload order", () => {
  const data: ChartData = {
    title: "Repeated categories",
    labels: ["July", "July"],
    datasets: [
      { label: "Income", values: [10, 20], unit: "%" },
      { label: "Expenses", values: [4, 7] },
    ],
  };
  const points = chartViewContextCandidates(data, [], "Visible", "root").slice(
    1,
  );
  assertEquals(points.map((point) => point.label), [
    "July",
    "July · Income",
    "July · Expenses",
  ]);
  assertEquals(points.map((point) => point.value), [
    "Income: 10% · Income: 20% · Expenses: 4 · Expenses: 7",
    "10% · 20%",
    "4 · 7",
  ]);
});

Deno.test("chart refresh context - reads point values once for a large dataset", () => {
  let reads = 0;
  const values = new Proxy(Array.from({ length: 1000 }, (_, i) => i), {
    get(target, property, receiver) {
      if (typeof property === "string" && /^\d+$/.test(property)) reads++;
      return Reflect.get(target, property, receiver);
    },
  });
  const data: ChartData = {
    title: "Large chart",
    labels: values.map((_, i) => `Day ${i}`),
    datasets: [{ label: "Revenue", values }],
  };
  reads = 0;
  const candidates = chartViewContextCandidates(data, [], "Visible", "large");
  assertEquals(candidates.length, 2001);
  assert(reads <= 3000, `Expected linear value reads, got ${reads}`);
  assertEquals(candidates.at(-1)?.value, "999");
});
