import { assertStringIncludes } from "@std/assert";

const bars = await Deno.readTextFile(
  new URL("./BarsLevel.tsx", import.meta.url),
);
const levelBody = await Deno.readTextFile(
  new URL("./LevelBody.tsx", import.meta.url),
);

Deno.test("nested chart interaction - pointer and keyboard intents stay exclusive", () => {
  assertStringIncludes(bars, "useClickIntent()");
  assertStringIncludes(bars, "clickIntent.click(");
  assertStringIncludes(bars, "event.detail");
  assertStringIncludes(bars, "clickIntent.doubleClick(");
  assertStringIncludes(bars, "clickIntent.keyDown(");
  assertStringIncludes(bars, 'event.key === " "');
  assertStringIncludes(bars, 'event.key === "Enter"');
});

Deno.test("nested chart interaction - visible detail control is independent and touch sized", () => {
  assertStringIncludes(bars, "<DetailToggleButton");
  assertStringIncludes(bars, "touch={narrow}");
  assertStringIncludes(bars, "setCurrentPoint(point);");
  assertStringIncludes(bars, "isPointSelected");
  if (bars.includes("aria-expanded")) {
    throw new Error("A nested chart jump must not expose disclosure state");
  }
  assertStringIncludes(bars, "after:size-10");
  assertStringIncludes(bars, 'narrow ? "size-10" : "size-6"');
});

Deno.test("nested chart interaction - context is scoped and reconciled by level view", () => {
  assertStringIncludes(levelBody, "contextView={level.title}");
  assertStringIncludes(levelBody, "context.reconcileView");
  assertStringIncludes(levelBody, "level.key ?? level.id");
  assertStringIncludes(levelBody, "nestedChartContextCandidates(");
  assertStringIncludes(levelBody, "activateReversible(item)");
  assertStringIncludes(levelBody, "pointJump(labelIndex, seriesIndex)");
});
