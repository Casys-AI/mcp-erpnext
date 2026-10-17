import { assertEquals, assertStringIncludes } from "@std/assert";
import { acceptsDetailToggleClick } from "./detail-toggle.ts";

Deno.test("detail toggle - clic, clavier et double-clic restent deterministes", () => {
  assertEquals(acceptsDetailToggleClick(0), true);
  assertEquals(acceptsDetailToggleClick(1), true);
  assertEquals(acceptsDetailToggleClick(2), false);
  assertEquals(acceptsDetailToggleClick(3), false);
  assertEquals(acceptsDetailToggleClick(Number.NaN), false);
});

Deno.test("detail toggle - actionLabel et hint remplacent les libellés par défaut sans les changer", async () => {
  const source = await Deno.readTextFile(
    new URL("./DetailToggleButton.tsx", import.meta.url),
  );

  assertStringIncludes(source, "actionLabel?: string;");
  assertStringIncludes(source, "hint?: string;");
  assertStringIncludes(source, "actionLabelOverride ?? t(");
  assertStringIncludes(source, "hintOverride ?? t(");
  // Rendu par défaut inchangé : mêmes clés d'ouverture / fermeture.
  assertStringIncludes(source, '"interaction.detail.close"');
  assertStringIncludes(source, '"interaction.detail.open"');
  assertStringIncludes(source, '"interaction.detail.close_hint"');
  assertStringIncludes(source, '"interaction.detail.open_hint"');
});
