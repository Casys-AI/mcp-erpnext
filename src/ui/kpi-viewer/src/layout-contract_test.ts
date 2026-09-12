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
