import { assert, assertEquals, assertStringIncludes } from "@std/assert";

Deno.test("buy evidence app composes DocumentSurface without live DocViewer hooks", async () => {
  const components = await Deno.readTextFile(
    new URL("./src/components.tsx", import.meta.url),
  );
  const app = await Deno.readTextFile(
    new URL("./src/app.ts", import.meta.url),
  );
  const main = await Deno.readTextFile(
    new URL("./src/main.tsx", import.meta.url),
  );
  assertStringIncludes(components, "DocumentSurface");
  assertStringIncludes(components, "live={false}");
  assertEquals(components.includes("DocViewer"), false);
  assertEquals(components.includes("callServerTool"), false);
  assertEquals(components.includes("erpnext_file_"), false);
  assertEquals(components.includes("refreshRequest"), false);
  assertEquals(main.includes("callServerTool"), false);
  assertEquals(main.includes("DocViewer"), false);
  assertStringIncludes(app, "viewerSession");
  assertStringIncludes(app, "session-rejected");
  assertStringIncludes(app, "tool-result-rejected");
  assertEquals(app.includes("displayStateFromToolResult"), false);
});

Deno.test("live DocViewer keeps refresh and mutation hooks", async () => {
  const viewer = await Deno.readTextFile(
    new URL("../doc-viewer/src/DocViewer.tsx", import.meta.url),
  );
  assertStringIncludes(viewer, "callServerTool");
  assertStringIncludes(viewer, "REFRESH_INTERVAL_MS");
  assertStringIncludes(viewer, "useAttachments");
  assert(viewer.includes("erpnext_doc_submit") || viewer.includes("canSubmit"));
});
