import { assertEquals, assertMatch, assertStringIncludes } from "@std/assert";

const source = await Deno.readTextFile(
  new URL("./ChartViewer.tsx", import.meta.url),
);

function between(start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0) return "";
  return source.slice(from, to);
}

Deno.test("chart wiring - keyboard navigator isolates every pointer gesture from whole-chart selection", () => {
  const keyboard = between(
    "function ChartKeyboardNavigator",
    "function ChartDetailBar",
  );
  for (const handler of ["onClick", "onDblClick", "onContextMenu"]) {
    assertMatch(
      keyboard,
      new RegExp(
        `${handler}=\\{\\(event\\) => \\{\\s*event.stopPropagation\\(\\);`,
      ),
    );
  }
  for (
    const handler of [
      "onPointerDown",
      "onPointerUp",
      "onPointerMove",
      "onPointerCancel",
    ]
  ) {
    assertStringIncludes(
      keyboard,
      `${handler}={(event) => event.stopPropagation()}`,
    );
  }
});

Deno.test("chart wiring - column gestures retain indices and never resolve duplicate labels through a scale", () => {
  const bounds = between(
    "function ChartPlotBounds",
    "function activateColumnPoint",
  );
  assertEquals(bounds.includes("xScale"), false);
  const activate = between(
    "function activateColumnPoint",
    "function columnPointerHandlers",
  );
  assertStringIncludes(activate, "event.target");
  assertStringIncludes(activate, "selection.index");
  assertEquals(
    activate.includes("if (!svg || !bounds || !matrix) return;"),
    false,
  );
  assertStringIncludes(source, "pointIndex.get(label, series, index)");
});

Deno.test("chart wiring - visible Cartesian active dots expose exact point identity", () => {
  const cartesian = between(
    "function LineChartView",
    "interface SelectedPieShapeProps",
  );
  assertEquals((cartesian.match(/<ActiveColumnPoint/g) ?? []).length, 4);
  const activePoint = between(
    "function ActiveColumnPoint",
    "function LineChartView",
  );
  for (
    const attribute of [
      "data-chart-point-index={index}",
      'data-chart-mark="point"',
      "data-chart-series={series}",
    ]
  ) {
    assertStringIncludes(activePoint, attribute);
  }
});

Deno.test("chart wiring - Mac control-click echoes stop before point and whole-chart activation", () => {
  const handlers = between(
    "function columnPointerHandlers",
    "function activateCategoricalPoint",
  );
  assertMatch(
    handlers,
    /onClick:[\s\S]*?isMacControlClickEcho\(event, getBrowserPlatform\(\)\)[\s\S]*?event.stopPropagation\(\);[\s\S]*?return;/,
  );
  const whole = between("const onWholeChartClick", "const chartSelected");
  assertStringIncludes(
    whole,
    "isMacControlClickEcho(event, getBrowserPlatform())",
  );
});

