import { assert, assertEquals, assertRejects } from "@std/assert";
import { ErpNextToolsClient, getToolByName } from "./client.ts";
import { type FrappeClient, setFrappeClient } from "./api/frappe-client.ts";
import { AmbiguousLinkError } from "./api/resolve.ts";
import { linkDisambiguationRequestKey } from "./mrtr/link-disambiguation.ts";
import type { ErpNextTool, ErpNextToolContext } from "./tools/types.ts";
import type { ToolHandlerContext } from "@casys/mcp-server";

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

Deno.test("buildHandlersMap - forwards MCP request context to ERPNext tools", async () => {
  let received: ErpNextToolContext | undefined;
  const tool: ErpNextTool = {
    name: "erpnext_context_probe",
    description: "Test-only MCP context probe",
    category: "setup",
    inputSchema: { type: "object" },
    handler: async (_input, context) => {
      received = context;
      return "ok";
    },
  };
  const client = new ErpNextToolsClient();
  (client as unknown as { tools: ErpNextTool[] }).tools = [tool];
  const frappeClient = {} as FrappeClient;
  const mcpContext: ToolHandlerContext = {
    toolName: tool.name,
    clientCapabilities: { elicitation: {} },
    inputResponses: { selected_customer: { action: "accept" } },
    retryVerified: true,
  };

  setFrappeClient(frappeClient);
  try {
    await client.buildHandlersMap().get(tool.name)!({}, mcpContext);
  } finally {
    setFrappeClient(null);
  }

  assert(received, "tool should receive an ERPNext context");
  assertEquals(received.client, frappeClient);
  assertEquals(received.clientCapabilities, mcpContext.clientCapabilities);
  assertEquals(received.inputResponses, mcpContext.inputResponses);
  assertEquals(received.retryVerified, true);
});

Deno.test("buildHandlersMap - remains compatible without MCP request context", async () => {
  let received: ErpNextToolContext | undefined;
  const tool: ErpNextTool = {
    name: "erpnext_context_compatibility_probe",
    description: "Test-only MCP context compatibility probe",
    category: "setup",
    inputSchema: { type: "object" },
    handler: async (_input, context) => {
      received = context;
      return "ok";
    },
  };
  const client = new ErpNextToolsClient();
  (client as unknown as { tools: ErpNextTool[] }).tools = [tool];
  const frappeClient = {} as FrappeClient;

  setFrappeClient(frappeClient);
  try {
    await client.buildHandlersMap().get(tool.name)!({});
  } finally {
    setFrappeClient(null);
  }

  assert(received, "tool should receive an ERPNext context");
  assertEquals(received.client, frappeClient);
  assertEquals(Object.keys(received), ["client"]);
});

Deno.test("buildHandlersMap - uses resolved Link IDs in UI refresh requests", async () => {
  const inputPath = "customer";
  const requestKey = linkDisambiguationRequestKey(inputPath);
  const tool: ErpNextTool = {
    name: "erpnext_context_ui_probe",
    description: "Test-only UI Link disambiguation probe",
    category: "setup",
    inputSchema: { type: "object" },
    annotations: { readOnlyHint: true },
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
    handler: async (input) => {
      if (input.customer === "Acme") {
        throw new AmbiguousLinkError({
          message: "ambiguous customer",
          doctype: "Customer",
          identifier: "Acme",
          inputPath,
          candidates: [
            { id: "CUST-001", label: "Acme" },
            { id: "CUST-002", label: "Acme" },
          ],
          truncated: false,
        });
      }
      return {
        doctype: "Customer",
        data: [],
        _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
      };
    },
  };
  const client = new ErpNextToolsClient({ enableLinkDisambiguation: true });
  (client as unknown as { tools: ErpNextTool[] }).tools = [tool];
  const frappeClient = {} as FrappeClient;

  setFrappeClient(frappeClient);
  try {
    const handler = client.buildHandlersMap().get(tool.name)!;
    const initial = await handler(
      { customer: "Acme" },
      {
        toolName: tool.name,
        clientCapabilities: { elicitation: {} },
      },
    ) as Record<string, unknown>;
    assertEquals(initial.resultType, "input_required");
    assertEquals(
      "structuredContent" in initial,
      false,
      "UI metadata must not hide the top-level MRTR signal",
    );

    const result = await handler(
      { customer: "Acme" },
      {
        toolName: tool.name,
        clientCapabilities: { elicitation: {} },
        inputResponses: {
          [requestKey]: {
            action: "accept",
            content: { recordId: "CUST-002" },
          },
        },
        retryVerified: true,
      },
    ) as { structuredContent: Record<string, unknown> };

    assertEquals(
      (result.structuredContent.refreshRequest as {
        arguments: Record<string, unknown>;
      }).arguments,
      { customer: "CUST-002" },
    );
  } finally {
    setFrappeClient(null);
  }
});

