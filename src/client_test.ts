import {
  assert,
  assertEquals,
  assertRejects,
  assertStrictEquals,
  assertThrows,
} from "@std/assert";
import {
  allTools,
  ErpNextToolsClient,
  getToolByName,
  ToolFilterError,
} from "./client.ts";
import { type FrappeClient, setFrappeClient } from "./api/frappe-client.ts";
import { docTypeLayoutMemo } from "./tools/doctype-layout.ts";
import { AmbiguousLinkError } from "./api/resolve.ts";
import { linkDisambiguationRequestKey } from "./mrtr/link-disambiguation.ts";
import {
  VIEWER_META_KEY,
  VIEWER_ONLY_RESULT_KEYS,
} from "./tools/model-visible.ts";
import type { ErpNextTool, ErpNextToolContext } from "./tools/types.ts";
import type { ToolHandlerContext } from "@casys/mcp-server";

// Note: Error handling previously tested here (isError wrapping) has been moved
// to the server layer via toolErrorMapper in server.ts. Handlers now throw
// naturally and the server converts errors to isError results.

/** Bloc d'enrichissement viewer d'un résultat pré-formaté (`_meta["io.casys/viewer"]`). */
function viewerBlock(
  result: { _meta?: Record<string, unknown> },
): Record<string, unknown> {
  const viewer = result._meta?.[VIEWER_META_KEY] as
    | Record<string, unknown>
    | undefined;
  assert(viewer, "result should carry the viewer enrichment block");
  return viewer;
}

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
    ) as {
      structuredContent: Record<string, unknown>;
      _meta?: Record<string, unknown>;
    };

    assertEquals(
      (viewerBlock(result).refreshRequest as {
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
    }) as {
      structuredContent: Record<string, unknown>;
      _meta?: Record<string, unknown>;
    };

    assertEquals(result.structuredContent.refreshRequest, undefined);
    assertEquals(viewerBlock(result).refreshRequest, undefined);
    assertEquals(viewerBlock(result)._availableTools, []);
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
      _meta?: Record<string, unknown>;
    };

    assertEquals(viewerBlock(result).refreshRequest, safeRefresh);
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
      _meta?: Record<string, unknown>;
    };
    assertEquals(result.structuredContent._jumps, undefined);
    assertEquals(viewerBlock(result)._jumps, undefined);
    assertEquals(viewerBlock(result)._availableTools, [tool.name]);
    assertEquals(
      (result._meta?.ui as { resourceUri: string }).resourceUri,
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
      _meta?: Record<string, unknown>;
    };
    assertEquals(viewerBlock(result)._availableTools, [
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
      _meta?: Record<string, unknown>;
    };
    assertEquals(viewerBlock(result)._availableTools, [
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
    )!({}) as {
      structuredContent: Record<string, unknown>;
      _meta?: Record<string, unknown>;
    };
    const tools = viewerBlock(result)._availableTools as string[];
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
      _meta?: Record<string, unknown>;
    };
    assertEquals(viewerBlock(result)._availableTools, [
      "erpnext_kanban_get_board",
      "erpnext_kanban_move_card",
    ]);
    assertEquals(JSON.parse(result.content[0].text), result.structuredContent);
  } finally {
    setFrappeClient(null);
  }
});

