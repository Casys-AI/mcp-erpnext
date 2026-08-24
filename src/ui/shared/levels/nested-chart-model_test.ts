import { assertEquals, assertNotEquals } from "@std/assert";
import { chartOf } from "./bodies.ts";
import { nestedChartModel } from "./nested-chart-model.ts";

Deno.test("nested chart - Gross Profit garde deux axes et une ligne de marge", () => {
  const chart = chartOf({
    type: "composed",
    labels: ["Laptop", "Mouse"],
    datasets: [
      { label: "Revenue", values: [5000, 2500], type: "bar" },
      {
        label: "Margin %",
        values: [40, 20],
        type: "line",
        yAxisId: "right",
      },
    ],
    currency: "EUR",
    rightAxisLabel: "Margin %",
  })!;
  const model = nestedChartModel(chart);

  assertEquals(model.domains.left, { min: 0, max: 5000 });
  assertEquals(model.domains.right, { min: 0, max: 40 });
  assertEquals(model.series.map((series) => [series.kind, series.axis]), [
    ["bar", "left"],
    ["line", "right"],
  ]);
  assertNotEquals(model.series[1].linePath, undefined);
});

Deno.test("nested chart - un stack partage son slot et cumule sa base", () => {
  const chart = chartOf({
    type: "stacked-bar",
    labels: ["Acme"],
    datasets: [
      { label: "0-30", values: [10], stack: "aging" },
      { label: "31-60", values: [5], stack: "aging" },
    ],
  })!;
  const model = nestedChartModel(chart);

  assertEquals(model.domains.left, { min: 0, max: 15 });
  assertEquals(
    model.series[0].points[0].barLeft,
    model.series[1].points[0].barLeft,
  );
  assertEquals(model.series[1].points[0].baseY, model.series[0].points[0].y);
});

Deno.test("nested chart - une petite plage décimale occupe tout son domaine", () => {
  const chart = chartOf({
    type: "line",
    labels: ["A", "B"],
    datasets: [{ label: "Ratio", values: [0.1, 0.4] }],
  })!;
  const model = nestedChartModel(chart);

  assertEquals(model.domains.left, { min: 0, max: 0.4 });
  assertEquals(model.series[0].points.map((point) => point.y), [25, 100]);
});
