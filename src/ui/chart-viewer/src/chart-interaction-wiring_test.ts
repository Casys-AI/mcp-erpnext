import { assertEquals, assertStringIncludes } from "@std/assert";

const source = await Deno.readTextFile(
  new URL("./ChartViewer.tsx", import.meta.url),
);

function between(start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0) return "";
  return source.slice(from, to);
}

Deno.test("chart wiring - radar, named scatter points and treemap leaves expose both pointer intents", () => {
  const pie = between("function PieDonutChart", "function RadarChartView");
  const radar = between(
    "function RadarChartView",
    "interface ScatterShapeProps",
  );
  assertStringIncludes(radar, "activateCategoricalPoint(");
  assertStringIncludes(radar, '"context"');
  assertStringIncludes(radar, '"drilldown"');

  const scatter = between(
    "function ScatterChartView",
    "interface TreemapContentProps",
  );
  assertStringIncludes(scatter, "chartScatterPointLabel(entry)");
  assertStringIncludes(scatter, "onClick={interactive");
  assertStringIncludes(scatter, "onDoubleClick={interactive");

  const treemap = between("function TreemapContent", "function flattenTree");
  assertStringIncludes(treemap, 'onDataClick(name, undefined, "context"');
  assertStringIncludes(treemap, 'onDataClick(name, undefined, "drilldown"');
  assertStringIncludes(pie, "<button");
  assertStringIncludes(pie, "event.stopPropagation();");
  assertStringIncludes(pie, '"context"');
  assertStringIncludes(pie, '"drilldown"');
});

Deno.test("chart wiring - full chart and legend expose the visible subset", () => {
  const legend = between("function ChartLegend", "function legendItems");
  const legendEntries = between("function legendItems", "function BandCursor");
  const categorical = between(
    "function activateCategoricalPoint",
    "const CATEGORICAL",
  );
  const content = between(
    "function ChartContent",
    "export function ChartViewer",
  );
  const treemap = between(
    "function TreemapView",
    "const KEYBOARD_CURSOR_MOVES",
  );

  assertStringIncludes(legend, "<button");
  assertStringIncludes(legend, "aria-pressed={item.visible}");
  assertStringIncludes(legend, "disabled={lastVisible}");
  assertStringIncludes(legendEntries, "chartSeriesNames(data).map");
  assertStringIncludes(content, "chartContextSelection(");
  assertStringIncludes(content, "const pointIndex = useMemo(");
  assertStringIncludes(content, "createChartPointContextIndex(data, rootKey)");
  assertStringIncludes(content, "[data, rootKey, contextLocale]");
  assertStringIncludes(content, "pointIndex.get(label, series)");
  assertStringIncludes(content, "[chartContext, ...pointIndex.values()]");
  assertStringIncludes(content, "activeContext.toggle(chartContext)");
  assertStringIncludes(
    content,
    "data-chart-context-control",
  );
  assertStringIncludes(
    content,
    "aria-pressed={chartSelected}",
  );
  assertStringIncludes(content, "data-chart-pointer-surface");
  assertEquals(
    content.includes('role={activeContext.supported ? "button" : undefined}'),
    false,
  );
  assertStringIncludes(content, "data={visibleData}");
  assertStringIncludes(
    content,
    "toggleHiddenChartSeries(data, current, series)",
  );
  assertStringIncludes(content, "<ChartKeyboardNavigator");
  assertStringIncludes(content, "activeContext.reconcileView(");
  assertStringIncludes(content, "visibleData.subtitle");
  assertStringIncludes(content, "visibleData.yAxisLabel");
  assertStringIncludes(categorical, "if (!series) return;");
  assertStringIncludes(categorical, "event.stopPropagation();");
  assertStringIncludes(treemap, "data-chart-whole-gutter");
});

Deno.test("chart wiring - detail remains double-click or Enter without a floating button", () => {
  const tooltip = between("function ChartTooltip", "function SharedXAxis");
  const keyboard = between(
    "function ChartKeyboardNavigator",
    "function ChartRouter",
  );

  assertEquals(source.includes("DetailToggleButton"), false);
  assertEquals(source.includes("ChartDetailAffordance"), false);
  assertStringIncludes(tooltip, '"chart.tooltip.click_action_context"');
  assertStringIncludes(keyboard, "if (event.detail === 0) return;");
  assertStringIncludes(keyboard, "aria-expanded={expandedState}");
  assertStringIncludes(keyboard, 'if (event.key === "Enter")');
  assertStringIncludes(source, "shouldHandleChartPointActivation(");
});
