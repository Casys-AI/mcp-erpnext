import { assertEquals } from "@std/assert";
import {
  readViewerDist,
  resolveViewerDistPath,
} from "./viewer-resource-paths.ts";

Deno.test("resolveViewerDistPath prefers source dist in repo mode", () => {
  const resolved = resolveViewerDistPath(
    "file:///workspace/lib/erpnext/server.ts",
    "kanban-viewer",
    (path: string) =>
      path === "/workspace/lib/erpnext/src/ui/dist/kanban-viewer/index.html",
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
    (path: string) =>
      path ===
        "/workspace/lib/erpnext/dist-node/bin/ui-dist/kanban-viewer/index.html",
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
    (path: string) =>
      path ===
        "C:/workspace/lib/erpnext/dist-node/bin/ui-dist/kanban-viewer/index.html",
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

Deno.test("resolveViewerDistPath preserves the published JSR viewer URL", () => {
  let localProbeCalled = false;
  const resolved = resolveViewerDistPath(
    "https://jsr.io/@casys/mcp-erpnext/3.1.0-beta.3/server.ts",
    "doc-viewer",
    () => {
      localProbeCalled = true;
      return false;
    },
  );

  assertEquals(
    resolved,
    "https://jsr.io/@casys/mcp-erpnext/3.1.0-beta.3/src/ui/dist/doc-viewer/index.html",
  );
  assertEquals(localProbeCalled, false);
});

Deno.test("readViewerDist fetches a published viewer URL", async () => {
  const calls: string[] = [];
  const html = await readViewerDist(
    "https://jsr.io/@casys/mcp-erpnext/3.1.0-beta.3/src/ui/dist/doc-viewer/index.html",
    () => Promise.reject(new Error("local reader must not run")),
    (url) => {
      calls.push(url);
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        text: () => Promise.resolve("<html>published viewer</html>"),
      });
    },
  );

  assertEquals(html, "<html>published viewer</html>");
  assertEquals(calls, [
    "https://jsr.io/@casys/mcp-erpnext/3.1.0-beta.3/src/ui/dist/doc-viewer/index.html",
  ]);
});

Deno.test("readViewerDist keeps local npm and repository reads local", async () => {
  const calls: string[] = [];
  const html = await readViewerDist(
    "/workspace/ui-dist/doc-viewer/index.html",
    (path) => {
      calls.push(path);
      return Promise.resolve("<html>local viewer</html>");
    },
    () => Promise.reject(new Error("remote fetch must not run")),
  );

  assertEquals(html, "<html>local viewer</html>");
  assertEquals(calls, ["/workspace/ui-dist/doc-viewer/index.html"]);
});