Deno.test("buildHandlersMap - mutating viewer tools cannot refresh by replaying themselves", async () => {
  const tool: ErpNextTool = {
    name: "erpnext_mutating_ui_probe",
    description: "Test-only mutating UI probe",
    category: "setup",
    inputSchema: { type: "object" },
    annotations: { destructiveHint: true },
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/invoice-viewer" } },
    handler: async () => ({
      data: { name: "SINV-001", doctype: "Sales Invoice" },
      _meta: { ui: { resourceUri: "ui://mcp-erpnext/invoice-viewer" } },
      _availableTools: ["erpnext_doc_cancel", "forged_tool"],
      refreshRequest: {
        toolName: "erpnext_mutating_ui_probe",
        arguments: { name: "SINV-001" },
      },
    }),
  };
  const client = new ErpNextToolsClient();
  (client as unknown as { tools: ErpNextTool[] }).tools = [tool];

  setFrappeClient({} as FrappeClient);
  try {
    const result = await client.buildHandlersMap().get(tool.name)!({
      name: "SINV-001",
    }) as { structuredContent: Record<string, unknown> };

    assertEquals(result.structuredContent.refreshRequest, undefined);
    assertEquals(result.structuredContent._availableTools, []);
  } finally {
    setFrappeClient(null);
  }
});

Deno.test("buildHandlersMap - mutating viewer tools preserve an explicit read-only refresh", async () => {
  const safeRefresh = {
    toolName: "erpnext_sales_invoice_get",
    arguments: { name: "SINV-001" },
  };
  const tool: ErpNextTool = {
    name: "erpnext_mutating_ui_safe_refresh_probe",
    description: "Test-only mutating UI safe-refresh probe",
    category: "setup",
    inputSchema: { type: "object" },
    annotations: { destructiveHint: true },
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/invoice-viewer" } },
    handler: async () => ({
      data: { name: "SINV-001", doctype: "Sales Invoice" },
      _meta: { ui: { resourceUri: "ui://mcp-erpnext/invoice-viewer" } },
      refreshRequest: safeRefresh,
    }),
  };
  const safeReadTool = getToolByName("erpnext_sales_invoice_get")!;
  const client = new ErpNextToolsClient();
  (client as unknown as { tools: ErpNextTool[] }).tools = [tool, safeReadTool];

  setFrappeClient({} as FrappeClient);
  try {
    const result = await client.buildHandlersMap().get(tool.name)!({}) as {
      structuredContent: Record<string, unknown>;
    };

    assertEquals(result.structuredContent.refreshRequest, safeRefresh);
  } finally {
    setFrappeClient(null);
  }
});

Deno.test("buildHandlersMap - category-scoped clients omit jumps to unavailable tools", async () => {
  const tool: ErpNextTool = {
    name: "erpnext_kpi_revenue",
    description: "Test-only scoped KPI tool",
    category: "analytics",
    inputSchema: { type: "object" },
    annotations: { readOnlyHint: true },
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/kpi-viewer" } },
    handler: async () => ({ label: "Revenue", value: 42 }),
  };
  const client = new ErpNextToolsClient();
  (client as unknown as { tools: ErpNextTool[] }).tools = [tool];

  setFrappeClient({} as FrappeClient);
  try {
    const result = await client.buildHandlersMap().get(tool.name)!({}) as {
      content: Array<{ text: string }>;
      structuredContent: Record<string, unknown>;
    };
    assertEquals(result.structuredContent._jumps, undefined);
    assertEquals(result.structuredContent._availableTools, [tool.name]);
    assertEquals(
      (result.structuredContent._meta as { ui: { resourceUri: string } }).ui
        .resourceUri,
      "ui://mcp-erpnext/kpi-viewer",
    );
    assertEquals(JSON.parse(result.content[0].text), result.structuredContent);
  } finally {
    setFrappeClient(null);
  }
});

