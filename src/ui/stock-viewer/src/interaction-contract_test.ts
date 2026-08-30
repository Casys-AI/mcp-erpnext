import { assertEquals, assertMatch, assertStringIncludes } from "@std/assert";

Deno.test("stock viewer - contexte et detail gardent des commandes exclusives", async () => {
  const source = await Deno.readTextFile(
    new URL("./StockViewer.tsx", import.meta.url),
  );

  assertStringIncludes(
    source,
    "const activeContext = useActiveContext(app, rootKey)",
  );
  assertStringIncludes(
    source,
    "? context.activateReversible(contextItem)",
  );
  assertStringIncludes(
    source,
    'event.key === " " && context.supported',
  );
  assertStringIncludes(source, 'event.key === "Enter" && canDrill');
  assertStringIncludes(
    source,
    "nav.toggleRootChild(jump, contextItemFor(row).id)",
  );
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
  assertStringIncludes(source, "<DetailToggleButton");
  assertStringIncludes(source, '"aria-controls": canDrill ? detailId');
  assertMatch(source, /<section\s+id=\{detailId\}/s);
  assertMatch(source, /<div id=\{detailId\}>/s);
  assertStringIncludes(source, "touch={hasTouchTargets}");
  assertStringIncludes(source, "context={context}");
  assertStringIncludes(source, "contextView={contextView}");
  assertStringIncludes(inline, 'touch ? "min-h-10 py-2" : "py-1"');
});
