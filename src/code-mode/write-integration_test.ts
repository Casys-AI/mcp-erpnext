import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from "@std/assert";
import {
  createStaticTokenAuthProvider,
  McpApp,
  type ToolHandler,
  type ToolHandlerContext,
} from "@mcpview/server";
import { type FrappeClient, setFrappeClient } from "../api/frappe-client.ts";
import { ErpNextToolsClient } from "../client.ts";
import { registerCodeModeTools } from "./register.ts";

Deno.test("signed execute retries perform two dependent native writes once and preserve native errors", async () => {
  const url = "http://localhost/mcp";
  const token = "code-mode-test-token";
  const app = new McpApp({
    name: "erpnext-code-mode-test",
    version: "1.0.0",
    transport: "stateless",
    mrtr: { signingKey: "0123456789abcdef".repeat(4) },
    auth: {
      provider: createStaticTokenAuthProvider([{
        token,
        subject: "accountant",
        scopes: [],
      }], { resource: url }),
    },
    logger: () => {},
    toolErrorMapper: (error) =>
      error instanceof Error ? error.message : String(error),
  });
  const directory = await Deno.makeTempDir();
  const previous = Object.entries({
    MCP_SNIPPETS_DIR: directory,
    ERPNEXT_URL: "http://localhost/frappe",
    ERPNEXT_API_KEY: "erp-key",
  }).map(([name, value]) => {
    const old = Deno.env.get(name);
    Deno.env.set(name, value);
    return [name, old] as const;
  });
  try {
    registerCodeModeTools(
      app,
      new ErpNextToolsClient({ categories: ["operations"] }),
    );
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) Deno.env.delete(name);
      else Deno.env.set(name, value);
    }
  }
  const serve = await app.getFetchHandler({ cors: false });
  const effects: unknown[][] = [];
  const createData = { description: "Review invoice" };
  const updateData = { status: "Closed" };
  const code = `
    const created = await erp.call("erpnext_doc_create", {doctype:"ToDo",data:{description:"Review invoice"}});
    return erp.call("erpnext_doc_update", {doctype:"ToDo",name:created.data.name,data:{status:"Closed"}});
  `;
  const invoke = async (
    source: string | Record<string, unknown>,
    retry: Record<string, unknown> = {},
  ) => {
    const version = "2026-07-28";
    const response = await serve(
      new Request(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          "MCP-Protocol-Version": version,
          "Mcp-Method": "tools/call",
          "Mcp-Name": "execute",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "execute",
            arguments: typeof source === "string" ? { code: source } : source,
            ...retry,
            _meta: {
              "io.modelcontextprotocol/protocolVersion": version,
              "io.modelcontextprotocol/clientCapabilities": {
                elicitation: { form: {} },
              },
            },
          },
        }),
      }),
    );
    return await response.json();
  };
  function approval(
    result: {
      inputRequests: Record<string, { params: { message: string } }>;
      requestState: string;
    },
    operation: string,
    args: Record<string, unknown>,
  ) {
    const entries = Object.entries(result.inputRequests);
    assertEquals(entries.length, 1);
    const [id, request] = entries[0];
    assertStringIncludes(request.params.message, operation);
    assertStringIncludes(request.params.message, JSON.stringify(args));
    assert(result.requestState);
    return {
      requestState: result.requestState,
      inputResponses: {
        [id]: { action: "accept", content: { confirm: true } },
      },
    };
  }
  // Substitute only the ERP connection. Registration, schema validation, the
  // QuickJS VM, native handlers, signed MCP forms and replay are exercised.
  setFrappeClient({
    create(doctype: string, data: unknown) {
      effects.push(["create", doctype, data]);
      return Promise.resolve({ doctype, name: "TODO-001" });
    },
    update(doctype: string, name: string, data: Record<string, unknown>) {
      effects.push(["update", doctype, name, data]);
      if (name !== "TODO-001") throw new Error("Unknown test record");
      return Promise.resolve({ doctype, name, ...data });
    },
  } as unknown as FrappeClient);
  try {
    const first = await invoke(code);
    const create = approval(first.result, "erpnext_doc_create", {
      doctype: "ToDo",
      data: createData,
    });
    assertEquals(effects, []);
    const second = await invoke(code, create);
    const update = approval(second.result, "erpnext_doc_update", {
      doctype: "ToDo",
      name: "TODO-001",
      data: updateData,
    });
    assertEquals(effects, [["create", "ToDo", createData]]);
    const done = await invoke(code, update);
    assert(!done.error && !done.result.isError);
    assertEquals(done.result.structuredContent.data, {
      doctype: "ToDo",
      name: "TODO-001",
      status: "Closed",
    });
    const replay = await invoke(code, update);
    assert(replay.error || replay.result.isError);
    assertEquals(effects, [["create", "ToDo", createData], [
      "update",
      "ToDo",
      "TODO-001",
      updateData,
    ]]);

    const bad =
      'return erp.call("erpnext_doc_update",{doctype:"ToDo",name:"MISSING",data:{status:"Closed"}})';
    const pending = await invoke(bad);
    const grant = approval(pending.result, "erpnext_doc_update", {
      doctype: "ToDo",
      name: "MISSING",
      data: updateData,
    });
    const failed = await invoke(bad, grant);
    assertEquals(failed.result.isError, true);
    assertStringIncludes(failed.result.content[0].text, "Unknown test record");
    assertEquals(effects.length, 3);

    const preview = await invoke({
      code: `
        const data = { status: erp.params.status };
        return erp.params.apply
          ? erp.call("erpnext_doc_update", {doctype:"ToDo",name:"TODO-001",data})
          : data;
      `,
      params: { status: "Open", apply: false },
    });
    const runId = preview.result._meta["io.casys/erpnext-execution-ref"];
    assert(typeof runId === "string");
    const saved = await invoke({ save: { runId, name: "Set status" } });
    assert(!saved.error && !saved.result.isError);
    assertEquals(saved.result._meta["io.casys/erpnext-snippet-event"], "saved");
    const catalog = await invoke({ snippets: true });
    assert(!catalog.error && !catalog.result.isError);
    assertEquals(
      catalog.result._meta["io.casys/erpnext-snippet-event"],
      "list",
    );
    assertEquals(catalog.result.structuredContent, {
      value: [{
        id: "Set status",
        name: "Set status",
        parameters: { apply: "boolean", status: "string" },
      }],
    });

    const request = {
      snippet: "Set status",
      params: { status: "Open", apply: true },
    };
    const snippetPending = await invoke(request);
    const snippetGrant = approval(snippetPending.result, "erpnext_doc_update", {
      doctype: "ToDo",
      name: "TODO-001",
      data: { status: "Open" },
    });
    const changed = {
      ...request,
      params: { ...request.params, status: "Closed" },
    };
    const mismatch = await invoke(changed, snippetGrant);
    assert(mismatch.error || mismatch.result.isError);
    assertEquals(effects.length, 3);

    const changedPending = await invoke(changed);
    const changedGrant = approval(changedPending.result, "erpnext_doc_update", {
      doctype: "ToDo",
      name: "TODO-001",
      data: { status: "Closed" },
    });
    const changedDone = await invoke(changed, changedGrant);
    assert(!changedDone.error && !changedDone.result.isError);
    assertEquals(effects[3], ["update", "ToDo", "TODO-001", {
      status: "Closed",
    }]);
    assertEquals(effects.length, 4);
  } finally {
    setFrappeClient(null);
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("a local Apps host confirms a 10 MiB upload passed through execute.input exactly once", async () => {
  const model = new Map<string, ToolHandler>();
  const callbacks = new Map<string, ToolHandler>();
  registerCodeModeTools(
    {
      registerTool: (tool, handler) => model.set(tool.name, handler),
      registerAppOnlyTool: (tool, handler) => callbacks.set(tool.name, handler),
    },
    new ErpNextToolsClient({ categories: ["operations"] }),
    { resourceUri: "ui://erpnext/execute", mountableResourceUris: [] },
  );
  const ctx: ToolHandlerContext = {
    toolName: "execute",
    clientCapabilities: {
      extensions: {
        "io.modelcontextprotocol/ui": {
          mimeTypes: ["text/html;profile=mcp-app"],
        },
      },
    },
  };
  const count = 10 * 1024 * 1024;
  const raw = "x".repeat(count);
  const base64 = btoa(raw);
  const hash = Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw)),
    ),
    (n) => n.toString(16).padStart(2, "0"),
  ).join("");
  const input = {
    file_name: "approval.bin",
    content_base64: base64,
    attached_to_doctype: "Sales Invoice",
    attached_to_name: "INV-42",
  };
  const code =
    'if (typeof erp.input !== "undefined") throw Error("input leaked"); return erp.callWithInput("erpnext_file_upload");';
  let uploads = 0;
  setFrappeClient(
    {
      uploadFile(
        file: {
          contentBase64: string;
          fileName: string;
          attachedToName: string;
        },
      ) {
        assert(file.contentBase64 === base64);
        assertEquals(file.fileName, input.file_name);
        assertEquals(file.attachedToName, input.attached_to_name);
        uploads++;
        return Promise.resolve({ name: "FILE-1", file_name: file.fileName });
      },
    } as unknown as FrappeClient,
  );
  try {
    const pending = await model.get("execute")!({ code, input }, ctx) as {
      _meta: Record<
        string,
        { ticket: string; arguments: { content_base64: unknown } }
      >;
    };
    const gate = pending._meta["io.casys/erpnext-write-confirmation"];
    assert(gate.ticket);
    assertEquals(gate.arguments.content_base64, { bytes: count, sha256: hash });
    assert(JSON.stringify(pending).length < 4096);
    assertEquals(uploads, 0);
    const callback = callbacks.get("erpnext_confirm_write")!;
    const args = { decision: "approve", ticket: gate.ticket };
    const decisionCtx = { ...ctx, toolName: "erpnext_confirm_write" };
    const done = await callback(args, decisionCtx) as {
      structuredContent: { data: { name: string } };
    };
    assertEquals(done.structuredContent.data.name, "FILE-1");
    await assertRejects(
      async () => await callback(args, decisionCtx),
      Error,
      "already used",
    );
    assertEquals(uploads, 1);
  } finally {
    setFrappeClient(null);
  }
});
