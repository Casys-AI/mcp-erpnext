import { assert, assertEquals, assertRejects, assertThrows } from "@std/assert";
import type { MCPTool, ToolHandler } from "@mcpview/server";
import { allTools, ErpNextToolsClient, ToolFilterError } from "../client.ts";
import { registerCodeModeTools } from "./register.ts";

Deno.test("the beta shares its filtered operation surface with viewers and fails closed for text callbacks", () => {
  const client = new ErpNextToolsClient({
    categories: ["sales", "operations"],
    excludeTools: ["erpnext_customer_list"],
  });
  const callbacks = new Map<string, ToolHandler>();
  const model: string[] = [];
  const count = registerCodeModeTools({
    registerTool: (tool) => model.push(tool.name),
    registerAppOnlyTool: (tool, handler) => callbacks.set(tool.name, handler),
  }, client);

  assertEquals(model, ["execute"]);
  assert(callbacks.has("erpnext_sales_invoice_get"));
  assert(callbacks.has("erpnext_file_download"));
  assert(callbacks.has("erpnext_doc_update"));
  assert(callbacks.has("erpnext_method_call"));
  assert(!callbacks.has("erpnext_customer_list"));
  assert(!callbacks.has("erpnext_kpi_revenue"));
  assertEquals(count, callbacks.size - 1);
  assertThrows(
    () => callbacks.get("erpnext_sales_invoice_get")!({ name: "TEST" }),
    Error,
    "MCP Apps host",
  );
});

Deno.test("beta refuses an input selection with no program-visible operations", () => {
  const client = new ErpNextToolsClient({
    excludeTools: allTools.map((t) => t.name).filter((n) =>
      n !== "erpnext_file_download"
    ),
  });
  const unexpected = () => {
    throw new Error("unexpected registration");
  };
  const error = assertThrows(
    () =>
      registerCodeModeTools({
        registerTool: unexpected,
        registerAppOnlyTool: unexpected,
      }, client),
    ToolFilterError,
  );
  assertEquals(error.reason, "EMPTY_SELECTION");
});

Deno.test("a scoped ERP declaration gates the native callback and the code catalog and dispatch", async () => {
  const client = new ErpNextToolsClient({
    categories: ["sales"],
  });
  const selected = client.listTools();
  const index = selected.findIndex((tool) =>
    tool.name === "erpnext_sales_invoice_get"
  );
  const name = selected[index].name;
  const scope = "invoices:read";
  selected[index] = { ...selected[index], requiredScopes: [scope] };
  const callbacks = new Map<string, MCPTool>();
  const model = new Map<string, ToolHandler>();
  registerCodeModeTools({
    registerTool: (tool, handler) => model.set(tool.name, handler),
    registerAppOnlyTool: (tool) => callbacks.set(tool.name, tool),
  }, client);
  // The native McpApp scope middleware receives the original policy.
  assertEquals(callbacks.get(name)?.requiredScopes, [scope]);

  const execute = model.get("execute")!;
  const ctx = {
    toolName: "execute",
    request: new Request("http://localhost/mcp"),
  };
  const code = `return erp.catalog.some(op => op.name === "${name}")`;
  const hasOperation = async (scopes: string[]) => {
    const result = await execute({ code }, {
      ...ctx,
      authInfo: { subject: "reader", scopes },
    });
    assert(
      result && typeof result === "object" && "structuredContent" in result,
    );
    return result.structuredContent;
  };
  assertEquals(await hasOperation([]), { value: false });
  assertEquals(await hasOperation([scope]), { value: true });
  await assertRejects(
    async () =>
      await execute({
        code: `return await erp.call("${name}", {name:"TEST"})`,
      }, ctx),
    Error,
    "Unknown ERPNext operation",
  );
});
