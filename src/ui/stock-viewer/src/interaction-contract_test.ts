import { assertEquals, assertMatch, assertStringIncludes } from "@std/assert";

Deno.test("stock viewer - contexte et detail gardent des commandes exclusives", async () => {
  const source = await Deno.readTextFile(
    new URL("./StockViewer.tsx", import.meta.url),
  );

  assertStringIncludes(
    source,
    "const activeContext = useActiveContext(app, rootKey)",
  );
  assertEquals(source.includes("ContextPinButton"), false);
  assertStringIncludes(
    source,
    "context.toggleGroupMember(binGroup, member)",
  );
  assertStringIncludes(
    source,
    "context.supported ? isContextSelected : undefined",
  );
  assertStringIncludes(
    source,
    "context.addGroupMembers(binGroup, members, singles)",
  );
  assertStringIncludes(source, "context.activateMany(singles)");
  assertStringIncludes(source, "useVisualItemGestures({");
  assertStringIncludes(
    source,
    "if (row && context.supported) toggleStockContext(row)",
  );
  assertStringIncludes(
    source,
    "nav.toggleRootChild(jump, contextItemFor(row).id)",
  );
  assertEquals(source.includes("context.toggleReversible(contextItem)"), false);
  assertEquals(source.includes("nav.jump(jump)"), false);
});

Deno.test("stock viewer - detail explicite, aria et niveaux imbriques restent cables", async () => {
  const source = await Deno.readTextFile(
    new URL("./StockViewer.tsx", import.meta.url),
  );
  const inline = await Deno.readTextFile(
    new URL("./components/StockInlineExpand.tsx", import.meta.url),
  );

  assertStringIncludes(source, "<ActiveContextChip");
  assertEquals(source.includes("<DetailToggleButton"), false);
  assertEquals(source.includes("showDetailColumn"), false);
  assertStringIncludes(
    source,
    'const RowControl = canDrill ? "button" : "div"',
  );
  assertStringIncludes(source, "label: detailLabel");
  assertStringIncludes(
    source,
    "{canDrill && <DisclosureChevron expanded={isExpanded} />}",
  );
  assertStringIncludes(source, "controls: isExpanded ? detailId");
  assertMatch(source, /<section\s+id=\{detailId\}/s);
  assertMatch(source, /<div id=\{detailId\}>/s);
  assertStringIncludes(source, "touch={hasTouchTargets}");
  assertStringIncludes(source, "context={context}");
  assertStringIncludes(source, "contextView={contextView}");
  assertStringIncludes(inline, 'touch ? "min-h-10 py-2" : "py-1"');
});
