import { assertEquals, assertMatch, assertStringIncludes } from "@std/assert";

const source = (path: string) =>
  Deno.readTextFile(new URL(path, import.meta.url));

Deno.test("context header: dedicated full-width row reserves a fixed height", async () => {
  const ui = await source("./ui.tsx");
  assertMatch(
    ui,
    /export function ContextChipRow[\s\S]*?data-context-chip-row[\s\S]*?class="flex h-8 min-h-8 min-w-0 w-full shrink-0 items-center"/,
  );
  assertStringIncludes(ui, "<ContextChipRow>{contextChip}</ContextChipRow>");
});

Deno.test("doclist context row is independent of selection and panel layout", async () => {
  const doclist = await source("../doclist-viewer/src/DoclistViewer.tsx");
  assertStringIncludes(doclist, "contextChip={activeContextChip}");
  assertEquals(
    doclist.includes(
      "activeContext.selections.length > 0 || activeContext.failed",
    ),
    false,
  );
});

Deno.test("all clickable viewers keep the context chip on its own row", async () => {
  for (
    const [path, expectedRows] of [
      ["../stock-viewer/src/StockViewer.tsx", 1],
      ["../chart-viewer/src/ChartViewer.tsx", 1],
      ["../funnel-viewer/src/FunnelViewer.tsx", 1],
      ["../kanban-viewer/src/KanbanViewer.tsx", 1],
      ["../kpi-viewer/src/KpiViewer.tsx", 2],
      ["../invoice-viewer/src/InvoiceViewer.tsx", 2],
    ] as const
  ) {
    const viewer = await source(path);
    assertEquals(
      [...viewer.matchAll(/<ContextChipRow>/g)].length,
      expectedRows,
      path,
    );
  }
  const kpi = await source("../kpi-viewer/src/KpiViewer.tsx");
  assertMatch(kpi, /<ViewerHeader[\s\S]*?contextChip=\{/);
  const doc = await source("../doc-viewer/src/DocViewer.tsx");
  assertStringIncludes(doc, "contextChip={activeContextChip}");
  const surface = await source("./document/DocumentSurface.tsx");
  assertStringIncludes(surface, "contextChip={contextChip}");
  const header = await source("./document/DocumentHeader.tsx");
  assertEquals(
    [...header.matchAll(/<ContextChipRow>\{contextChip\}<\/ContextChipRow>/g)]
      .length,
    2,
  );
});