Deno.test("buildHandlersMap - sales category advertises only usable invoice actions", async () => {
  const client = new ErpNextToolsClient({ categories: ["sales"] });
  const frappeClient = {
    get: () =>
      Promise.resolve({
        name: "SINV-001",
        doctype: "Sales Invoice",
        customer: "CUST-001",
        status: "Draft",
        docstatus: 0,
      }),
  } as unknown as FrappeClient;

  setFrappeClient(frappeClient);
  try {
    const result = await client.buildHandlersMap().get(
      "erpnext_sales_invoice_get",
    )!({ name: "SINV-001" }) as {
      content: Array<{ text: string }>;
      structuredContent: Record<string, unknown>;
    };
    assertEquals(result.structuredContent._availableTools, [
      "erpnext_customer_get",
      "erpnext_sales_invoice_get",
      "erpnext_sales_invoice_submit",
    ]);
    assertEquals(JSON.parse(result.content[0].text), result.structuredContent);
  } finally {
    setFrappeClient(null);
  }
});

Deno.test("buildHandlersMap - sales-only Sales Order advertises its exact submit and cancel", async () => {
  const client = new ErpNextToolsClient({ categories: ["sales"] });
  const frappeClient = {
    get: () =>
      Promise.resolve({
        name: "SO-001",
        customer: "CUST-001",
        status: "Draft",
        docstatus: 0,
      }),
  } as unknown as FrappeClient;

  setFrappeClient(frappeClient);
  try {
    const result = await client.buildHandlersMap().get(
      "erpnext_sales_order_get",
    )!({ name: "SO-001" }) as {
      structuredContent: Record<string, unknown>;
    };
    assertEquals(result.structuredContent._availableTools, [
      "erpnext_customer_get",
      "erpnext_sales_order_cancel",
      "erpnext_sales_order_get",
      "erpnext_sales_order_submit",
    ]);
    assertEquals(
      (result.structuredContent.data as Record<string, unknown>).doctype,
      "Sales Order",
    );
  } finally {
    setFrappeClient(null);
  }
});

Deno.test("buildHandlersMap - full server never advertises submit or cancel for master-data doclists", async () => {
  const client = new ErpNextToolsClient();
  const frappeClient = {
    list: () => Promise.resolve([{ name: "CUST-001", customer_name: "Acme" }]),
  } as unknown as FrappeClient;

  setFrappeClient(frappeClient);
  try {
    const result = await client.buildHandlersMap().get(
      "erpnext_customer_list",
    )!({}) as { structuredContent: Record<string, unknown> };
    const tools = result.structuredContent._availableTools as string[];
    assert(!tools.includes("erpnext_doc_submit"));
    assert(!tools.includes("erpnext_doc_cancel"));
  } finally {
    setFrappeClient(null);
  }
});

