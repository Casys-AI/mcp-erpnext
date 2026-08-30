import { assertStringIncludes } from "@std/assert";

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
});

Deno.test("chart wiring - explicit detail stays outside the tooltip and keyboard clicks stay exclusive", () => {
  const tooltip = between("function ChartTooltip", "function SharedXAxis");
  const affordance = between(
    "function ChartDetailAffordance",
    "function ChartRouter",
  );
  const keyboard = between(
    "function ChartKeyboardNavigator",
    "function ChartDetailAffordance",
  );

  assertStringIncludes(affordance, "<DetailToggleButton");
  assertStringIncludes(
    affordance,
    'expanded={mode === "inline" ? expanded : undefined}',
  );
  assertStringIncludes(affordance, "hintSide={hintSide}");
  assertStringIncludes(tooltip, '"chart.tooltip.click_action_context"');
  assertStringIncludes(keyboard, "if (event.detail === 0) return;");
  assertStringIncludes(keyboard, "aria-expanded={expandedState}");
});
