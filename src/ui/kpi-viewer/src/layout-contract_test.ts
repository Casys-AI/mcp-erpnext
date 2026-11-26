import { assertEquals, assertStringIncludes } from "@std/assert";

const source = await Deno.readTextFile(
  new URL("./KpiViewer.tsx", import.meta.url),
);
const contentStart = source.indexOf("function KpiViewerContent(");
const contentEnd = source.indexOf("/* ── Outer viewer", contentStart);
const content = source.slice(contentStart, contentEnd);

Deno.test("KPI layout - host bounds replace viewport locking and the level body scrolls", () => {
  assertEquals(contentStart >= 0 && contentEnd > contentStart, true);
  assertStringIncludes(content, "layout, boundsStyle");
  assertStringIncludes(content, "style={boundsStyle}");
  assertStringIncludes(
    content,
    'class="scroll-slim flex min-h-0 flex-1 flex-col overflow-y-auto"',
  );
  assertEquals(content.includes("h-screen"), false);
});

Deno.test("KPI formatting - the viewer renders through kpi-format.ts and never reads formattedValue itself", () => {
  assertStringIncludes(source, 'from "./kpi-format.ts"');
  assertEquals(source.includes("function formatKpiParts"), false);
  assertEquals(source.includes("data.formattedValue"), false);
});

Deno.test("KPI inspection and pinning use independent controls in both layouts", () => {
  assertStringIncludes(source, "data-kpi-month={index}");
  assertStringIncludes(source, "onInspect={inspectPoint}");
  assertStringIncludes(
    source,
    "onToggle={() => void activeContext.toggle(item)}",
  );
  assertEquals(source.includes("toggleReversible("), false);
  assertEquals(source.split("{renderSparkline()}").length - 1, 2);
});