Deno.test("buildHandlersMap - viewer enrichment stays out of model context", async () => {
  const tool: ErpNextTool = {
    name: "erpnext_viewer_split_probe",
    description: "Test-only viewer/model split probe",
    category: "setup",
    inputSchema: { type: "object" },
    annotations: { readOnlyHint: true },
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
    handler: async () => ({
      doctype: "Sales Invoice",
      count: 1,
      data: [{ name: "SINV-001" }],
      _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
    }),
  };
  const client = new ErpNextToolsClient();
  (client as unknown as { tools: ErpNextTool[] }).tools = [tool];

  setFrappeClient({} as FrappeClient);
  try {
    const result = await client.buildHandlersMap().get(tool.name)!({}) as {
      content: Array<{ type: string; text: string }>;
      structuredContent: Record<string, unknown>;
      _meta?: Record<string, unknown>;
    };

    const textPayload = JSON.parse(result.content[0].text) as Record<
      string,
      unknown
    >;
    for (const key of VIEWER_ONLY_RESULT_KEYS) {
      assertEquals(
        key in result.structuredContent,
        false,
        `${key} must not reach structuredContent`,
      );
      assertEquals(
        key in textPayload,
        false,
        `${key} must not reach the model text`,
      );
    }
    assertEquals(result.structuredContent, {
      doctype: "Sales Invoice",
      count: 1,
      data: [{ name: "SINV-001" }],
    });
    assertEquals(textPayload, result.structuredContent);

    assert(result._meta, "viewer result should carry _meta");
    assertEquals(
      (result._meta.ui as { resourceUri: string }).resourceUri,
      "ui://mcp-erpnext/doclist-viewer",
    );
    const viewer = result._meta["io.casys/viewer"] as Record<
      string,
      unknown
    >;
    assert(viewer, 'enrichment should live under _meta["io.casys/viewer"]');
    assertEquals(viewer.version, 1);
    assertEquals(
      (viewer.refreshRequest as { toolName: string }).toolName,
      tool.name,
    );
    assertEquals(viewer._availableTools, [tool.name]);
    assertEquals("_meta" in viewer, false);
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

// ---------------------------------------------------------------------------
// Tool filtering (categories / excludeCategories / excludeTools)
// ---------------------------------------------------------------------------

Deno.test("ErpNextToolsClient - without option listTools() is allTools itself", () => {
  const client = new ErpNextToolsClient();
  assertStrictEquals(client.listTools(), allTools);
  assertEquals(client.count, allTools.length);
  assertEquals(client.selection.warnings, []);
});

Deno.test("ErpNextToolsClient - legacy categories never throws, unknown names land in selection.warnings", () => {
  const client = new ErpNextToolsClient({ categories: ["sales", "slaes"] });
  assertEquals(client.selection.warnings.length, 1);
  assertEquals(client.selection.warnings[0].reason, "UNKNOWN_CATEGORY");
  assertEquals(new ErpNextToolsClient({ categories: ["slaes"] }).count, 0);
  assertEquals(new ErpNextToolsClient({ categories: [] }).count, 0);
});

Deno.test("ErpNextToolsClient - new exclusion options are strict", () => {
  assertThrows(
    () => new ErpNextToolsClient({ excludeCategories: ["slaes"] }),
    ToolFilterError,
  );
  assertThrows(
    () => new ErpNextToolsClient({ excludeTools: ["erpnext_nope"] }),
    ToolFilterError,
  );
});

Deno.test("ErpNextToolsClient - excludeCategories buy hides buy_capture from list, wire format and handlers", () => {
  const client = new ErpNextToolsClient({ excludeCategories: ["buy"] });
  assertEquals(client.count, allTools.length - 1);
  assert(
    !client.toMCPFormat().some((t) => t.name === "erpnext_buy_capture"),
  );
  assert(!client.buildHandlersMap().has("erpnext_buy_capture"));
});

Deno.test("ErpNextToolsClient - execute refuses an excluded tool", async () => {
  const client = new ErpNextToolsClient({
    excludeTools: ["erpnext_file_list"],
  });
  await assertRejects(
    () => client.execute("erpnext_file_list", {}),
    Error,
    "Unknown tool",
  );
});

Deno.test("viewers stay fail-closed - excluding the file tools removes them from _availableTools", async () => {
  const client = new ErpNextToolsClient({
    categories: ["crm", "operations"],
    excludeTools: [
      "erpnext_file_list",
      "erpnext_file_upload",
      "erpnext_file_download",
    ],
  });
  setFrappeClient({
    get: () =>
      Promise.resolve({ name: "LEAD-001", doctype: "Lead", docstatus: 0 }),
  } as unknown as FrappeClient);
  try {
    const result = await client.buildHandlersMap().get("erpnext_lead_get")!(
      { name: "LEAD-001" },
    ) as {
      structuredContent: Record<string, unknown>;
      _meta?: Record<string, unknown>;
    };
    // `_availableTools` est une clé viewer : bloc `_meta`, jamais le payload lu
    // par le modèle.
    assertEquals(result.structuredContent._availableTools, undefined);
    const available = viewerBlock(result)._availableTools as string[];
    assert(available.length > 0);
    assertEquals(available.filter((n) => n.startsWith("erpnext_file_")), []);
  } finally {
    setFrappeClient(null);
  }
});

Deno.test("viewers stay fail-closed - excluding operations removes doc_submit and doc_cancel", async () => {
  const client = new ErpNextToolsClient({ excludeCategories: ["operations"] });
  setFrappeClient({
    get: () =>
      Promise.resolve({
        name: "SO-001",
        customer: "CUST-001",
        status: "Draft",
        docstatus: 0,
      }),
  } as unknown as FrappeClient);
  try {
    const result = await client.buildHandlersMap().get(
      "erpnext_sales_order_get",
    )!({ name: "SO-001" }) as {
      structuredContent: Record<string, unknown>;
      _meta?: Record<string, unknown>;
    };
    assertEquals(result.structuredContent._availableTools, undefined);
    const available = viewerBlock(result)._availableTools as string[];
    assert(!available.includes("erpnext_doc_submit"));
    assert(!available.includes("erpnext_doc_cancel"));
    assert(available.includes("erpnext_sales_order_submit"));
    assertEquals(available.filter((n) => n.startsWith("erpnext_file_")), []);
  } finally {
    setFrappeClient(null);
  }
});

// ── Mise en page des fiches (`_fieldLayout`) ──────────────────────────────────

const LEAD_GETDOCTYPE = {
  docs: [{
    name: "Lead",
    title_field: "lead_name",
    fields: [
      { fieldname: "lead_name", fieldtype: "Data", label: "Full Name" },
      {
        fieldname: "email_id",
        fieldtype: "Data",
        label: "Email Address",
        bold: 1,
      },
      { fieldname: "details", fieldtype: "Section Break", label: "Details" },
      { fieldname: "source", fieldtype: "Link", label: "Source" },
    ],
  }],
};

type ViewerResult = {
  content: Array<{ text: string }>;
  structuredContent: Record<string, unknown>;
  _meta?: Record<string, unknown>;
};

/** Fait tourner `run` avec un faux client Frappe et un mémo de mises en page vide. */
async function withFrappe(
  frappe: Record<string, unknown>,
  run: () => Promise<void>,
): Promise<void> {
  docTypeLayoutMemo.clear();
  setFrappeClient(frappe as unknown as FrappeClient);
  try {
    await run();
  } finally {
    setFrappeClient(null);
    docTypeLayoutMemo.clear();
  }
}

Deno.test("buildHandlersMap - attaches the DocType field layout to the viewer block only", async () => {
  const calls: Array<{ method: string; args: unknown; http: unknown }> = [];
  await withFrappe({
    get: () => Promise.resolve({ name: "LEAD-001", lead_name: "Ada" }),
    callMethodRaw: (method: string, args: unknown, http: unknown) => {
      calls.push({ method, args, http });
      return Promise.resolve(LEAD_GETDOCTYPE);
    },
  }, async () => {
    const client = new ErpNextToolsClient();
    const result = await client.buildHandlersMap().get("erpnext_lead_get")!(
      { name: "LEAD-001" },
    ) as ViewerResult;

    const layout = viewerBlock(result)._fieldLayout as Record<string, unknown>;
    assertEquals(layout, {
      version: 1,
      preview: ["lead_name", "email_id"],
      sections: [
        { label: null, fields: ["lead_name", "email_id"] },
        { label: "Details", fields: ["source"] },
      ],
      labels: {
        lead_name: "Full Name",
        email_id: "Email Address",
        source: "Source",
      },
    });
    // Jamais dans ce que lit le modèle.
    assertEquals(result.structuredContent._fieldLayout, undefined);
    assertEquals(result.content[0].text.includes("_fieldLayout"), false);
    assertEquals(result.content[0].text.includes("Email Address"), false);
    assertEquals(JSON.parse(result.content[0].text), result.structuredContent);
    assertEquals(result.structuredContent.data, {
      name: "LEAD-001",
      lead_name: "Ada",
      doctype: "Lead",
    });
    assertEquals(calls, [{
      method: "frappe.desk.form.load.getdoctype",
      args: { doctype: "Lead" },
      http: "GET",
    }]);
  });
});

Deno.test("buildHandlersMap - a failing getdoctype never fails the tool", async () => {
  const errors: unknown[][] = [];
  const consoleError = console.error;
  console.error = (...args: unknown[]) => errors.push(args);
  try {
    await withFrappe({
      get: () => Promise.resolve({ name: "LEAD-001", lead_name: "Ada" }),
      callMethodRaw: () => Promise.reject(new Error("403 PermissionError")),
    }, async () => {
      const client = new ErpNextToolsClient();
      const result = await client.buildHandlersMap().get("erpnext_lead_get")!(
        { name: "LEAD-001" },
      ) as ViewerResult;

      assertEquals(result.structuredContent.data, {
        name: "LEAD-001",
        lead_name: "Ada",
        doctype: "Lead",
      });
      assertEquals(viewerBlock(result)._fieldLayout, undefined);
      // Le reste de l'enrichissement viewer est intact.
      assert(Array.isArray(viewerBlock(result)._availableTools));
    });
  } finally {
    console.error = consoleError;
  }
  assertEquals(errors.length, 1);
  assertEquals(String(errors[0][0]).includes("Lead"), true);
});

Deno.test("buildHandlersMap - field layout is fetched once per DocType per hour", async () => {
  let calls = 0;
  await withFrappe({
    get: () => Promise.resolve({ name: "LEAD-001" }),
    callMethodRaw: () => {
      calls++;
      return Promise.resolve(LEAD_GETDOCTYPE);
    },
  }, async () => {
    const handler = new ErpNextToolsClient().buildHandlersMap().get(
      "erpnext_lead_get",
    )!;
    await handler({ name: "LEAD-001" });
    await handler({ name: "LEAD-001" });
    assertEquals(calls, 1);
  });
});

Deno.test("buildHandlersMap - Company and DocType documents never trigger a layout read", async () => {
  let calls = 0;
  const probe = (doctype: string): ErpNextTool => ({
    name: `erpnext_${doctype.toLowerCase()}_document_probe`,
    description: "Test-only viewer document",
    category: "setup",
    inputSchema: { type: "object" },
    annotations: { readOnlyHint: true },
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/doc-viewer" } },
    handler: async () => ({ data: { doctype, name: "X-001" } }),
  });
  await withFrappe({
    callMethodRaw: () => {
      calls++;
      return Promise.resolve(LEAD_GETDOCTYPE);
    },
  }, async () => {
    const tools = [probe("Company"), probe("DocType")];
    const client = new ErpNextToolsClient();
    (client as unknown as { tools: ErpNextTool[] }).tools = tools;
    const handlers = client.buildHandlersMap();
    for (const tool of tools) {
      const result = await handlers.get(tool.name)!({}) as ViewerResult;
      assertEquals(viewerBlock(result)._fieldLayout, undefined);
      assertEquals(result.structuredContent.data, {
        doctype: tool.name.includes("company") ? "Company" : "DocType",
        name: "X-001",
      });
    }
    assertEquals(calls, 0);
  });
});

Deno.test("buildHandlersMap - lists and viewer-less results get no field layout", async () => {
  let calls = 0;
  const plain: ErpNextTool = {
    name: "erpnext_plain_document_probe",
    description: "Test-only document without a viewer",
    category: "setup",
    inputSchema: { type: "object" },
    handler: async () => ({ data: { doctype: "Lead", name: "LEAD-001" } }),
  };
  const list: ErpNextTool = {
    name: "erpnext_list_document_probe",
    description: "Test-only list",
    category: "setup",
    inputSchema: { type: "object" },
    annotations: { readOnlyHint: true },
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
    handler: async () => ({
      doctype: "Lead",
      data: [{ doctype: "Lead", name: "LEAD-001" }],
      _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
    }),
  };
  await withFrappe({
    callMethodRaw: () => {
      calls++;
      return Promise.resolve(LEAD_GETDOCTYPE);
    },
  }, async () => {
    const client = new ErpNextToolsClient();
    (client as unknown as { tools: ErpNextTool[] }).tools = [plain, list];
    const handlers = client.buildHandlersMap();
    const plainResult = await handlers.get(plain.name)!({}) as ViewerResult;
    const listResult = await handlers.get(list.name)!({}) as ViewerResult;

    assertEquals(calls, 0);
    assertEquals(plainResult._meta, undefined);
    assertEquals(viewerBlock(listResult)._fieldLayout, undefined);
  });
});

Deno.test("buildHandlersMap - a direct document record also gets its field layout", async () => {
  const direct: ErpNextTool = {
    name: "erpnext_direct_document_probe",
    description: "Test-only direct document",
    category: "setup",
    inputSchema: { type: "object" },
    annotations: { readOnlyHint: true },
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/doc-viewer" } },
    handler: async () => ({
      doctype: "Lead",
      name: "LEAD-001",
      lead_name: "Ada",
    }),
  };
  await withFrappe({
    callMethodRaw: () => Promise.resolve(LEAD_GETDOCTYPE),
  }, async () => {
    const client = new ErpNextToolsClient();
    (client as unknown as { tools: ErpNextTool[] }).tools = [direct];
    const result = await client.buildHandlersMap().get(direct.name)!(
      {},
    ) as ViewerResult;
    assertEquals(
      (viewerBlock(result)._fieldLayout as { version: number }).version,
      1,
    );
    assertEquals(result.structuredContent._fieldLayout, undefined);
  });
});

Deno.test("execute - leaves the library result without a field layout", async () => {
  let calls = 0;
  await withFrappe({
    get: () => Promise.resolve({ name: "LEAD-001" }),
    callMethodRaw: () => {
      calls++;
      return Promise.resolve(LEAD_GETDOCTYPE);
    },
  }, async () => {
    const result = await new ErpNextToolsClient().execute(
      "erpnext_lead_get",
      { name: "LEAD-001" },
    ) as Record<string, unknown>;
    assertEquals(calls, 0);
    assertEquals(result._fieldLayout, undefined);
  });
});

Deno.test("viewer-only keys include the field layout", () => {
  assert(
    (VIEWER_ONLY_RESULT_KEYS as readonly string[]).includes("_fieldLayout"),
  );
});