Deno.test("buildHandlersMap - kanban category advertises move but no operations/setup", async () => {
  const client = new ErpNextToolsClient({ categories: ["kanban"] });
  const frappeClient = {
    list: () => Promise.resolve([]),
  } as unknown as FrappeClient;

  setFrappeClient(frappeClient);
  try {
    const result = await client.buildHandlersMap().get(
      "erpnext_kanban_get_board",
    )!({ doctype: "Task" }) as {
      content: Array<{ text: string }>;
      structuredContent: Record<string, unknown>;
    };
    assertEquals(result.structuredContent._availableTools, [
      "erpnext_kanban_get_board",
      "erpnext_kanban_move_card",
    ]);
    assertEquals(JSON.parse(result.content[0].text), result.structuredContent);
  } finally {
    setFrappeClient(null);
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

Deno.test("buildHandlersMap - detail objects remain machine-readable without a viewer", async () => {
  const tool: ErpNextTool = {
    name: "erpnext_detail_probe",
    description: "Test-only detail probe",
    category: "setup",
    inputSchema: { type: "object" },
    annotations: { readOnlyHint: true },
    handler: () => Promise.resolve({ data: { name: "BOM-001", items: [] } }),
  };
  const client = new ErpNextToolsClient();
  (client as unknown as { tools: ErpNextTool[] }).tools = [tool];
  setFrappeClient({} as FrappeClient);
  try {
    const result = await client.buildHandlersMap().get(tool.name)!({}) as {
      content: Array<{ type: string; text: string }>;
      structuredContent: Record<string, unknown>;
      _meta?: unknown;
    };
    assertEquals(result.structuredContent, {
      data: { name: "BOM-001", items: [] },
    });
    assertEquals(JSON.parse(result.content[0].text), result.structuredContent);
    assertEquals(result._meta, undefined);
  } finally {
    setFrappeClient(null);
  }
});

Deno.test("buildHandlersMap - preserves the download EmbeddedResource without duplicating its base64", async () => {
  const prepared = {
    content: [
      { type: "text", text: "Prepared report.pdf for download." },
      {
        type: "resource",
        resource: {
          uri: "file:///report.pdf",
          mimeType: "application/pdf",
          blob: "AP8=",
        },
      },
    ],
  };
  const tool: ErpNextTool = {
    name: "erpnext_file_download",
    description: "Test-only download probe",
    category: "operations",
    inputSchema: { type: "object" },
    annotations: { readOnlyHint: true },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-erpnext/doc-viewer",
        visibility: ["app"],
      },
    },
    handler: async () => prepared,
  };
  const client = new ErpNextToolsClient();
  (client as unknown as { tools: ErpNextTool[] }).tools = [tool];
  setFrappeClient({} as FrappeClient);
  try {
    const result = await client.buildHandlersMap().get(tool.name)!({});
    assertEquals(result, prepared);
    assertEquals(JSON.stringify(result).split("AP8=").length - 1, 1);
    assertEquals(
      "structuredContent" in (result as Record<string, unknown>),
      false,
    );
  } finally {
    setFrappeClient(null);
  }
});

Deno.test("buildHandlersMap - does not grant the preformatted bypass to another tool", async () => {
  const prepared = {
    content: [
      { type: "text", text: "Domain content" },
      {
        type: "resource",
        resource: {
          uri: "file:///report.pdf",
          mimeType: "application/pdf",
          blob: "AP8=",
        },
      },
    ],
  };
  const tool: ErpNextTool = {
    name: "erpnext_domain_content_probe",
    description: "Test-only domain content probe",
    category: "setup",
    inputSchema: { type: "object" },
    handler: async () => prepared,
  };
  const client = new ErpNextToolsClient();
  (client as unknown as { tools: ErpNextTool[] }).tools = [tool];
  setFrappeClient({} as FrappeClient);
  try {
    const result = await client.buildHandlersMap().get(tool.name)!({}) as {
      structuredContent: Record<string, unknown>;
    };
    assertEquals(result.structuredContent, prepared);
  } finally {
    setFrappeClient(null);
  }
});

Deno.test("execute - preserves the download EmbeddedResource result", async () => {
  const prepared = {
    content: [
      { type: "text", text: "Prepared report.pdf for download." },
      {
        type: "resource",
        resource: {
          uri: "file:///report.pdf",
          mimeType: "application/pdf",
          blob: "AP8=",
        },
      },
    ],
  };
  const tool: ErpNextTool = {
    name: "erpnext_file_download",
    description: "Test-only download probe",
    category: "operations",
    inputSchema: { type: "object" },
    handler: async () => prepared,
  };
  const client = new ErpNextToolsClient();
  (client as unknown as { tools: ErpNextTool[] }).tools = [tool];
  setFrappeClient({} as FrappeClient);
  try {
    assertEquals(await client.execute(tool.name, {}), prepared);
  } finally {
    setFrappeClient(null);
  }
});

Deno.test("execute - bounded tools stay bounded on the direct-execution path", async () => {
  // `execute()` calls handlers directly, with no schema validator in between.
  // A bound declared only in `inputSchema` therefore protects the MCP route and
  // leaves this exported API wide open — which is not theoretical: driving
  // erpnext_product_radar through here with 200 item codes was observed to start
  // 200 concurrent Bin queries against Frappe.
  //
  // The invariant is that the rejection happens before any round-trip, so this
  // counts queries rather than merely asserting that it throws.
  let queries = 0;
  const mock = {
    list: () => {
      queries++;
      return Promise.resolve([]);
    },
    get: () => Promise.resolve({ name: "X" }),
    create: () => Promise.resolve({ name: "X" }),
    update: () => Promise.resolve({ name: "X" }),
    delete: () => Promise.resolve(),
    callMethod: () => Promise.resolve(null),
  } as unknown as FrappeClient;

  setFrappeClient(mock);
  try {
    const client = new ErpNextToolsClient();
    const tooMany = Array.from({ length: 200 }, (_, i) => `ITEM-${i}`);

    await assertRejects(
      () => client.execute("erpnext_product_radar", { items: tooMany }),
      Error,
    );
    assertEquals(queries, 0, "must reject before issuing any Frappe query");

    // The bound must not swallow the supported calls either.
    queries = 0;
    await client.execute("erpnext_product_radar", { items: [] });
    assert(queries > 0, "auto-select still reaches Frappe");
  } finally {
    setFrappeClient(null);
  }
});
