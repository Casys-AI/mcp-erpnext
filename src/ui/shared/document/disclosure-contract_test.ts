import { assertEquals, assertStringIncludes } from "@std/assert";

Deno.test("document surface owns one child-row disclosure across all tables", async () => {
  const surface = await Deno.readTextFile(
    new URL("./DocumentSurface.tsx", import.meta.url),
  );

  assertStringIncludes(surface, "const [disclosureState, setDisclosureState]");
  assertEquals(
    [...surface.matchAll(/activeDisclosure=\{activeDisclosure\}/g)].length,
    3,
  );
  assertEquals(
    [...surface.matchAll(/onDisclosureChange=\{setActiveDisclosure\}/g)]
      .length,
    3,
  );
});

Deno.test("child rows keep context and detail as sibling controls", async () => {
  const section = await Deno.readTextFile(
    new URL("./ChildTableSection.tsx", import.meta.url),
  );

  assertStringIncludes(section, "onActivate: () => {}");
  assertStringIncludes(section, "onDoubleActivate: toggle");
  assertStringIncludes(section, "<DetailToggleButton");
  assertStringIncludes(section, "<RowDisclosurePanel");
  assertStringIncludes(section, "id={presentation.rowPanelId}");
  assertEquals(
    [...section.matchAll(/<DetailToggleButton/g)].length,
    2,
  );
});

Deno.test("an embedded document exposes row actions without a nested disclosure", async () => {
  const panel = await Deno.readTextFile(
    new URL("../doclist/InlineDetailPanel.tsx", import.meta.url),
  );
  const section = await Deno.readTextFile(
    new URL("./ChildTableSection.tsx", import.meta.url),
  );

  assertStringIncludes(
    panel,
    'childRowActionsPlacement={embedded ? "visible" : "disclosure"}',
  );
  assertStringIncludes(
    section,
    'rowActionsPlacement === "disclosure"',
  );
  assertStringIncludes(section, "presentation.visibleActions");
});

Deno.test("a breadcrumb document level exposes actions without another disclosure", async () => {
  const level = await Deno.readTextFile(
    new URL("../levels/LevelBody.tsx", import.meta.url),
  );

  assertStringIncludes(level, 'childRowActionsPlacement="visible"');
});
