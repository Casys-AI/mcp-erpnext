import { assertEquals, assertNotStrictEquals } from "jsr:@std/assert";
import { withUiRefreshRequest } from "../../src/tools/ui-refresh.ts";

Deno.test("ui refresh - injects refreshRequest into UI payloads", () => {
  const args = { doctype: "Task", limit: 20 };
  const result = withUiRefreshRequest(
    {
      doctype: "Task",
      data: [],
      _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
    },
    "erpnext_task_list",
    args,
  ) as Record<string, unknown>;

  assertEquals(result.refreshRequest, {
    toolName: "erpnext_task_list",
    arguments: { doctype: "Task", limit: 20 },
  });
  assertNotStrictEquals(
    (result.refreshRequest as { arguments: Record<string, unknown> }).arguments,
    args,
  );
});

Deno.test("ui refresh - leaves non-UI payloads untouched", () => {
  const payload = { data: [] };
  assertEquals(withUiRefreshRequest(payload, "erpnext_task_list", {}), payload);
});

Deno.test("ui refresh - preserves an existing refreshRequest", () => {
  const payload = {
    data: [],
    refreshRequest: { toolName: "erpnext_kanban_get_board", arguments: { doctype: "Task" } },
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/kanban-viewer" } },
  };

  assertEquals(withUiRefreshRequest(payload, "erpnext_task_list", {}), payload);
});
