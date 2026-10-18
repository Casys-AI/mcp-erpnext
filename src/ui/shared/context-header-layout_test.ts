import { assertEquals, assertMatch, assertStringIncludes } from "@std/assert";

const source = (path: string) =>
  Deno.readTextFile(new URL(path, import.meta.url));

Deno.test("context header: dedicated full-width row reserves a fixed height", async () => {
  const ui = await source("./ui.tsx");
  assertMatch(
    ui,
    /export function ContextChipRow[\s\S]*?data-context-chip-row[\s\S]*?class="flex h-8 min-h-8 min-w-0 w-full shrink-0 items-center"/,
  );
  assertStringIncludes(
    ui,
    "<ContextChipRow reserve={contextSupported}>{contextChip}</ContextChipRow>",
  );
});

Deno.test("context row is absent without host support and reserved even with empty children", async () => {
  const ui = await source("./ui.tsx");
  assertMatch(
    ui,
    /export function ContextChipRow\(\s*\{ reserve, children \}: \{ reserve: boolean; children: ComponentChildren \},\s*\) \{\s*if \(!reserve\) return null;\s*return \(\s*<div\s+data-context-chip-row\s+class="[^"]+"\s*>\s*\{children\}\s*<\/div>\s*\);\s*\}/,
  );
});

Deno.test("doclist context row is independent of selection and panel layout", async () => {
  const doclist = await source("../doclist-viewer/src/DoclistViewer.tsx");
  assertStringIncludes(doclist, "contextChip={activeContextChip}");
  assertStringIncludes(doclist, "contextSupported={context.supported}");
  assertEquals(
    doclist.includes(
      "activeContext.selections.length > 0 || activeContext.failed",
    ),
    false,
  );
});

Deno.test("all clickable viewers keep the context chip on its own row", async () => {
  for (
    const [path, expectedRows, capability] of [
      ["../stock-viewer/src/StockViewer.tsx", 1, "context.supported"],
      ["../chart-viewer/src/ChartViewer.tsx", 1, "activeContext.supported"],
      ["../funnel-viewer/src/FunnelViewer.tsx", 1, "activeContext.supported"],
      ["../kanban-viewer/src/KanbanViewer.tsx", 1, "context.supported"],
      ["../kpi-viewer/src/KpiViewer.tsx", 2, "activeContext.supported"],
      ["../invoice-viewer/src/InvoiceViewer.tsx", 2, "context.supported"],
    ] as const
  ) {
    const viewer = await source(path);
    assertEquals(
      viewer.split(`<ContextChipRow reserve={${capability}}>`).length - 1,
      expectedRows,
      path,
    );
  }
  const kpi = await source("../kpi-viewer/src/KpiViewer.tsx");
  assertMatch(kpi, /<ViewerHeader[\s\S]*?contextChip=\{/);
  assertStringIncludes(kpi, "contextSupported={documentContext.supported}");
  const doc = await source("../doc-viewer/src/DocViewer.tsx");
  assertStringIncludes(doc, "contextChip={activeContextChip}");
  assertStringIncludes(doc, "contextSupported={context.supported}");
  const surface = await source("./document/DocumentSurface.tsx");
  assertStringIncludes(surface, "contextChip={contextChip}");
  assertStringIncludes(surface, "contextSupported={contextSupported}");
  const header = await source("./document/DocumentHeader.tsx");
  assertEquals(
    [...header.matchAll(/<ContextChipRow reserve=\{contextSupported\}>/g)]
      .length,
    2,
  );
});
