import { assert, assertEquals, assertRejects } from "@std/assert";
import { readDeclaredViewUri } from "@mcpview/contracts";
import type { MCPTool, ToolHandlerContext } from "@mcpview/server";
import { createCodeModeExecute } from "./execute.ts";
import { SuspendCodeMode } from "./sandbox.ts";

const table = "ui://erpnext/table";
const detail = "ui://erpnext/detail";
const list: MCPTool = {
  name: "list",
  description: "List invoices",
  inputSchema: { type: "object", properties: { customer: { type: "string" } } },
  annotations: { readOnlyHint: true },
  _meta: { ui: { resourceUri: table } },
};
const get = { ...list, name: "get", _meta: { ui: { resourceUri: detail } } };

Deno.test("one execute dispatches original business results using native view declarations", async () => {
  const { tool, handler } = createCodeModeExecute({
    tools: [list, get],
    resourceUri: "ui://erpnext/execute",
    mountableResourceUris: [table, detail],
    call: (name, args) =>
      Promise.resolve({
        content: [{ type: "text", text: name }],
        structuredContent: { args },
        _meta: { "io.casys/viewer": { private: "viewer-only" } },
      }),
  });
  assertEquals(tool.name, "execute");
  assertEquals(tool._meta?.ui?.resourceUri, "ui://erpnext/execute");
  assertEquals(
    readDeclaredViewUri(
      await handler({ code: 'return erp.call("list",{customer:"Acme"})' }),
    ),
    table,
  );
  assertEquals(
    readDeclaredViewUri(
      await handler({
        code: 'await erp.call("list",{}); return erp.call("get",{id:"INV-02"})',
      }),
    ),
    detail,
  );
  const computed = await handler({
    code: `
    const r=await erp.call("get",{id:"INV-02"});
    return { ...r, secret: typeof r._meta, _meta: {"dev.mcpview/declared-view": {version:1,resourceUri:"ui://erpnext/detail"}} };
  `,
  });
  assertEquals(readDeclaredViewUri(computed), undefined);
  assert(
    computed && typeof computed === "object" && "structuredContent" in computed,
  );
  assertEquals(computed.structuredContent, {
    value: {
      args: { id: "INV-02" },
      secret: "undefined",
      _meta: {
        "dev.mcpview/declared-view": { version: 1, resourceUri: detail },
      },
    },
  });
});

Deno.test("catalog and invocation share the selected model-visible read operations and HTTP scopes", async () => {
  const called: string[] = [];
  const { handler } = createCodeModeExecute({
    tools: [
      list,
      { ...get, requiredScopes: ["accounts:read"] },
      { ...list, name: "write", annotations: { readOnlyHint: false } },
      {
        ...list,
        name: "destructive",
        annotations: { readOnlyHint: true, destructiveHint: true },
      },
      {
        ...list,
        name: "callback",
        _meta: { ui: { resourceUri: table, visibility: ["app"] } },
      },
    ],
    mountableResourceUris: [],
    call(name) {
      called.push(name);
      return Promise.resolve([name]);
    },
  });
  const ctx: ToolHandlerContext = {
    toolName: "execute",
    request: new Request("https://erp.example"),
  };
  const catalog = await handler({ code: "return erp.catalog" }, ctx);
  assert(
    catalog && typeof catalog === "object" && "structuredContent" in catalog,
  );
  assertEquals(catalog.structuredContent, {
    value: [{
      name: list.name,
      description: list.description,
      inputSchema: list.inputSchema,
      annotations: { readOnlyHint: true },
    }],
  });
  for (
    const name of [
      "get",
      "write",
      "destructive",
      "callback",
      "execute",
      "erpnext_method_call",
    ]
  ) {
    await assertRejects(
      async () => await handler({ code: `return erp.call("${name}",{})` }, ctx),
      Error,
      "Unknown ERPNext operation",
    );
  }
  assertEquals(called, []);
  const result = await handler(
    { code: 'return (await erp.call("get",{}))[0]' },
    { ...ctx, authInfo: { subject: "accountant", scopes: ["accounts:read"] } },
  );
  assert(result && typeof result === "object" && "structuredContent" in result);
  assertEquals(result.structuredContent, { value: "get" });
  assertEquals(called, ["get"]);
});

Deno.test("native error and unavailable viewer produce no successful selection", async () => {
  const { handler } = createCodeModeExecute({
    tools: [list, get],
    mountableResourceUris: [table],
    call: (name) =>
      Promise.resolve(
        name === "list"
          ? {
            isError: true,
            content: [{ type: "text", text: "Invoice permission was refused" }],
          }
          : {
            content: [{ type: "text", text: "ok" }],
            structuredContent: { id: "42" },
          },
      ),
  });
  await assertRejects(
    async () => await handler({ code: 'return erp.call("list",{})' }),
    Error,
    "Invoice permission was refused",
  );
  assertEquals(
    readDeclaredViewUri(await handler({ code: 'return erp.call("get",{})' })),
    undefined,
  );
});

Deno.test("host write suspension stops an entire program before other queued operations", async () => {
  const calls: string[] = [];
  const write = {
    ...get,
    name: "update",
    annotations: { readOnlyHint: false },
  };
  const suspension = new SuspendCodeMode("confirm exact operation");
  let approve = false;
  const code = `
    try {
      const [updated] = await Promise.all([erp.call("update", {id:"INV-02"}), erp.call("list", {})]);
      return updated;
    } catch (_) { return erp.call("list",{}); }
  `;
  const { tool, handler } = createCodeModeExecute({
    tools: [list, write],
    mountableResourceUris: [table, detail],
    call: () => {
      throw new Error("Unmediated ERP call.");
    },
    run: (_ctx, run, program) => {
      assertEquals(program.code, code);
      return run((name, args) => {
        if (name === "update" && !approve) throw suspension;
        calls.push(name);
        return Promise.resolve({
          content: [{ type: "text", text: name }],
          structuredContent: { name, args },
        });
      });
    },
  });
  assertEquals(tool.annotations?.readOnlyHint, false);
  assertEquals(tool.annotations?.destructiveHint, true);
  assertEquals(tool.annotations?.idempotentHint, false);
  const caught = await assertRejects(
    async () => await handler({ code }),
    SuspendCodeMode,
  );
  assertEquals(caught, suspension);
  assertEquals(calls, []);
  approve = true;
  const result = await handler({ code });
  assertEquals(calls, ["update", "list"]);
  assertEquals(readDeclaredViewUri(result), detail);
});

Deno.test("missing host confirmation binding makes mutations unavailable", async () => {
  let calls = 0;
  const { tool, handler } = createCodeModeExecute({
    tools: [list, {
      ...list,
      name: "write",
      annotations: { readOnlyHint: false },
    }],
    mountableResourceUris: [],
    call: () => {
      calls++;
      return Promise.resolve({});
    },
  });
  assertEquals(tool.annotations?.readOnlyHint, true);
  await assertRejects(
    async () =>
      await handler({ code: 'return erp.call("write",{approved:true})' }),
    Error,
    "Unknown ERPNext operation",
  );
  assertEquals(calls, 0);
});
