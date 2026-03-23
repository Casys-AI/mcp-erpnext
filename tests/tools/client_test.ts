import { assertEquals } from "jsr:@std/assert";
import { ErpNextToolsClient } from "../../src/client.ts";

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

  // All tools with annotations should have them in wire format
  const toolsWithAnnotations = client.listTools().filter((t) => t.annotations);
  const wireToolsWithAnnotations = mcpTools.filter((t) => t.annotations);

  assertEquals(wireToolsWithAnnotations.length, toolsWithAnnotations.length);
});
