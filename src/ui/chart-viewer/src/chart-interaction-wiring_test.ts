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

Deno.test("chart wiring - keyboard navigation targets the same visible mark", () => {
  const keyboard = between(
    "function ChartKeyboardNavigator",
    "function ChartDetailBar",
  );
  assertStringIncludes(keyboard, "data-visual-item={chartMarkId(");
  assertStringIncludes(keyboard, "data-chart-no-range");
  assertStringIncludes(keyboard, "Space Shift+Space");
  assertMatch(
    keyboard,
    /onActivate\(\s*point\.label,\s*point\.series,\s*"inspect",\s*1,\s*point\.index/,
  );
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
  assertEquals(source.includes("onWholeChartClick"), false);
});

Deno.test("chart wiring - non-Cartesian marks share the visual gesture binder", () => {
  const radar = between(
    "function RadarChartView",
    "interface ScatterShapeProps",
  );
  const scatter = between(
    "function ScatterPointShape",
    "function ScatterChartView",
  );
  const treemap = between("function TreemapContent", "function flattenTree");
  const pie = between("function SelectedPieShape", "function PieDonutChart");
  assertStringIncludes(radar, "activateCategoricalPoint(");
  assertStringIncludes(radar, "<SelectedPointShape");
  assertStringIncludes(scatter, "chartScatterPointLabel(props.payload)");
  assertStringIncludes(scatter, 'chartMark(label ?? "", series || undefined)');
  assertStringIncludes(scatter, "data-chart-geometry");
  assertStringIncludes(treemap, "chartMark(name)");
  assertStringIncludes(treemap, "data-chart-geometry");
  assertStringIncludes(pie, "data-chart-sector");
  assertStringIncludes(
    pie,
    "data-visual-item={chartMarkId(entry.name, series)}",
  );
  assertStringIncludes(pie, "data-chart-no-range");
  assertStringIncludes(pie, "formatPercent((entry.value / total) * 100, 0)");
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

  assertStringIncludes(legend, "<button");
  assertStringIncludes(legend, "aria-pressed={item.visible}");
  assertStringIncludes(legend, "disabled={lastVisible && !canShareSeries}");
  assertStringIncludes(legendEntries, "chartSeriesNames(data).map");
  assertStringIncludes(content, "chartContextSelection(");
  assertStringIncludes(content, "const pointIndex = useMemo(");
  assertStringIncludes(content, "createChartPointContextIndex(data, rootKey)");
  assertStringIncludes(content, "[data, rootKey, contextLocale]");
  assertStringIncludes(content, "pointIndex.get(label, series, index)");
  assertStringIncludes(content, "...namedSeries.values()");
  assertStringIncludes(content, "data-visual-item={chartContext.id}");
  assertStringIncludes(content, "isSeriesSelected=");
  assertStringIncludes(content, "void activeContext.toggle(chartContext)");
  assertEquals(content.includes("activeContext.toggleReversible("), false);
  assertStringIncludes(content, "data-chart-pointer-surface");
  assertEquals(
    content.includes('role={activeContext.supported ? "button" : undefined}'),
    false,
  );
  assertStringIncludes(content, "data={visibleData}");
  assertStringIncludes(
    content,
    "toggleHiddenChartSeries(data, current, name)",
  );
  assertStringIncludes(content, "<ChartKeyboardNavigator");
  assertStringIncludes(content, "activeContext.reconcileView(");
  assertStringIncludes(content, "visibleData.subtitle");
  assertStringIncludes(content, "visibleData.yAxisLabel");
  assertStringIncludes(categorical, "if (!series) return;");
  assertStringIncludes(categorical, "event.stopPropagation();");
});

Deno.test("chart wiring - primary gestures open inline detail and the explicit message route remains", () => {
  const tooltip = between("function ChartTooltip", "function SharedXAxis");
  const keyboard = between(
    "function ChartKeyboardNavigator",
    "function ChartRouter",
  );
  const gestures = between(
    "const onDataClick: ChartDataClick",
    "const chartHandlers",
  );
  assertEquals(source.includes("DetailToggleButton"), false);
  assertStringIncludes(tooltip, "chartTooltipHintKey(");
  assertStringIncludes(keyboard, "aria-expanded={expandedState}");
  assertStringIncludes(keyboard, 'event.key === "Enter"');
  assertMatch(
    gestures,
    /if \(activation === "activate"\)[\s\S]*?pointDetailMode\(label, series\) === "inline"/,
  );
  assertStringIncludes(source, "void ask(fallback)");
});

Deno.test("chart wiring - the tooltip hint comes from chartTooltipHintKey and the pie tooltip targets the slice", () => {
  const tooltip = between("function ChartTooltip", "function SharedXAxis");
  assertStringIncludes(tooltip, "chartTooltipHintKey(");
  assertEquals(
    tooltip.includes('"chart.tooltip.click_action_fallback"'),
    false,
  );

  const pie = between("function PieDonutChart", "function RadarChartView");
  assertStringIncludes(pie, "series={ds.label || undefined}");
  assertStringIncludes(pie, "hintByName");
  assertStringIncludes(pie, "hintByName");
});

Deno.test("chart wiring - treemap tiles and pie legend rows announce their gesture natively", () => {
  const treemap = between("function TreemapContent", "function flattenTree");
  assertStringIncludes(treemap, "<title>{tileTitle}</title>");
  assertStringIncludes(treemap, "chartTooltipHintKey(");

  const legend = between("function PieLegend", "function PieDonutChart");
  assertStringIncludes(legend, "title={hintKey ? t(hintKey) : undefined}");
  assertStringIncludes(
    legend,
    'aria-keyshortcuts={sharedAt ? "Shift+Space" : undefined}',
  );
});

Deno.test("chart wiring - inspection and context rendering remain independent", () => {
  const gestures = between(
    "const onDataClick: ChartDataClick",
    "const chartHandlers",
  );
  assertStringIncludes(gestures, "focusDetailPoint(label, series, index)");
  assertStringIncludes(
    gestures,
    'if (event.key === " " && activeContext.supported)',
  );
  assertStringIncludes(
    source,
    "activeContext.supported ? isPointInContext : undefined",
  );
  assertStringIncludes(source, "strokeWidth={shared ? 6 : 0}");
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
  assertStringIncludes(content, "onToggle={() =>");
  assertStringIncludes(content, "openPointDetail(");
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
  assertStringIncludes(horizontal, "<SelectedBarShape");
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
  assertStringIncludes(
    between("function activateColumnPoint", "function columnPointerHandlers"),
    "activateNearestChartMark(",
  );
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

Deno.test("chart wiring - rectangle and individual gestures use identical point identities", () => {
  const content = between(
    "function ChartContent",
    "export function ChartViewer",
  );
  assertEquals(content.includes("ContextPinButton"), false);
  assertStringIncludes(
    content,
    "data-visual-selection-surface={activeContext.supported",
  );
  assertStringIncludes(content, 'activeContext.supported && "touch-pan-y"');
  assertStringIncludes(content, "onToggle: activeContext.supported");
  assertStringIncludes(content, "onAdd: activeContext.supported");
  assertStringIncludes(content, "visibleMarks.get(id)");
  assertStringIncludes(
    content,
    "pointContext(point.label, point.series, point.index)",
  );
  assertStringIncludes(content, "void activeContext.activateMany(members)");
});
