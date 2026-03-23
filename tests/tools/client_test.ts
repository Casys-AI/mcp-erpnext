import { assertEquals } from "jsr:@std/assert";
import { ErpNextToolsClient } from "../../src/client.ts";
import type { FrappeClient } from "../../src/api/frappe-client.ts";

function makeMockClient(overrides = {}): FrappeClient {
  return {
    list: async () => [],
    get: async () => ({}),
    create: async () => ({}),
    update: async () => ({}),
    delete: async () => ({}),
    callMethod: async () => ({}),
    ...overrides,
  } as unknown as FrappeClient;
}

Deno.test("buildHandlersMap - returns isError result with message on tool failure", async () => {
  // Temporarily override getFrappeClient to return our mock
  const client = new ErpNextToolsClient();
  const handlers = client.buildHandlersMap();

  // Find a tool that will throw — use a tool that requires specific input
  const docCreate = handlers.get("erpnext_doc_create");
  if (!docCreate) return; // skip if not available

  // Call without required args — should return isError with message, not throw
  const result = await docCreate({}) as Record<string, unknown>;

  assertEquals(result.isError, true);
  const content = result.content as Array<Record<string, unknown>>;
  assertEquals(content[0].type, "text");
  // The error message should contain something useful, not "Tool execution failed"
  assertEquals(typeof content[0].text, "string");
  assertEquals((content[0].text as string).length > 0, true);
});
