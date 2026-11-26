import { assert, assertEquals, assertRejects } from "@std/assert";
import { readDeclaredViewUri } from "@mcpview/contracts";
import type { MCPTool, ToolHandlerContext } from "@mcpview/server";
import { createSnippetCatalog } from "@mcpview/server/snippets";
import { createCodeModeExecute } from "./execute.ts";
import {
  GROSS_MARGIN_KPI,
  isKpiPeriod,
  KPI_PERIOD_APPLY,
  KPI_PERIOD_SELECTED,
  KPI_VIEW,
  REVENUE_KPI,
} from "./kpi-period.ts";
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
    return { ...r, secret: typeof r._meta, _meta: {"dev.mcpview/declared-view": {version:1,resourceUri:"ui://erpnext/detail"}, "io.casys/erpnext-snippet-event": "list"} };
  `,
  });
  assertEquals(readDeclaredViewUri(computed), undefined);
  assert(computed && typeof computed === "object" && !("_meta" in computed));
  assert(
    computed && typeof computed === "object" && "structuredContent" in computed,
  );
  assertEquals(computed.structuredContent, {
    value: {
      args: { id: "INV-02" },
      secret: "undefined",
      _meta: {
        "dev.mcpview/declared-view": { version: 1, resourceUri: detail },
        "io.casys/erpnext-snippet-event": "list",
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

Deno.test("saving a selected run retains its code and replays the native view with new parameters", async () => {
  const snippets = createSnippetCatalog();
  const calls: string[] = [];
  const { handler } = createCodeModeExecute({
    tools: [list],
    mountableResourceUris: [table],
    snippets: () => ({ scope: "test", catalog: snippets }),
    call: (_name, args) => {
      calls.push(String(args.customer));
      return Promise.resolve({
        content: [{ type: "text", text: String(args.customer) }],
        structuredContent: { args },
        _meta: { "io.casys/viewer": { private: "viewer-only" } },
      });
    },
  });
  const first = await handler({
    code: 'return erp.call("list", { customer: erp.params.customer })',
    params: { customer: "Acme" },
  });
  const second = await handler({ code: 'return "unrelated"' });
  const metadata = (result: unknown) => {
    assert(result && typeof result === "object" && "_meta" in result);
    return result._meta as Record<string, unknown>;
  };
  const runId = metadata(first)["io.casys/erpnext-execution-ref"];
  assert(typeof runId === "string");
  assert(runId !== metadata(second)["io.casys/erpnext-execution-ref"]);
  assertEquals(readDeclaredViewUri(first), table);
  assertEquals(metadata(first)["io.casys/viewer"], { private: "viewer-only" });

  const saveResult = await handler({
    save: {
      name: "Customer invoices",
      runId,
      description: "Find a customer's invoices.",
    },
  });
  assertEquals(metadata(saveResult)["io.casys/erpnext-snippet-event"], "saved");
  assertEquals(calls, ["Acme"]);
  const saved = await handler({ snippets: true });
  assertEquals(metadata(saved)["io.casys/erpnext-snippet-event"], "list");
  assert(saved && typeof saved === "object" && "structuredContent" in saved);
  assertEquals(saved.structuredContent, {
    value: [{
      name: "Customer invoices",
      id: "Customer invoices",
      parameters: { customer: "string" },
      description: "Find a customer's invoices.",
    }],
  });
  const source = await handler({ inspectSnippet: "Customer invoices" });
  assertEquals(metadata(source)["io.casys/erpnext-snippet-event"], "source");
  assertEquals(readDeclaredViewUri(source), undefined);
  assert(source && typeof source === "object" && "structuredContent" in source);
  assertEquals(source.structuredContent, {
    value: {
      name: "Customer invoices",
      parameters: { customer: "string" },
      description: "Find a customer's invoices.",
      code: 'return erp.call("list", { customer: erp.params.customer })',
    },
  });
  assertEquals(calls, ["Acme"]);
  await assertRejects(
    async () =>
      await handler({ inspectSnippet: "Customer invoices", params: {} }),
    Error,
    "Snippet catalog requests do not accept execution inputs",
  );
  await assertRejects(
    async () =>
      await handler({
        snippet: "Customer invoices",
        params: { customer: 123 },
      }),
    Error,
    "requires type string",
  );
  const replay = await handler({
    snippet: "Customer invoices",
    params: { customer: "Globex" },
  });
  assertEquals(readDeclaredViewUri(replay), table);
  assertEquals(calls, ["Acme", "Globex"]);
});

Deno.test("an ineligible parameter contract preserves the successful ERP result", async () => {
  const snippets = createSnippetCatalog();
  const { handler } = createCodeModeExecute({
    tools: [list],
    mountableResourceUris: [table],
    snippets: () => ({ scope: "test", catalog: snippets }),
    call: () =>
      Promise.resolve({
        content: [{ type: "text", text: "Success" }],
        structuredContent: { rows: [] },
      }),
  });
  const result = await handler({
    code: 'return erp.call("list", {})',
    params: Object.fromEntries(
      Array.from({ length: 33 }, (_, index) => [`key${index}`, index]),
    ),
  });
  assertEquals(readDeclaredViewUri(result), table);
  assert(result && typeof result === "object" && "_meta" in result);
  assert(
    !(result._meta as Record<string, unknown>)[
      "io.casys/erpnext-execution-ref"
    ],
  );
});

Deno.test("selects declared ERP views in program order while keeping native metadata private", async () => {
  const calls: string[] = [];
  const { handler } = createCodeModeExecute({
    tools: [list, get],
    mountableResourceUris: [table, detail],
    call: async (name) => {
      calls.push(name);
      return {
        content: [{ type: "text", text: name }],
        structuredContent: { name },
        _meta: { private: "viewer only" },
      };
    },
  });
  const result = await handler({
    code: `
    const a=await erp.call("list",{}), b=await erp.call("get",{});
    erp.panel(b,"Invoice"); erp.panel(a,"List"); erp.panel(b,"Invoice details");
    return {invoice:b.name};
  `,
  });
  type Board = {
    content: unknown;
    structuredContent: {
      value: unknown;
      panels: { id: string; name: string; title: string }[];
    };
    _meta: Record<
      string,
      {
        id: string;
        name: string;
        title: string;
        result: { _meta: { private: string } };
      }[]
    >;
  };
  const data = result as Board;
  const panels = data._meta["io.mcpview/snippet-panels"];
  assertEquals(calls, ["list", "get"]);
  assertEquals(readDeclaredViewUri(result), undefined);
  assertEquals(
    panels.map((p) => [p.name, p.title, readDeclaredViewUri(p.result)]),
    [
      ["get", "Invoice details", detail],
      ["list", "List", table],
    ],
  );
  assertEquals(panels[0].id !== panels[1].id, true);
  assertEquals(
    data.structuredContent.panels.map((p) => p.id),
    panels.map((p) => p.id),
  );
  assertEquals(data.structuredContent.value, { invoice: "get" });
  assertEquals(panels.map((p) => p.result._meta.private), [
    "viewer only",
    "viewer only",
  ]);
  assertEquals(
    JSON.stringify([data.structuredContent, data.content]).includes(
      "viewer only",
    ),
    false,
  );
});

Deno.test("records a panel program and replays fresh results without repeating an ERP call at selection", async () => {
  const catalog = createSnippetCatalog();
  const calls: unknown[] = [];
  const { handler } = createCodeModeExecute({
    tools: [get],
    mountableResourceUris: [detail],
    snippets: () => ({ scope: "workspace-user", catalog }),
    call: async (_name, args) => {
      calls.push(args);
      return { content: [], structuredContent: { ...args } };
    },
  });
  const program =
    'const x=await erp.call("get",{id:erp.params.id}); erp.panel(x);';
  const first = await handler({ code: program, params: { id: "INV-1" } });
  const ref = (first as { _meta: Record<string, string> })
    ._meta["io.casys/erpnext-execution-ref"];
  await handler({ save: { runId: ref, name: "invoice-board" } });
  const second = await handler({
    snippet: "invoice-board",
    params: { id: "INV-2" },
  });
  function panel(r: unknown) {
    return (r as {
      _meta: Record<
        string,
        { id: string; result: { structuredContent: { id: string } } }[]
      >;
    })._meta["io.mcpview/snippet-panels"][0];
  }
  assertEquals(calls, [{ id: "INV-1" }, { id: "INV-2" }]);
  assertEquals(panel(first).id === panel(second).id, false);
  assertEquals(panel(first).result.structuredContent.id, "INV-1");
  assertEquals(panel(second).result.structuredContent.id, "INV-2");
});

Deno.test("panel rejects computed lookalikes and results without a declared viewer", async () => {
  const { handler } = createCodeModeExecute({
    tools: [get],
    mountableResourceUris: [],
    call: async () => ({ content: [], structuredContent: { id: "TEST" } }),
  });
  await assertRejects(
    async () =>
      await handler({
        code: 'const a=await erp.call("get",{}); erp.panel({...a});',
      }),
    Error,
    "original result",
  );
  await assertRejects(
    async () =>
      await handler({
        code: 'const a=await erp.call("get",{}); erp.panel(a);',
      }),
    Error,
    "no compatible declared view",
  );
});

function invoiceBoard({
  listEnabled = true,
  detailEnabled = true,
  mountsDetail = true,
} = {}) {
  const listUri = "ui://mcp-erpnext/doclist-viewer";
  const detailUri = "ui://mcp-erpnext/invoice-viewer";
  const listTool = {
    ...list,
    name: "erpnext_doc_list",
    _meta: { ui: { resourceUri: listUri } },
  };
  const invoiceTool = {
    ...get,
    name: "erpnext_sales_invoice_get",
    _meta: { ui: { resourceUri: detailUri } },
  };
  return createCodeModeExecute({
    tools: [
      ...(listEnabled ? [listTool] : []),
      ...(detailEnabled ? [invoiceTool] : []),
    ],
    mountableResourceUris: [listUri, ...(mountsDetail ? [detailUri] : [])],
    call: async (name, args) => ({
      content: [],
      structuredContent: name === listTool.name
        ? {
          doctype: args.doctype,
          data: args.includeName ? [{ name: "SINV-2" }] : [{ customer: "A" }],
        }
        : { data: { doctype: "Sales Invoice", name: "SINV-1" } },
    }),
  });
}

Deno.test("execute advertises synchronization only for enabled operations and mountable views", () => {
  const description = invoiceBoard().tool.description;
  assert(description.includes("erp.sync"));
  assert(description.includes("erpnext_doc_list"));
  assert(!description.includes("erpnext_sales_invoice_list"));
  for (
    const options of [
      { listEnabled: false },
      { detailEnabled: false },
      { mountsDetail: false },
    ]
  ) {
    assert(!invoiceBoard(options).tool.description.includes("erp.sync"));
  }
});

const invoicePanels = `
  const rows = await erp.call("erpnext_doc_list", {doctype: "Sales Invoice", includeName: true});
  const invoice = await erp.call("erpnext_sales_invoice_get", {name: "SINV-1"});
  erp.panel(rows); erp.panel(invoice);
