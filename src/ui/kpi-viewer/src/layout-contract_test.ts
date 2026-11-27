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

Deno.test("KPI layout - the trend splits off only when its own panel has room", () => {
  assertStringIncludes(content, 'class="@container/kpi"');
  assertStringIncludes(source, '"grid min-h-0 grid-cols-1"');
  assertStringIncludes(
    source,
    "@min-[40rem]/kpi:grid-cols-[minmax(0,1fr)_min(40%,300px)]",
  );
  assertStringIncludes(
    source,
    "flex min-w-0 flex-wrap items-center justify-between gap-2",
  );
});

Deno.test("KPI value detail keeps its single-click hint in a dedicated line on hover and keyboard focus", async () => {
  const hintCss = await Deno.readTextFile(
    new URL("./number-detail.css", import.meta.url),
  );
  // The standalone and Code Mode bundles both establish their shared cascade in global.css.
  assertEquals(hintCss.includes("@layer"), false);
  assertStringIncludes(source, 'import "./number-detail.css"');
  assertStringIncludes(
    source,
    'numberAction?.kind === "jump" ? "kpi.drilldown.title_detail" : "nav.ask"',
  );
  assertStringIncludes(source, 'class="kpi-number-hint"');
  assertStringIncludes(
    hintCss,
    ".kpi-number .detail-toggle::after {\n  content: none;",
  );
  assertStringIncludes(hintCss, "display: block;\n  visibility: hidden;");
  for (const state of ["hover", "focus-visible"]) {
    assertStringIncludes(
      hintCss,
      ".kpi-number:has(.detail-toggle:" + state + ") > .kpi-number-hint",
    );
  }
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
