import { assertEquals, assertStringIncludes } from "@std/assert";

const bars = await Deno.readTextFile(
  new URL("./BarsLevel.tsx", import.meta.url),
);
const levelBody = await Deno.readTextFile(
  new URL("./LevelBody.tsx", import.meta.url),
);

Deno.test("nested chart interaction - pointer and keyboard intents stay exclusive", () => {
  assertStringIncludes(bars, "inspectPoint(");
  assertStringIncludes(bars, "<ContextPinButton");
  assertStringIncludes(bars, 'case "ArrowLeft"');
  assertStringIncludes(bars, "openPointDetail(");
  assertStringIncludes(bars, "keyDownPoint(");
  assertStringIncludes(bars, 'event.key === " "');
  assertStringIncludes(bars, 'event.key === "Enter"');
  assertEquals(bars.includes("clickCount < 2"), false);
});

Deno.test("nested chart interaction - detail opens on double-click, Enter or the visible per-bar button", () => {
  // Voie tactile : un bouton par barre qui a un détail, sans pied de graphe.
  assertStringIncludes(bars, "DetailToggleButton");
  assertStringIncludes(bars, "onPointDetail?.(");
  assertStringIncludes(bars, "canOpenPoint(labelIndex, seriesIndex)");
  // Chaque série garde son emplacement : le bouton reste sous sa barre.
  assertStringIncludes(bars, "detailSlotCount");
  assertStringIncludes(bars, 'hint={t("interaction.detail.button_hint")}');
  assertStringIncludes(bars, "touch={narrow}");
  // Le saut reste une action : jamais d'état de disclosure.
  assertEquals(bars.includes("expanded="), false);
  assertStringIncludes(bars, "onDblClick=");
  assertStringIncludes(bars, 'event.key === "Enter"');
  assertStringIncludes(bars, "onPointDetail?.(");
  assertStringIncludes(bars, "setCurrentPoint({");
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
  assertStringIncludes(levelBody, "context!.toggle(item)");
  assertStringIncludes(levelBody, "pointJump(labelIndex, seriesIndex)");
});