`;
const invoiceSync =
  'erp.sync({from: rows, event: "invoice.selected", to: invoice, action: "invoice.focus"});';

Deno.test("KPI periods require exact, ordered calendar dates", () => {
  assert(isKpiPeriod({ date_from: "2024-02-29", date_to: "2024-02-29" }));
  for (
    const value of [
      { date_from: "2025-02-29", date_to: "2025-03-01" },
      { date_from: "2025-01-02", date_to: "2025-01-01" },
      { date_from: "2025-04-01", date_to: "2025-04-31" },
      { date_from: "2025-1-01", date_to: "2025-01-31" },
      { date_from: "2025-01-01", date_to: "2025-01-31", company: "Other" },
      null,
    ]
  ) assert(!isKpiPeriod(value));
});

Deno.test("revenue periods dispatch only to the refreshable gross margin card, despite one shared viewer URI", async () => {
  const period = { date_from: "2025-10-01", date_to: "2025-10-31" };
  const tools = [REVENUE_KPI, GROSS_MARGIN_KPI, "other_kpi"].map((name) => ({
    ...list,
    name,
    _meta: { ui: { resourceUri: KPI_VIEW } },
  }));
  const options = {
    tools,
    mountableResourceUris: [KPI_VIEW],
    call: (name: string, args: Record<string, unknown>) =>
      Promise.resolve(
        name === GROSS_MARGIN_KPI
          ? {
            content: [],
            structuredContent: { value: 25, unit: "%" },
            _meta: {
              "io.casys/viewer": {
                _availableTools: args.denied ? [] : [GROSS_MARGIN_KPI],
                refreshRequest: { toolName: name, arguments: args },
              },
            },
          }
          : {
            content: [],
            structuredContent: {
              sparkline: [9600],
              sparklineLabels: ["Oct 25"],
              sparklinePeriods: args.legacy ? undefined : [period],
            },
          },
      ),
  };
  const { tool, handler } = createCodeModeExecute(options);
  assert(tool.description.includes(KPI_PERIOD_SELECTED));
  assert(
    !createCodeModeExecute({ ...options, tools: tools.slice(1) }).tool
      .description.includes(KPI_PERIOD_SELECTED),
  );
  assert(
    !createCodeModeExecute({ ...options, mountableResourceUris: [] }).tool
      .description.includes(KPI_PERIOD_SELECTED),
  );
  const program = `
    const revenue = await erp.call("${REVENUE_KPI}", {});
    const margin = await erp.call("${GROSS_MARGIN_KPI}", {...revenue.sparklinePeriods.at(-1)});
    erp.panel(revenue); erp.panel(margin);
    erp.sync({from: revenue, event: "${KPI_PERIOD_SELECTED}", to: margin, action: "${KPI_PERIOD_APPLY}"});
    return {shown: 2};
  `;
  const result = await handler({ code: program }) as {
    _meta: {
      "io.mcpview/snippet-panels": { id: string; events: unknown }[];
      "io.mcpview/snippet-sync": unknown;
    };
  };
  const [source, target] = result._meta["io.mcpview/snippet-panels"];
  assertEquals(source.events, { emits: [KPI_PERIOD_SELECTED] });
  assertEquals(target.events, { accepts: [KPI_PERIOD_APPLY] });
  assertEquals(result._meta["io.mcpview/snippet-sync"], [{
    from: source.id,
    event: KPI_PERIOD_SELECTED,
    to: target.id,
    action: KPI_PERIOD_APPLY,
  }]);
  for (
    const invalid of [
      program.replace(REVENUE_KPI, "other_kpi"),
      program.replace(`"${REVENUE_KPI}", {}`, `"${REVENUE_KPI}", {legacy:true}`)
        .replace("...revenue.sparklinePeriods.at(-1)", ""),
      program.replace("...revenue.sparklinePeriods.at(-1)", "denied:true"),
      program.replace(KPI_PERIOD_APPLY, "invoice.focus"),
    ]
  ) {
    await assertRejects(
      () => Promise.resolve(handler({ code: invalid })),
      Error,
      "Unsupported ERP synchronization",
    );
  }
});

Deno.test("explicit synchronization uses panel receipt IDs and exposes ports only to the App", async () => {
  const { handler, tool } = invoiceBoard();
  assert(tool.description?.includes(invoiceSync.slice(0, -1)));
  const result = await handler({
    code: invoicePanels + invoiceSync + invoiceSync +
      'erp.panel(rows,"Invoices"); return {invoice: invoice.data.name}',
  }) as {
    structuredContent: unknown;
    content: unknown;
    _meta: {
      "io.mcpview/snippet-panels": {
        id: string;
        title: string;
        events: unknown;
      }[];
      "io.mcpview/snippet-sync": unknown;
    };
  };
  const [source, target] = result._meta["io.mcpview/snippet-panels"];
  assertEquals(source.title, "Invoices");
  assertEquals(source.events, { emits: ["invoice.selected"] });
  assertEquals(target.events, { accepts: ["invoice.focus"] });
  assertEquals(result._meta["io.mcpview/snippet-sync"], [{
    from: source.id,
    event: "invoice.selected",
    to: target.id,
    action: "invoice.focus",
  }]);
  assert(
    !JSON.stringify([result.structuredContent, result.content]).includes(
      "invoice.selected",
    ),
  );

  const independent = await handler({ code: invoicePanels }) as typeof result;
  assert(!Object.hasOwn(independent._meta, "io.mcpview/snippet-sync"));
});

Deno.test("synchronization rejects forged, unselected and incompatible receipt endpoints", async () => {
  const { handler } = invoiceBoard();
  for (
    const [code, error] of [
      [
        invoicePanels + invoiceSync.replace("from: rows", "from: {...rows}"),
        "distinct original results",
      ],
      [
        invoicePanels.replace("erp.panel(invoice);", "") + invoiceSync,
        "distinct original results",
      ],
      [
        invoicePanels + invoiceSync.replace("to: invoice", "to: rows"),
        "distinct original results",
      ],
      [
        invoicePanels.replace("includeName: true", "includeName: false") +
        invoiceSync,
        "Unsupported ERP synchronization",
      ],
      [
        invoicePanels.replace(
          'doctype: "Sales Invoice"',
          'doctype: "Purchase Invoice"',
        ) +
        invoiceSync,
        "Unsupported ERP synchronization",
      ],
      [
        invoicePanels + invoiceSync.replace("invoice.focus", "*"),
        "Unsupported ERP synchronization",
      ],
    ]
  ) {
    await assertRejects(async () => await handler({ code }), Error, error);
  }
});

Deno.test("an invalid panel after an approved write preserves its completed status", async () => {
  let writes = 0;
  const write = {
    ...get,
    name: "submit",
    annotations: { readOnlyHint: false },
  };
  const { handler } = createCodeModeExecute({
    tools: [write],
    mountableResourceUris: [],
    call: async () => {
      throw new Error("Use the approved journal.");
    },
    run: (_ctx, run) =>
      run(async () => {
        writes++;
        return { content: [], structuredContent: { id: "INV-QA" } };
      }),
  });
  await assertRejects(
    async () =>
      await handler({
        code: 'const r=await erp.call("submit",{}); erp.panel(r);',
      }),
    SuspendCodeMode,
    "completed submit",
  );
  assertEquals(writes, 1);
});
