import { assert, assertEquals, assertRejects, assertThrows } from "@std/assert";
import type { MCPTool, ToolHandler } from "@mcpview/server";
import { buildAuthProvider } from "../auth/config.ts";
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

Deno.test("durable snippets separate ERP connections and verified HTTP credentials", async () => {
  const directory = await Deno.makeTempDir();
  const previous = Deno.env.get("MCP_SNIPPETS_DIR");
  const previousState = Deno.env.get("XDG_STATE_HOME");
  const credentials = {
    ERPNEXT_URL: "http://localhost/frappe",
    ERPNEXT_API_KEY: "erp-key-a",
    ERPNEXT_API_SECRET: "erp-secret-a",
  };
  const previousCredentials = Object.entries(credentials).map(
    ([name, value]) => {
      const previous = Deno.env.get(name);
      Deno.env.set(name, value);
      return [name, previous] as const;
    },
  );
  Deno.env.delete("MCP_SNIPPETS_DIR");
  Deno.env.set("XDG_STATE_HOME", directory);
  const url = "http://localhost/mcp";
  const config = { tokens: new Set(["alice-test", "bob-test"]), resource: url };
  const setup = () => {
    const provider = buildAuthProvider(config);
    const model = new Map<string, ToolHandler>();
    registerCodeModeTools({
      registerTool: (tool, handler) => model.set(tool.name, handler),
      registerAppOnlyTool: () => {},
    }, new ErpNextToolsClient({ categories: ["sales"] }));
    return { provider, execute: model.get("execute")! };
  };
  try {
    const before = setup();
    const aliceBefore = await before.provider.verifyToken("alice-test");
    assert(aliceBefore);
    const context = {
      toolName: "execute",
      request: new Request(url),
      authInfo: aliceBefore,
    };
    const code = "  // Vérification\r\nreturn erp.params.customer;\n";
    const run = await before.execute({
      code,
      params: { customer: "first" },
    }, context);
    assert(run && typeof run === "object" && "_meta" in run);
    const runId = (run._meta as Record<string, unknown>)[
      "io.casys/erpnext-execution-ref"
    ];
    assert(typeof runId === "string");
    await before.execute({ save: { name: "customer", runId } }, context);
    const stdioRun = await before.execute({
      code,
      params: { customer: "local" },
    });
    assert(stdioRun && typeof stdioRun === "object" && "_meta" in stdioRun);
    const stdioRunId = (stdioRun._meta as Record<string, unknown>)[
      "io.casys/erpnext-execution-ref"
    ];
    assert(typeof stdioRunId === "string");
    await before.execute({ save: { name: "customer", runId: stdioRunId } });

    Deno.env.set("ERPNEXT_API_SECRET", "erp-secret-rotated");
    const after = setup();
    const aliceAfter = await after.provider.verifyToken("alice-test");
    const bob = await after.provider.verifyToken("bob-test");
    assert(aliceAfter && bob);
    assert(aliceBefore.subject !== aliceAfter.subject);
    const aliceContext = { ...context, authInfo: aliceAfter };
    const bobContext = { ...context, authInfo: bob };
    const localSource = await after.execute({ inspectSnippet: "customer" });
    assert(
      localSource && typeof localSource === "object" &&
        "structuredContent" in localSource,
    );
    assertEquals(localSource.structuredContent, {
      value: { code, name: "customer", parameters: { customer: "string" } },
    });
    const source = await after.execute(
      { inspectSnippet: "customer" },
      aliceContext,
    );
    assert(
      source && typeof source === "object" && "structuredContent" in source,
    );
    assertEquals(source.structuredContent, {
      value: { code, name: "customer", parameters: { customer: "string" } },
    });
    await assertRejects(
      async () =>
        await after.execute({ inspectSnippet: "customer" }, bobContext),
      Error,
      "Snippet not found",
    );
    await assertRejects(
      async () =>
        await after.execute({ inspectSnippet: "missing" }, aliceContext),
      Error,
      "Snippet not found",
    );
    const result = await after.execute({
      snippet: "customer",
      params: { customer: "second" },
    }, aliceContext);
    assert(
      result && typeof result === "object" && "structuredContent" in result,
    );
    assertEquals(result.structuredContent, { value: "second" });
    const list = await after.execute({ snippets: true }, bobContext);
    assert(list && typeof list === "object" && "structuredContent" in list);
    assertEquals(list.structuredContent, { value: [] });
    await assertRejects(
      async () =>
        await after.execute({
          snippet: "customer",
          params: { customer: "second" },
        }, bobContext),
      Error,
      "Snippet not found",
    );
    Deno.env.set("ERPNEXT_API_KEY", "erp-key-b");
    const differentConnection = setup();
    const sameProxyUser = await differentConnection.provider.verifyToken(
      "alice-test",
    );
    assert(sameProxyUser);
    for (const ctx of [undefined, { ...context, authInfo: sameProxyUser }]) {
      const list = await differentConnection.execute({ snippets: true }, ctx);
      assert(list && typeof list === "object" && "structuredContent" in list);
      assertEquals(list.structuredContent, { value: [] });
      await assertRejects(
        async () =>
          await differentConnection.execute(
            { inspectSnippet: "customer" },
            ctx,
          ),
        Error,
        "Snippet not found",
      );
    }
  } finally {
    for (const [name, value] of previousCredentials) {
      if (value === undefined) Deno.env.delete(name);
      else Deno.env.set(name, value);
    }
    if (previous === undefined) Deno.env.delete("MCP_SNIPPETS_DIR");
    else Deno.env.set("MCP_SNIPPETS_DIR", previous);
    if (previousState === undefined) Deno.env.delete("XDG_STATE_HOME");
    else Deno.env.set("XDG_STATE_HOME", previousState);
    await Deno.remove(directory, { recursive: true });
  }
});
