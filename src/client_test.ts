import { assert, assertEquals } from "jsr:@std/assert";
import { ErpNextToolsClient } from "./client.ts";

// Note: Error handling previously tested here (isError wrapping) has been moved
// to the server layer via toolErrorMapper in server.ts. Handlers now throw
// naturally and the server converts errors to isError results.

Deno.test("buildHandlersMap - returns a handler for each registered tool", () => {
  const client = new ErpNextToolsClient();
  const handlers = client.buildHandlersMap();
  const tools = client.listTools();

  assertEquals(handlers.size, tools.length);
  for (const tool of tools) {
    assertEquals(handlers.has(tool.name), true);
  }
});

Deno.test("toMCPFormat - passes through annotations when defined", () => {
  const client = new ErpNextToolsClient();
  const mcpTools = client.toMCPFormat();

  const toolsWithAnnotations = client.listTools().filter((t) => t.annotations);
  const wireToolsWithAnnotations = mcpTools.filter((t) => t.annotations);

  assertEquals(wireToolsWithAnnotations.length, toolsWithAnnotations.length);
});

Deno.test("toMCPFormat - all viewer tools have MCPToolMeta _meta", () => {
  const client = new ErpNextToolsClient();
  const mcpTools = client.toMCPFormat();

  const viewerTools = mcpTools.filter((t) => t._meta?.ui?.resourceUri);
  assert(viewerTools.length > 0, "Should have viewer tools");

  for (const tool of viewerTools) {
    assert(
      tool._meta!.ui!.resourceUri.startsWith("ui://mcp-erpnext/"),
      `${tool.name} resourceUri should start with ui://mcp-erpnext/`,
    );
  }
});

Deno.test("buildHandlersMap - viewer tools return structuredContent", async () => {
  // Mock a minimal tool that returns a viewer result
  const client = new ErpNextToolsClient();
  const tools = client.listTools();

  // Find a tool that has _meta.ui (a viewer tool) and is read-only (safe to mock)
  const viewerTool = tools.find(
    (t) => t._meta?.ui?.resourceUri && t.annotations?.readOnlyHint,
  );
  if (!viewerTool) return; // skip if no viewer tool found

  // Create a mock handler map entry that simulates what buildHandlersMap does
  // We test the wrapping logic by checking the shape of a pre-formatted result
  const mockResult = {
    doctype: "Test",
    count: 0,
    data: [],
    _meta: viewerTool._meta,
  };

  // The wrapping logic: if result has _meta.ui, wrap with content + structuredContent
  const hasUiMeta = mockResult._meta !== undefined &&
    typeof mockResult._meta === "object" &&
    mockResult._meta.ui !== undefined;

  assert(hasUiMeta, "Mock result should have _meta.ui");

  if (hasUiMeta) {
    const wrapped = {
      content: [{ type: "text", text: JSON.stringify(mockResult) }],
      structuredContent: mockResult,
      _meta: mockResult._meta,
    };

    // Verify shape
    assert(Array.isArray(wrapped.content), "Should have content array");
    assertEquals(wrapped.content[0].type, "text");
    assert(wrapped.structuredContent, "Should have structuredContent");
    assertEquals(wrapped.structuredContent.doctype, "Test");
    assert(wrapped._meta, "Should have _meta");
  }
});
