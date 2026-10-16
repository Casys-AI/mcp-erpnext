import { assertEquals, assertStringIncludes } from "@std/assert";

Deno.test("useViewerLayout delegates to @casys/mcp-view-components/layout and keeps no local matchMedia or ResizeObserver", async () => {
  const source = await Deno.readTextFile(
    new URL("./useViewerLayout.ts", import.meta.url),
  );

  assertStringIncludes(source, "@casys/mcp-view-components/layout");
  assertStringIncludes(source, "useKitViewerLayout");
  assertEquals(
    source.includes("matchMedia"),
    false,
    "first-paint pointer reads live in the kit",
  );
  assertEquals(
    source.includes("ResizeObserver"),
    false,
    "container measurement lives in the kit",
  );
});
