import { assertEquals } from "jsr:@std/assert";
import { resolveViewerDistPath } from "./viewer-resource-paths.ts";

Deno.test("resolveViewerDistPath prefers source dist in repo mode", () => {
  const resolved = resolveViewerDistPath(
    "file:///workspace/lib/erpnext/server.ts",
    "kanban-viewer",
    (path: string) => path === "/workspace/lib/erpnext/src/ui/dist/kanban-viewer/index.html",
  );

  assertEquals(
    resolved,
    "/workspace/lib/erpnext/src/ui/dist/kanban-viewer/index.html",
  );
});

Deno.test("resolveViewerDistPath falls back to packaged ui-dist for npm bundle", () => {
  const resolved = resolveViewerDistPath(
    "file:///workspace/lib/erpnext/dist-node/bin/mcp-erpnext.mjs",
    "kanban-viewer",
    (path: string) => path === "/workspace/lib/erpnext/dist-node/bin/ui-dist/kanban-viewer/index.html",
  );

  assertEquals(
    resolved,
    "/workspace/lib/erpnext/dist-node/bin/ui-dist/kanban-viewer/index.html",
  );
});

Deno.test("resolveViewerDistPath resolves Windows file URLs for packaged ui-dist", () => {
  const resolved = resolveViewerDistPath(
    "file:///C:/workspace/lib/erpnext/dist-node/bin/mcp-erpnext.mjs",
    "kanban-viewer",
    (path: string) => path === "C:/workspace/lib/erpnext/dist-node/bin/ui-dist/kanban-viewer/index.html",
  );

  assertEquals(
    resolved,
    "C:/workspace/lib/erpnext/dist-node/bin/ui-dist/kanban-viewer/index.html",
  );
});

Deno.test("resolveViewerDistPath returns null when no viewer build exists", () => {
  const resolved = resolveViewerDistPath(
    "file:///workspace/lib/erpnext/server.ts",
    "kanban-viewer",
    () => false,
  );

  assertEquals(resolved, null);
});
