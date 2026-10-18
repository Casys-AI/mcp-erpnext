import { assertEquals } from "@std/assert";
import {
  type ChartColumnMark,
  chartColumnSelection,
  chartPlotIntent,
} from "./chart-interactions.ts";
import type { ChartData } from "./types.ts";

const data: ChartData = {
  title: "Évolution des ventes",
  type: "line",
  labels: ["Jan", "Feb"],
  datasets: [
    { label: "Revenue", values: [100, 200] },
    { label: "Rate", values: [1, 2], yAxisId: "right" },
  ],
};
const marks: ChartColumnMark[] = [
  { index: 0, series: "Revenue", kind: "point", x: 30, y: 90 },
  { index: 0, series: "Rate", kind: "point", x: 30, y: 20 },
  { index: 1, series: "Revenue", kind: "point", x: 90, y: 60 },
  { index: 1, series: "Rate", kind: "point", x: 90, y: 10 },
];

Deno.test("chart column - empty space snaps using Recharts column and rendered y, including dual axes", () => {
  assertEquals(
    chartColumnSelection(
      data,
      { activeTooltipIndex: "1" },
      { x: 65, y: 110 },
      marks,
    ),
    {
      label: "Feb",
      series: "Revenue",
      value: 200,
    },
  );
  assertEquals(
    chartColumnSelection(data, { activeLabel: "Jan" }, { x: 55, y: 5 }, marks),
    {
      label: "Jan",
      series: "Rate",
      value: 1,
    },
  );
});

Deno.test("chart column - hidden series and invalid values never become candidates", () => {
  const visible = { ...data, datasets: [data.datasets[0]] };
  assertEquals(
    chartColumnSelection(
      visible,
      { activeLabel: "Jan" },
      { x: 30, y: 20 },
      marks,
    )?.series,
    "Revenue",
  );
  assertEquals(
    chartColumnSelection({ ...data, datasets: [] }, { activeLabel: "Jan" }, {
      x: 30,
      y: 20,
    }, marks),
    undefined,
  );
  assertEquals(
    chartColumnSelection(
      { ...data, datasets: [{ label: "Revenue", values: [NaN, 200] }] },
      { activeLabel: "Jan" },
      { x: 30, y: 20 },
      marks,
    ),
    undefined,
  );
});

Deno.test("chart column - grouped bars prefer containment then nearest rectangle, including negative bars", () => {
  const bars: ChartColumnMark[] = [
    {
      index: 0,
      series: "Revenue",
      kind: "bar",
      x: 10,
      y: 10,
      width: 20,
      height: 90,
    },
    {
      index: 0,
      series: "Rate",
      kind: "bar",
      x: 35,
      y: 100,
      width: 20,
      height: -40,
    },
  ];
  for (
    const [x, y, series] of [[20, 80, "Revenue"], [40, 80, "Rate"], [
      60,
      110,
      "Rate",
    ], [8, 2, "Revenue"]] as const
  ) {
    assertEquals(
      chartColumnSelection(data, { activeLabel: "Jan" }, { x, y }, bars)
        ?.series,
      series,
    );
  }
});

Deno.test("chart column - stacked area uses rendered cumulative y and ties are stable", () => {
  assertEquals(
    chartColumnSelection(data, { activeLabel: "Jan" }, { x: 30, y: 55 }, marks)
      ?.series,
    "Revenue",
  );
  assertEquals(
    chartColumnSelection(data, { activeLabel: "Jan" }, { x: 30, y: 22 }, marks)
      ?.series,
    "Rate",
  );
});

Deno.test("chart column - a fresh tap or Mac contextmenu without Recharts state snaps to nearest column", () => {
  assertEquals(
    chartColumnSelection(data, undefined, { x: 69, y: 80 }, marks)?.label,
    "Feb",
  );
  assertEquals(
    chartColumnSelection(data, undefined, { x: 0, y: 20 }, marks)?.label,
    "Jan",
  );
  assertEquals(
    chartColumnSelection(data, undefined, { x: 69, y: 80 }, []),
    undefined,
  );
});

Deno.test("chart plot - empty space and boundaries stay point-only, Shift and margins select whole", () => {
  const plot = { x: 12, y: 8, width: 100, height: 100 };
  for (
    const pointer of [{ x: 12, y: 8 }, { x: 112, y: 108 }, { x: 60, y: 50 }]
  ) {
    assertEquals(chartPlotIntent(plot, pointer, false), "point");
    assertEquals(chartPlotIntent(plot, pointer, true), "whole");
  }
  assertEquals(chartPlotIntent(plot, { x: 11, y: 60 }, false), "whole");
  assertEquals(chartPlotIntent(plot, { x: 60, y: 109 }, false), "whole");
});

Deno.test("chart column - stale hover cannot redirect a tap or double-click to another column", () => {
  assertEquals(
    chartColumnSelection(data, { activeLabel: "Jan", activeTooltipIndex: 0 }, {
      x: 88,
      y: 58,
    }, marks)?.label,
    "Feb",
  );
});
