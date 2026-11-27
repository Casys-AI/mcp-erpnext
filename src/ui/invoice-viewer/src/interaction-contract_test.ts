import { assertEquals, assertStringIncludes } from "@std/assert";

Deno.test("invoice lines expose one detail-only chevron in wide and narrow layouts", async () => {
  const source = await Deno.readTextFile(
    new URL("./InvoiceViewer.tsx", import.meta.url),
  );

  assertStringIncludes(source, 'clickAction: "detail"');
  assertStringIncludes(
    source,
    "controls: lineDetailId(rowIndex)",
  );
  assertEquals(
    [...source.matchAll(/<DisclosureChevron expanded=\{isExpanded\}/g)].length,
    2,
  );
  assertEquals(
    [...source.matchAll(/<div id=\{lineDetailId\(rowIndex\)\}>/g)].length,
    2,
  );
  assertEquals(source.includes("<DetailToggleButton"), false);
  assertStringIncludes(source, "reconcileInvoiceDocument(");
  assertStringIncludes(source, "contextDocumentItem.id, contextCandidates");
  assertStringIncludes(source, "const rootContextTarget:");
  assertEquals([...source.matchAll(/<DocumentPin target=\{pin\}/g)].length, 2);
  assertEquals(
    [...source.matchAll(/<DocumentPin target=\{rootContextTarget\}/g)]
      .length,
    2,
  );
});