Deno.test("chart wiring - radar, named scatter points and treemap leaves expose both pointer intents", () => {
  const pie = between("function PieLegend", "function RadarChartView");
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

Deno.test("chart wiring - pie legend keeps keyboard detail and context exclusive", () => {
  const pie = between("function PieLegend", "function PieDonutChart");

  assertStringIncludes(pie, "onDataKeyDown?.(entry.name, series, event)");
  assertStringIncludes(pie, '(event.key === " " && contextEnabled)');
  assertStringIncludes(pie, '(event.key === "Enter" && detailEnabled)');
  assertStringIncludes(pie, "if (event.detail === 0) return;");
  assertStringIncludes(
    pie,
    "formatPercent((entry.value / total) * 100, 0)",
  );
  assertEquals(pie.includes("Math.round((entry.value / total) * 100)"), false);
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
  assertStringIncludes(content, "pointIndex.get(label, series, index)");
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

Deno.test("chart wiring - detail stays on double-click or Enter, with no floating button on the chart", () => {
  const tooltip = between("function ChartTooltip", "function SharedXAxis");
  const keyboard = between(
    "function ChartKeyboardNavigator",
    "function ChartRouter",
  );

  assertEquals(source.includes("DetailToggleButton"), false);
  assertEquals(source.includes("ChartDetailAffordance"), false);
  // Les clés vivent dans chartTooltipHintKey (testé dans chart-interactions_test).
  assertStringIncludes(tooltip, "chartTooltipHintKey({");
  assertStringIncludes(keyboard, "if (event.detail === 0) return;");
  assertStringIncludes(keyboard, "aria-expanded={expandedState}");
  assertStringIncludes(keyboard, 'if (event.key === "Enter")');
  assertStringIncludes(source, "shouldHandleChartPointActivation(");
});

Deno.test("chart wiring - the tooltip hint comes from chartTooltipHintKey and the pie tooltip targets the slice", () => {
  const tooltip = between("function ChartTooltip", "function SharedXAxis");
  assertStringIncludes(tooltip, "chartTooltipHintKey({");
  assertEquals(
    tooltip.includes('"chart.tooltip.click_action_fallback"'),
    false,
  );

  const pie = between("function PieDonutChart", "function RadarChartView");
  assertStringIncludes(pie, "series={ds.label || undefined}");
  assertStringIncludes(pie, "hintByName");
  assertStringIncludes(pie, "clickOpensDetail={clickOpensDetail}");
});

Deno.test("chart wiring - treemap tiles and pie legend rows announce their gesture natively", () => {
  const treemap = between("function TreemapContent", "function flattenTree");
  assertStringIncludes(treemap, "<title>{tileTitle}</title>");
  assertStringIncludes(treemap, "chartTooltipHintKey({");

  const legend = between("function PieLegend", "function PieDonutChart");
  assertStringIncludes(legend, "title={hintKey ? t(hintKey) : undefined}");
  assertStringIncludes(legend, '(event.key === " " && opensDetail)');
});

Deno.test("chart wiring - click opens detail through a detail intent only for pie, donut and treemap without context", () => {
  const intent = between("function pointIntent", "const onDataClick");
  assertStringIncludes(intent, "clickOpensDetailPoint(label, series)");
  assertStringIncludes(intent, "detailOnClickIntent(");
  const helper = between(
    "function clickOpensDetailPoint",
    "function activatePoint",
  );
  assertStringIncludes(helper, "chartClickOpensDetail(");
  assertStringIncludes(helper, "data.type");
});

Deno.test("chart wiring - le dernier point activé alimente une barre d'action sous le graphe", () => {
  const content = between(
    "function ChartContent",
    "export function ChartViewer",
  );
  const bar = between("function ChartDetailBar", "function ChartRouter");

  // La décision est pure et partagée avec le double-clic / Entrée.
  assertStringIncludes(content, "chartFocusedDetailAction(");
  assertStringIncludes(content, "chartPointDetailMode(");
  assertStringIncludes(content, "focusDetailPoint(label, series, index)");
  assertStringIncludes(content, "setDetailFocus((current)");
  assertStringIncludes(content, "<ChartDetailBar");
  // Le bouton passe par l'arbitre : même chemin qu'Entrée, jamais le contexte.
  assertStringIncludes(content, "clickIntent.activateDetail(");
  // Hors de la scène du graphe (hauteur fixe) : elle ne redimensionne rien.
  const stage = content.indexOf("resolveChartStageHeight(data.height, narrow)");
  assertEquals(stage > 0 && content.indexOf("<ChartDetailBar") > stage, true);
  // Pas d'infobulle Recharts cliquable : un vrai bouton HTML.
  assertStringIncludes(bar, "<button");
  assertStringIncludes(bar, "chartDetailBarLabelKey(");
  assertStringIncludes(bar, "acceptsDetailToggleClick(event.detail)");
  assertStringIncludes(bar, "aria-expanded={expanded}");
  assertStringIncludes(bar, "aria-controls=");
  assertEquals(source.includes("DetailToggleButton"), false);
});

Deno.test("chart wiring - Cartesian column clicks share snapping and keep exact marks from selecting twice", () => {
  const cartesian = between(
    "function VerticalBarChart",
    "interface SelectedPieShapeProps",
  );
  assertEquals(
    (cartesian.match(/\.\.\.columnPointerHandlers\(data, onDataClick\)/g) ?? [])
      .length,
    4,
  );
  assertEquals(
    (cartesian.match(/<ChartPlotBounds \/>/g) ?? []).length,
    4,
  );
  const horizontal = between(
    "function HorizontalBarChart",
    "function LineChartView",
  );
  assertStringIncludes(horizontal, "onDoubleClick={onDataClick");
  const bars = between(
    "function VerticalBarChart",
    "function HorizontalBarChart",
  );
  const composed = between(
    "function ComposedChartView",
    "interface SelectedPieShapeProps",
  );
  assertEquals(bars.includes("onClick={onDataClick"), false);
  assertEquals(composed.includes("onClick={onDataClick"), false);
  const handlers = between(
    "function columnPointerHandlers",
    "function activateCategoricalPoint",
  );
  assertStringIncludes(handlers, "onDoubleClick:");
  assertStringIncludes(handlers, "onContextMenu:");
  assertStringIncludes(
    handlers,
    "isMacControlClick(event, getBrowserPlatform())",
  );
  assertStringIncludes(source, "if (contextMenu) event.preventDefault()");
  const activate = between(
    "function activateColumnPoint",
    "function columnPointerHandlers",
  );
  assertStringIncludes(activate, "chartPlotIntent(");
  assertStringIncludes(activate, "chartColumnSelection(");
  assertStringIncludes(activate, "event.stopPropagation()");
  assertStringIncludes(activate, "event.shiftKey");
  assertStringIncludes(activate, "event.detail");
});

Deno.test("chart wiring - title, axis labels and frame use the whole-chart gesture", () => {
  const content = between(
    "function ChartContent",
    "export function ChartViewer",
  );
  assertEquals(
    (content.match(/onClick=\{onWholeChartClick\}/g) ?? []).length,
    2,
  );
  assertStringIncludes(
    content,
    "const onWholeChartClick = activeContext.supported",
  );
});
