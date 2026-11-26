import { assert, assertEquals } from "@std/assert";
import { MCP_APP_MIME_TYPE, type McpApp } from "@mcpview/server";
import { pathToFileURL } from "node:url";
import { createCodeModeExecute } from "./execute.ts";
import { registerCodeModeView } from "./view.ts";

Deno.test("Code Mode advertises the versioned shell and serves it at previous resource URIs", async () => {
  const root = await Deno.makeTempDir();
  try {
    const dist = `${root}/src/ui/dist/code-mode`;
    const html = "<html>Code Mode shell</html>";
    await Deno.mkdir(dist, { recursive: true });
    await Deno.writeTextFile(`${dist}/index.html`, html);
    const resources: Parameters<McpApp["registerResource"]>[] = [];
    const view = registerCodeModeView({
      registerResource: (...args) => resources.push(args),
    }, pathToFileURL(`${root}/server.ts`).href);
    assert(view);
    const current = "ui://mcp-erpnext/code-mode/v3";
    const legacy = "ui://mcp-erpnext/code-mode";
    assertEquals(view.resourceUri, current);
    assertEquals(resources.map(([resource]) => resource.uri), [
      current,
      legacy,
      "ui://mcp-erpnext/code-mode/v2",
    ]);
    assertEquals(resources[1][0].name, "ERPNext (compatibility)");
    for (const [resource, read] of resources) {
      const contents = await read(new URL(resource.uri));
      assertEquals(contents.uri, resource.uri);
      assertEquals(contents.mimeType, MCP_APP_MIME_TYPE);
      assertEquals(contents.text, html);
    }
    const { tool } = createCodeModeExecute({
      ...view,
      tools: [],
      call: () => Promise.reject(new Error("No ERP calls expected")),
    });
    assertEquals(tool._meta?.ui?.resourceUri, current);
    assertEquals(tool._meta?.ui?.visibility, ["model", "app"]);
    assertEquals(
      (tool._meta as Record<string, unknown>)["openai/outputTemplate"],
      current,
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
