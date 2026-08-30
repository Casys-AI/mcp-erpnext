import { assertEquals, assertStringIncludes } from "@std/assert";

Deno.test("invoice lines expose one detail-only chevron in wide and narrow layouts", async () => {
  const source = await Deno.readTextFile(
    new URL("./InvoiceViewer.tsx", import.meta.url),
  );

  assertStringIncludes(source, "detailLabel: label");
  assertStringIncludes(
    source,
    "controls: canExpand ? lineDetailId(rowIndex) : undefined",
  );
  assertEquals([...source.matchAll(/<DetailToggleButton/g)].length, 2);
  assertEquals(
    [...source.matchAll(/<div id=\{lineDetailId\(rowIndex\)\}>/g)].length,
    2,
  );
  assertEquals([...source.matchAll(/\btouch\s*\/>/g)].length, 1);
  assertStringIncludes(source, "reconcileInvoiceDocument(");
  assertStringIncludes(source, "contextDocumentItem.id, contextCandidates");
  assertStringIncludes(source, "const rootContextTarget:");
  assertEquals(
    [...source.matchAll(/contextInteractionProps\(rootContextTarget\)/g)]
      .length,
    2,
  );
});
