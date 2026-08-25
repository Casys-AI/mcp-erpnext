import { assert, assertEquals } from "@std/assert";
import {
  UI_VIEWERS,
  VIEWER_RESOURCE_META,
  withViewerResourceMeta,
} from "./viewers.ts";

Deno.test("UI_VIEWERS includes the canonical kanban viewer", () => {
  assert(UI_VIEWERS.includes("kanban-viewer"));
  assert(UI_VIEWERS.includes("doc-viewer"));
  assertEquals(
    (UI_VIEWERS as readonly string[]).includes("order-pipeline-viewer"),
    false,
  );
  assertEquals(UI_VIEWERS.length, 8);
});

Deno.test("viewer resources expose the Blob URL CSP on list and read shapes", () => {
  const expectedMeta = {
    ui: {
      csp: {
        resourceDomains: ["blob:"],
        frameDomains: ["blob:"],
      },
    },
  } as const;
  assertEquals(VIEWER_RESOURCE_META, expectedMeta);

  const listing = withViewerResourceMeta({
    uri: "ui://mcp-erpnext/doc-viewer",
    name: "ERPNext Doc Viewer",
  });
  const content = withViewerResourceMeta({
    uri: "ui://mcp-erpnext/doc-viewer",
    mimeType: "text/html;profile=mcp-app",
    text: "<html></html>",
  });

  assertEquals(listing._meta, expectedMeta);
  assertEquals(content._meta, expectedMeta);
  assertEquals(listing.name, "ERPNext Doc Viewer");
  assertEquals(content.text, "<html></html>");
});
