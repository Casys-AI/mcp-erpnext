import { assertEquals, assertStringIncludes } from "@std/assert";

const bars = await Deno.readTextFile(
  new URL("./BarsLevel.tsx", import.meta.url),
);
const levelBody = await Deno.readTextFile(
  new URL("./LevelBody.tsx", import.meta.url),
);

Deno.test("nested chart delegates direct point, path and rectangle gestures", () => {
  assertStringIncludes(bars, "useChartGestures<HTMLDivElement>");
  assertStringIncludes(
    bars,
    'data-visual-selection-surface={onPointRange ? "" : undefined}',
  );
  assertStringIncludes(
    bars,
    'onPointRange && !overflowsHorizontally ? "touch-pan-y" : ""',
  );
  assertStringIncludes(bars, "data-visual-selection-start");
  assertStringIncludes(bars, "data-chart-geometry");
  assertStringIncludes(bars, "activateNearestChartMark(");
  assertStringIncludes(bars, "openPointDetail(label, series)");
  assertStringIncludes(bars, "onPointContext(label, series)");
  assertStringIncludes(bars, "onPointRange(ids.map");
  assertStringIncludes(bars, "aria-pressed={shared}");
  assertEquals(bars.includes("ContextPinButton"), false);
});

Deno.test("nested chart preserves arrow navigation and visible detail buttons", () => {
  assertStringIncludes(bars, 'case "ArrowLeft"');
  assertStringIncludes(bars, "inspectPoint(label, series)");
  assertStringIncludes(bars, "DetailToggleButton");
  assertStringIncludes(bars, "onPointDetail?.(");
  assertStringIncludes(bars, "canOpenPoint(labelIndex, seriesIndex)");
  assertStringIncludes(bars, "detailSlotCount");
  assertStringIncludes(bars, 'hint={t("interaction.detail.button_hint")}');
  assertStringIncludes(bars, "touch={narrow}");
  assertEquals(bars.includes("aria-expanded"), false);
  assertStringIncludes(bars, "after:size-10");
  assertStringIncludes(bars, 'narrow ? "size-10" : "size-6"');
});

Deno.test("nested chart reconciles individual and rectangle selections against its level", () => {
  assertStringIncludes(levelBody, "contextView={level.title}");
  assertStringIncludes(levelBody, "context.reconcileView");
  assertStringIncludes(levelBody, "level.key ?? level.id");
  assertStringIncludes(levelBody, "nestedChartContextCandidates(");
  assertStringIncludes(levelBody, "context!.toggle(item)");
  assertStringIncludes(levelBody, "context!.activateMany(items)");
  assertStringIncludes(levelBody, "pointJump(labelIndex, seriesIndex)");
});
