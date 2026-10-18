import { assertEquals } from "@std/assert";
import {
  type ChartColumnMark,
  chartColumnSelection,
  chartFocusedDetailAction,
  chartMarkFromTarget,
  chartPlotIntent,
  chartSelectionAt,
  createChartPointContextIndex,
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
      index: 1,
      label: "Feb",
      series: "Revenue",
      value: 200,
    },
  );
  assertEquals(
    chartColumnSelection(data, { activeLabel: "Jan" }, { x: 55, y: 5 }, marks),
    {
      index: 0,
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

Deno.test("chart column - a point wins an exact overlap with a bar without a known event target", () => {
  const overlapping: ChartColumnMark[] = [
    {
      index: 0,
      series: "Revenue",
      kind: "bar",
      x: 20,
      y: 10,
      width: 20,
      height: 90,
    },
    { index: 0, series: "Rate", kind: "point", x: 30, y: 20 },
  ];
  assertEquals(
    chartColumnSelection(data, undefined, { x: 30, y: 20 }, overlapping)
      ?.series,
    "Rate",
  );
});

Deno.test("chart column - duplicate labels use mark indexes when column scale coordinates are invalid", () => {
  const duplicates: ChartData = {
    ...data,
    labels: ["July", "July", "August"],
    datasets: [{ label: "Revenue", values: [100, 200, 300] }],
  };
  const duplicateMarks: ChartColumnMark[] = [
    { index: 0, series: "Revenue", kind: "point", x: 30, y: 90 },
    { index: 1, series: "Revenue", kind: "point", x: 90, y: 60 },
    { index: 2, series: "Revenue", kind: "point", x: 150, y: 30 },
  ];
  for (
    const state of [undefined, { activeLabel: "July", activeTooltipIndex: 0 }]
  ) {
    assertEquals(
      chartColumnSelection(
        duplicates,
        state,
        { x: 90, y: 60 },
        duplicateMarks,
        [NaN, NaN, NaN],
      ),
      { index: 1, label: "July", series: "Revenue", value: 200 },
    );
  }
});

Deno.test("chart column - duplicate labels retain the selected index in point context", () => {
  const duplicates: ChartData = {
    ...data,
    labels: ["July", "July", "August"],
    datasets: [{ label: "Revenue", values: [100, 200, 300] }],
  };
  const index = createChartPointContextIndex(duplicates, "duplicates");
  const first = index.get("July", "Revenue", 0);
  const second = index.get("July", "Revenue", 1);
  assertEquals(first.value, "100");
  assertEquals(second.value, "200");
  assertEquals(first.id === second.id, false);
  assertEquals([...index.values()].some((item) => item.id === second.id), true);
  assertEquals(index.get("July", "Revenue", 2).value, undefined);
  const capabilities = { jumpsEnabled: false, messagesEnabled: true };
  const focus = { label: "July", series: "Revenue", index: 1 };
  assertEquals(
    chartFocusedDetailAction(
      { ...duplicates, _drillDown: "Explain {label}" },
      capabilities,
      focus,
    ),
    { ...focus, mode: "message" },
  );
  assertEquals(
    chartFocusedDetailAction(
      { ...duplicates, labels: ["July"], _drillDown: "Explain {label}" },
      capabilities,
      focus,
    ),
    null,
  );
});

function targetFor(mark: ChartColumnMark) {
  const attrs: Record<string, string> = {
    "data-chart-point-index": String(mark.index),
    "data-chart-series": mark.series ?? "",
    "data-chart-mark": mark.kind,
  };
  return {
    closest: (_selector: string) => ({
      getAttribute: (name: string) => attrs[name] ?? null,
    }),
  };
}

Deno.test("chart column - an exact known point or bar target wins before snapping for click and double-click", () => {
  const overlapping: ChartColumnMark[] = [
    {
      index: 0,
      series: "Revenue",
      kind: "bar",
      x: 20,
      y: 10,
      width: 20,
      height: 90,
    },
    { index: 0, series: "Rate", kind: "point", x: 30, y: 20 },
    {
      index: 1,
      series: "Revenue",
      kind: "bar",
      x: 80,
      y: 10,
      width: 20,
      height: 90,
    },
  ];
  for (const mark of overlapping) {
    assertEquals(chartMarkFromTarget(targetFor(mark), overlapping), mark);
    assertEquals(
      chartColumnSelection(
        data,
        { activeTooltipIndex: 1 },
        { x: 30, y: 20 },
        overlapping,
        undefined,
        targetFor(mark),
      ),
      {
        index: mark.index,
        label: data.labels[mark.index],
        series: mark.series,
        value: data.datasets.find((dataset) => dataset.label === mark.series)!
          .values[mark.index],
      },
    );
  }
  for (
    const target of [
      null,
      {},
      targetFor({ ...overlapping[0], series: "Hidden" }),
      targetFor({ ...overlapping[1], index: 3 }),
    ]
  ) {
    assertEquals(chartMarkFromTarget(target, overlapping), undefined);
    assertEquals(
      chartColumnSelection(
        data,
        undefined,
        { x: 30, y: 20 },
        overlapping,
        undefined,
        target,
      )?.series,
      "Rate",
    );
  }
});

Deno.test("chart column - duplicate labels fall back only to the current tooltip index without usable coordinates", () => {
  const duplicates: ChartData = {
    ...data,
    labels: ["July", "July", "August"],
    datasets: [{ label: "Revenue", values: [100, 200, 300] }],
  };
  for (const pointer of [{ x: NaN, y: NaN }, { x: 90, y: 60 }]) {
    for (
      const missingMarks of [[], [{
        index: 1,
        series: "Revenue",
        kind: "point" as const,
        x: NaN,
        y: NaN,
      }]]
    ) {
      assertEquals(
        chartColumnSelection(
          duplicates,
          { activeLabel: "July", activeTooltipIndex: "1" },
          pointer,
          missingMarks,
        ),
        { index: 1, label: "July", series: "Revenue", value: 200 },
      );
      for (
        const activeTooltipIndex of [undefined, null, -1, 3, 0.5, "July", ""]
      ) {
        assertEquals(
          chartColumnSelection(
            duplicates,
            { activeLabel: "July", activeTooltipIndex },
            pointer,
            missingMarks,
          ),
          undefined,
        );
      }
    }
  }
});

for (const type of ["horizontal-bar", "radar"] as const) {
  const legacy: ChartData = {
    ...data,
    type,
    labels: ["July", "July"],
    datasets: [{ label: "Revenue", values: [100, 200] }],
  };
  Deno.test(`chart column - ${type} preserves legacy pointer and shape identity`, () => {
    const index = createChartPointContextIndex(legacy, "legacy");
    const pointerSelection = index.get("July", "Revenue");
    assertEquals(index.get("July", "Revenue", 1), pointerSelection);
  });
  Deno.test(`chart column - ${type} preserves legacy keyboard identity`, () => {
    const index = createChartPointContextIndex(legacy, "legacy");
    const pointerSelection = index.get("July", "Revenue");
    const keyboardSelection = chartSelectionAt(legacy, {
      labelIndex: 1,
      seriesIndex: 0,
    });
    assertEquals(keyboardSelection, {
      label: "July",
      series: "Revenue",
      value: 200,
    });
    assertEquals(
      index.get(
        keyboardSelection!.label,
        keyboardSelection!.series,
        keyboardSelection!.index,
      ),
      pointerSelection,
    );
  });
}
