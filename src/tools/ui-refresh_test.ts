import {
  assertEquals,
  assertNotStrictEquals,
  assertStrictEquals,
} from "@std/assert";
import { SchemaValidator } from "@casys/mcp-server";
import { allTools } from "./mod.ts";
import {
  availableViewerToolNames,
  chartPointJumps,
  chartSeriesPointJumps,
  documentNavigationHints,
  filterNavJumpsByAvailableTools,
  FUNNEL_STAGE_JUMPS,
  funnelStageJumps,
  invoiceNavigationHints,
  KPI_JUMPS,
  monthRange,
  type NavJump,
  STOCK_HINTS,
  withViewerToolCapabilities,
} from "./ui-refresh.ts";
import {
  DOCTYPE_SEND_MESSAGE_HINTS,
  withUiRefreshRequest,
} from "./ui-refresh.ts";

// ── refreshRequest injection ─────────────────────────────────────────────────

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
    refreshRequest: {
      toolName: "erpnext_kanban_get_board",
      arguments: { doctype: "Task" },
    },
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/kanban-viewer" } },
  };

  assertEquals(withUiRefreshRequest(payload, "erpnext_task_list", {}), payload);
});

// ── _rowAction injection ─────────────────────────────────────────────────────

Deno.test("ui refresh - injects _rowAction for known doctype with dedicated get tool", () => {
  const result = withUiRefreshRequest(
    {
      doctype: "Customer",
      data: [{ name: "C-001" }],
      _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
    },
    "erpnext_customer_list",
    {},
  ) as Record<string, unknown>;

  assertEquals(result._rowAction, {
    toolName: "erpnext_customer_get",
    idField: "name",
    argName: "name",
  });
});

Deno.test("ui refresh - injects _rowAction fallback to erpnext_doc_get for unknown doctype", () => {
  const result = withUiRefreshRequest(
    {
      doctype: "Warehouse",
      data: [{ name: "WH-001" }],
      _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
    },
    "erpnext_warehouse_list",
    {},
  ) as Record<string, unknown>;

  assertEquals(result._rowAction, {
    toolName: "erpnext_doc_get",
    idField: "name",
    argName: "name",
    extraArgs: { doctype: "Warehouse" },
  });
});

Deno.test("ui refresh - does not inject _rowAction for non-doclist viewers", () => {
  const result = withUiRefreshRequest(
    {
      data: [],
      _meta: { ui: { resourceUri: "ui://mcp-erpnext/kanban-viewer" } },
    },
    "erpnext_kanban_get_board",
    {},
  ) as Record<string, unknown>;

  assertEquals(result._rowAction, undefined);
});

Deno.test("ui refresh - does not inject _rowAction when already present", () => {
  const existing = { toolName: "custom_tool", idField: "id", argName: "id" };
  const result = withUiRefreshRequest(
    {
      doctype: "Customer",
      data: [],
      _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
      _rowAction: existing,
    },
    "erpnext_customer_list",
    {},
  ) as Record<string, unknown>;

  assertEquals(result._rowAction, existing);
});

// ── _sendMessageHints injection ──────────────────────────────────────────────

Deno.test("ui refresh - injects _sendMessageHints for known doctype", () => {
  const result = withUiRefreshRequest(
    {
      doctype: "Customer",
      data: [],
      _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
    },
    "erpnext_customer_list",
    {},
  ) as Record<string, unknown>;

  const hints = result._sendMessageHints as Array<
    { label: string; message: string }
  >;
  assertEquals(hints.length, 2);
  assertEquals(hints[0].label, "Orders");
  assertEquals(hints[1].label, "Invoices");
});

Deno.test("ui refresh - no _sendMessageHints for doctype without hints", () => {
  const result = withUiRefreshRequest(
    {
      doctype: "Warehouse",
      data: [],
      _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
    },
    "erpnext_warehouse_list",
    {},
  ) as Record<string, unknown>;

  assertEquals(result._sendMessageHints, undefined);
});

// ── KPI drill-down injection ─────────────────────────────────────────────────

Deno.test("ui refresh - injects _drillDown and _trendDrillDown for KPI tools", () => {
  const result = withUiRefreshRequest(
    {
      label: "Revenue",
      value: 100000,
      _meta: { ui: { resourceUri: "ui://mcp-erpnext/kpi-viewer" } },
    },
    "erpnext_kpi_revenue",
    {},
  ) as Record<string, unknown>;

  assertEquals(result._drillDown, "Show all sales orders for this month");
  assertEquals(
    result._trendDrillDown,
    "Show revenue trend chart for the last 12 months",
  );
});

Deno.test("ui refresh - no KPI drill-down for non-KPI tools", () => {
  const result = withUiRefreshRequest(
    {
      doctype: "Customer",
      data: [],
      _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
    },
    "erpnext_customer_list",
    {},
  ) as Record<string, unknown>;

  assertEquals(result._drillDown, undefined);
  assertEquals(result._trendDrillDown, undefined);
});

Deno.test("ui refresh - preserves existing KPI _drillDown", () => {
  const result = withUiRefreshRequest(
    {
      label: "Revenue",
      value: 100000,
      _meta: { ui: { resourceUri: "ui://mcp-erpnext/kpi-viewer" } },
      _drillDown: "Custom drill-down",
    },
    "erpnext_kpi_revenue",
    {},
  ) as Record<string, unknown>;

  assertEquals(result._drillDown, "Custom drill-down");
});

Deno.test("ui refresh - gross margin fallback names the KPI's actual inputs", () => {
  const result = withUiRefreshRequest(
    {
      label: "Gross Margin",
      value: 32,
      _meta: { ui: { resourceUri: "ui://mcp-erpnext/kpi-viewer" } },
    },
    "erpnext_kpi_gross_margin",
    {},
  ) as Record<string, unknown>;

  assertEquals(
    result._drillDown,
    "Show the non-cancelled Sales Order Items and Bin valuation rates used to estimate this gross margin",
  );
});

// ── Chart drill-down injection ───────────────────────────────────────────────

Deno.test("ui refresh - injects _drillDown for chart tools", () => {
  const result = withUiRefreshRequest(
    {
      title: "Sales by Customer",
      labels: ["A", "B"],
      datasets: [],
      _meta: { ui: { resourceUri: "ui://mcp-erpnext/chart-viewer" } },
    },
    "erpnext_sales_chart",
    {},
  ) as Record<string, unknown>;

  assertEquals(result._drillDown, "Show sales invoices for {label}");
});

Deno.test("ui refresh - no chart _drillDown for unknown chart tool", () => {
  const result = withUiRefreshRequest(
    {
      title: "Custom Chart",
      labels: [],
      datasets: [],
      _meta: { ui: { resourceUri: "ui://mcp-erpnext/chart-viewer" } },
    },
    "custom_chart_tool",
    {},
  ) as Record<string, unknown>;

  assertEquals(result._drillDown, undefined);
});

// ── All doctypes with dedicated get tools ────────────────────────────────────

Deno.test("ui refresh - all major doctypes get correct _rowAction", () => {
  const cases: [string, string][] = [
    ["Sales Order", "erpnext_sales_order_get"],
    ["Sales Invoice", "erpnext_sales_invoice_get"],
    ["Item", "erpnext_item_get"],
    ["Employee", "erpnext_employee_get"],
    ["Project", "erpnext_project_get"],
    ["Lead", "erpnext_lead_get"],
    ["Asset", "erpnext_asset_get"],
  ];

  for (const [doctype, expectedTool] of cases) {
    const result = withUiRefreshRequest(
      {
        doctype,
        data: [{ name: "test" }],
        _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
      },
      "erpnext_doc_list",
      { doctype },
    ) as Record<string, unknown>;

    const rowAction = result._rowAction as { toolName: string };
    assertEquals(
      rowAction.toolName,
      expectedTool,
      `${doctype} should use ${expectedTool}`,
    );
  }
});

// ── contrat hints ↔ schémas d'outils ──────────────────────────────────────────

Deno.test("ui refresh - every navigation hint targets a real tool with valid args", () => {
  const byName = new Map(allTools.map((tool) => [tool.name, tool]));
  const allHints = {
    ...DOCTYPE_SEND_MESSAGE_HINTS,
    "document:Sales Order": documentNavigationHints("Sales Order", {
      customer: "CUST-1",
    }),
    "document:Sales Invoice": documentNavigationHints("Sales Invoice", {
      customer: "CUST-1",
    }),
    "document:Purchase Invoice": documentNavigationHints(
      "Purchase Invoice",
      { supplier: "SUPP-1" },
    ),
    "document:Quotation/Customer": documentNavigationHints("Quotation", {
      quotation_to: "Customer",
      party_name: "CUST-1",
    }),
    "document:Quotation/Lead": documentNavigationHints("Quotation", {
      quotation_to: "Lead",
      party_name: "LEAD-1",
    }),
    "invoice:Sales Order": invoiceNavigationHints("Sales Order", {
      customer: "CUST-1",
    }),
    "invoice:Sales Invoice": invoiceNavigationHints("Sales Invoice", {
      customer: "CUST-1",
    }),
    "invoice:Purchase Invoice": invoiceNavigationHints("Purchase Invoice", {
      supplier: "SUPP-1",
    }),
    "invoice:Quotation": invoiceNavigationHints("Quotation", {
      quotation_to: "Lead",
      party_name: "LEAD-1",
    }),
    "stock:Bin": STOCK_HINTS,
  };
  for (const [doctype, hints] of Object.entries(allHints)) {
    for (const hint of hints) {
      assertEquals(typeof hint.key, "string", `${doctype}/${hint.label}: key`);
      if (!hint.tool) continue;
      const tool = byName.get(hint.tool);
      if (!tool) {
        throw new Error(`${doctype}/${hint.label}: unknown tool ${hint.tool}`);
      }
      if (tool.annotations?.readOnlyHint !== true) {
        throw new Error(
          `${doctype}/${hint.label}: ${hint.tool} is not read-only — a jump must never write`,
        );
      }
      const schema = tool.inputSchema as {
        properties?: Record<string, unknown>;
        required?: string[];
      };
      const props = Object.keys(schema.properties ?? {});
      const args = hint.args ?? {};
      for (const key of Object.keys(args)) {
        if (!props.includes(key)) {
          throw new Error(
            `${doctype}/${hint.label}: ${hint.tool} has no arg ${key}`,
          );
        }
      }
      for (const key of schema.required ?? []) {
        if (!(key in args)) {
          throw new Error(
            `${doctype}/${hint.label}: ${hint.tool} requires ${key}`,
          );
        }
      }
      // Règle du handler, pas du schéma : party_name sans opportunity_from est refusé.
      if (hint.tool === "erpnext_opportunity_list" && "party_name" in args) {
        assertEquals(args.opportunity_from, "Lead", `${doctype}/${hint.label}`);
      }
    }
  }
});

/** Chaque saut vise un outil réel, avec des arguments que son schéma accepte. */
function assertJumpMatchesTool(jump: NavJump, where: string) {
  const tool = allTools.find((t) => t.name === jump.tool);
  if (!tool) throw new Error(`${where}: unknown tool ${jump.tool}`);
  if (tool.annotations?.readOnlyHint !== true) {
    throw new Error(
      `${where}: ${jump.tool} is not read-only — a jump must never write`,
    );
  }
  const schema = tool.inputSchema as {
    properties?: Record<string, { enum?: unknown[] }>;
    required?: string[];
  };
  const props = schema.properties ?? {};
  for (const [key, value] of Object.entries(jump.args)) {
    if (!(key in props)) {
      throw new Error(`${where}: ${jump.tool} has no arg ${key}`);
    }
    const allowed = props[key].enum;
    if (allowed && !allowed.includes(value)) {
      throw new Error(`${where}: ${jump.tool}.${key}=${value} not in enum`);
    }
  }
  for (const key of schema.required ?? []) {
    if (!(key in jump.args)) {
      throw new Error(`${where}: ${jump.tool} requires ${key}`);
    }
  }
  const validator = new SchemaValidator();
  validator.addSchema(
    tool.name,
    tool.inputSchema as Record<string, unknown>,
  );
  const validation = validator.validate(tool.name, structuredClone(jump.args));
  if (!validation.valid) {
    throw new Error(
      `${where}: ${jump.tool} rejects its jump arguments: ${
        JSON.stringify(validation.errors)
      }`,
    );
  }
  assertEquals(["list", "record", "chart"].includes(jump.kind), true, where);
}

Deno.test("ui refresh - every KPI and funnel jump targets a real tool with valid args", () => {
  const range = monthRange(new Date(2026, 7, 22, 10));
  for (const [tool, jumps] of Object.entries(KPI_JUMPS)) {
    const { number, trend } = jumps(range);
    if (number) assertJumpMatchesTool(number, `${tool}/number`);
    assertJumpMatchesTool(trend, `${tool}/trend`);
  }
  for (const [stage, jump] of Object.entries(FUNNEL_STAGE_JUMPS)) {
    assertJumpMatchesTool(jump, `funnel/${stage}`);
  }
});

Deno.test("ui refresh - monthRange covers the civil month of `now`, local clock", () => {
  assertEquals(monthRange(new Date(2026, 1, 10, 12)), {
    from: "2026-02-01",
    to: "2026-02-28",
    today: "2026-02-10",
  });
  assertEquals(monthRange(new Date(2026, 7, 31, 23, 59)), {
    from: "2026-08-01",
    to: "2026-08-31",
    today: "2026-08-31",
  });
});

Deno.test("ui refresh - injects _jumps for KPI tools with the month of `now`", () => {
  const now = new Date(2026, 7, 22, 10);
  const result = withUiRefreshRequest(
    { value: 1, _meta: { ui: { resourceUri: "ui://mcp-erpnext/kpi-viewer" } } },
    "erpnext_kpi_revenue",
    {},
    now,
  ) as { _jumps?: { number: NavJump; trend: NavJump } };
  assertEquals(result._jumps?.number.tool, "erpnext_doc_list");
  assertEquals(result._jumps?.number.args.filters, [
    ["transaction_date", ">=", "2026-08-01"],
    ["transaction_date", "<=", "2026-08-31"],
    ["docstatus", "<", 2],
  ]);
  assertEquals(result._jumps?.trend.kind, "chart");
});

Deno.test("ui refresh - injects _stageJumps for the funnel and nothing for charts", () => {
  const funnel = withUiRefreshRequest(
    {
      stages: [],
      _meta: { ui: { resourceUri: "ui://mcp-erpnext/funnel-viewer" } },
    },
    "erpnext_sales_funnel",
    {},
  ) as { _stageJumps?: Record<string, NavJump> };
  assertEquals(Object.keys(funnel._stageJumps ?? {}), [
    "Leads",
    "Opportunities",
    "Quotations",
    "Orders",
  ]);
  const chart = withUiRefreshRequest(
    {
      labels: [],
      _meta: { ui: { resourceUri: "ui://mcp-erpnext/chart-viewer" } },
    },
    "erpnext_revenue_trend",
    {},
  ) as { _jumps?: unknown; _stageJumps?: unknown };
  assertEquals(chart._jumps, undefined);
  assertEquals(chart._stageJumps, undefined);
});

Deno.test("ui refresh - funnel jumps preserve the calculation's period start", () => {
  const now = new Date(2026, 7, 22, 10);
  const periods = [
    ["this_month", "2026-08-01"],
    ["this_quarter", "2026-07-01"],
    ["this_year", "2026-01-01"],
  ] as const;

  for (const [period, since] of periods) {
    const jumps = funnelStageJumps({ period }, now);
    for (const [stage, jump] of Object.entries(jumps)) {
      assertJumpMatchesTool(jump, `funnel/${period}/${stage}`);
      assertEquals(jump.tool, "erpnext_doc_list");
      assertEquals(jump.args.filters, [
        [
          stage === "Leads" ? "creation" : "transaction_date",
          ">=",
          since,
        ],
        ...(["Quotations", "Orders"].includes(stage)
          ? [["docstatus", "!=", 2]]
          : []),
      ]);
    }
  }
});

Deno.test("ui refresh - funnel all-time jumps keep no date bound and exclude cancellations", () => {
  const now = new Date(2026, 7, 22, 10);
  const jumps = funnelStageJumps({ period: "all" }, now);
  assertStrictEquals(jumps, FUNNEL_STAGE_JUMPS);
  assertStrictEquals(funnelStageJumps({}, now), FUNNEL_STAGE_JUMPS);
  for (const [stage, jump] of Object.entries(jumps)) {
    assertJumpMatchesTool(jump, `funnel/all/${stage}`);
  }
  assertEquals(jumps.Leads.args.filters, undefined);
  assertEquals(jumps.Opportunities.args.filters, undefined);
  assertEquals(jumps.Quotations.args.filters, [["docstatus", "!=", 2]]);
  assertEquals(jumps.Orders.args.filters, [["docstatus", "!=", 2]]);
});

Deno.test("ui refresh - injects period-scoped funnel jumps from original args", () => {
  const funnel = withUiRefreshRequest(
    {
      stages: [],
      _meta: { ui: { resourceUri: "ui://mcp-erpnext/funnel-viewer" } },
    },
    "erpnext_sales_funnel",
    { period: "this_quarter" },
    new Date(2026, 7, 22, 10),
  ) as { _stageJumps?: Record<string, NavJump> };

  assertEquals(funnel._stageJumps?.Leads.args.filters, [
    ["creation", ">=", "2026-07-01"],
  ]);
  assertEquals(funnel._stageJumps?.Orders.args.filters, [
    ["transaction_date", ">=", "2026-07-01"],
    ["docstatus", "!=", 2],
  ]);
  assertEquals(funnel._stageJumps?.Quotations.args.filters, [
    ["transaction_date", ">=", "2026-07-01"],
    ["docstatus", "!=", 2],
  ]);
});

Deno.test("ui refresh - filters typed jumps by available host tools without mutation", () => {
  const number = KPI_JUMPS["erpnext_kpi_revenue"](
    monthRange(new Date(2026, 7, 22, 10)),
  ).number!;
  const trend = KPI_JUMPS["erpnext_kpi_revenue"](
    monthRange(new Date(2026, 7, 22, 10)),
  ).trend;
  const result = {
    _jumps: { number, trend },
    _stageJumps: {
      Leads: FUNNEL_STAGE_JUMPS.Leads,
      Opportunities: FUNNEL_STAGE_JUMPS.Opportunities,
    },
    _pointJumps: {
      "Aug 26": { ...number, tool: "missing_chart_tool" },
    },
  };

  const filtered = filterNavJumpsByAvailableTools(
    result,
    new Set(["erpnext_doc_list", "erpnext_lead_list"]),
  );

  assertEquals(filtered._jumps, { number });
  assertEquals(filtered._stageJumps, {
    Leads: FUNNEL_STAGE_JUMPS.Leads,
  });
  assertEquals(filtered._pointJumps, undefined);
  assertEquals(result._jumps, { number, trend });
  assertEquals(Object.keys(result._stageJumps), ["Leads", "Opportunities"]);
  assertEquals(Object.keys(result._pointJumps), ["Aug 26"]);
});

Deno.test("ui refresh - filters nested series jumps recursively without mutation", () => {
  const income: NavJump = {
    label: "Aug 26 · Income",
    tool: "erpnext_doc_list",
    args: { doctype: "Sales Order" },
    kind: "list",
  };
  const expenses: NavJump = {
    label: "Aug 26 · Expenses",
    tool: "erpnext_purchase_order_list",
    args: {},
    kind: "list",
  };
  const result = {
    _seriesPointJumps: {
      "Aug 26": { Income: income, Expenses: expenses },
      "Jul 26": { Expenses: expenses },
    },
  };

  assertEquals(
    availableViewerToolNames(
      result,
      new Set([
        "erpnext_doc_list",
        "erpnext_purchase_order_list",
        "unrelated_tool",
      ]),
    ),
    ["erpnext_doc_list", "erpnext_purchase_order_list"],
  );

  const filtered = filterNavJumpsByAvailableTools(
    result,
    new Set(["erpnext_doc_list"]),
  );
  assertEquals(filtered._seriesPointJumps, {
    "Aug 26": { Income: income },
  });
  assertEquals(filtered._availableTools, ["erpnext_doc_list"]);
  assertEquals(result._seriesPointJumps, {
    "Aug 26": { Income: income, Expenses: expenses },
    "Jul 26": { Expenses: expenses },
  });
});

Deno.test("ui refresh - omitting available tools preserves typed jumps", () => {
  const result = { _stageJumps: FUNNEL_STAGE_JUMPS };
  assertStrictEquals(filterNavJumpsByAvailableTools(result), result);
});

Deno.test("ui refresh - withUiRefreshRequest omits jumps unavailable in the host", () => {
  const result = withUiRefreshRequest(
    {
      value: 1,
      _meta: { ui: { resourceUri: "ui://mcp-erpnext/kpi-viewer" } },
    },
    "erpnext_kpi_revenue",
    {},
    new Date(2026, 7, 22, 10),
    new Set(["erpnext_doc_list"]),
  ) as { _jumps?: { number?: NavJump; trend?: NavJump } };

  assertEquals(result._jumps?.number?.tool, "erpnext_doc_list");
  assertEquals(result._jumps?.trend, undefined);
});

Deno.test("ui refresh - unavailable row actions fall back safely and hints keep their message", () => {
  const result = filterNavJumpsByAvailableTools(
    {
      doctype: "Sales Order",
      data: [{ name: "SO-001" }],
      _rowAction: {
        toolName: "erpnext_sales_order_get",
        idField: "name",
        argName: "name",
      },
      _sendMessageHints: [{
        key: "invoice",
        label: "Invoice",
        message: "Show invoices for {id}",
        tool: "erpnext_sales_invoice_list",
        args: { sales_order: "{id}" },
        kind: "list",
      }],
    },
    new Set(["erpnext_doc_get"]),
  );

  assertEquals(result._rowAction, {
    toolName: "erpnext_doc_get",
    idField: "name",
    argName: "name",
    extraArgs: { doctype: "Sales Order" },
  });
  assertEquals(result._sendMessageHints, [{
    key: "invoice",
    label: "Invoice",
    message: "Show invoices for {id}",
  }]);
});

Deno.test("ui refresh - viewer capabilities expose only referenced registered tools", () => {
  const invoice = {
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/invoice-viewer" } },
    data: { doctype: "Sales Invoice", name: "SINV-1" },
    refreshRequest: {
      toolName: "erpnext_sales_invoice_get",
      arguments: { name: "SINV-1" },
    },
  };
  assertEquals(
    availableViewerToolNames(
      invoice,
      new Set([
        "erpnext_sales_invoice_get",
        "erpnext_sales_invoice_submit",
        "erpnext_doc_cancel",
        "unrelated_tool",
      ]),
    ),
    [
      "erpnext_doc_cancel",
      "erpnext_sales_invoice_get",
      "erpnext_sales_invoice_submit",
    ],
  );
});

Deno.test("ui refresh - doc viewer exposes only registered document actions", () => {
  const result = withUiRefreshRequest(
    {
      _meta: { ui: { resourceUri: "ui://mcp-erpnext/doc-viewer" } },
      data: { doctype: "Task", name: "TASK-1" },
    },
    "erpnext_task_get",
    { name: "TASK-1" },
    new Date(2026, 7, 24),
    new Set([
      "erpnext_task_get",
      "erpnext_file_list",
      "erpnext_file_upload",
      "erpnext_file_download",
      "erpnext_doc_submit",
      "unrelated_tool",
    ]),
  ) as {
    _availableTools?: string[];
    _sendMessageHints?: { key?: string }[];
  };

  assertEquals(result._availableTools, [
    "erpnext_file_download",
    "erpnext_file_list",
    "erpnext_file_upload",
    "erpnext_task_get",
  ]);
  assertEquals(result._sendMessageHints?.map((hint) => hint.key), [
    "timesheets",
  ]);
});

Deno.test("ui refresh - Purchase Invoice doc viewer exposes exact line navigation capabilities", () => {
  type HintResult = {
    _availableTools?: string[];
    _sendMessageHints?: { key?: string; tool?: string; message: string }[];
  };
  const payload = {
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/doc-viewer" } },
    data: {
      doctype: "Purchase Invoice",
      name: "PINV-1",
      supplier: "SUPP-1",
    },
  };
  const tools = [
    "erpnext_doc_list",
    "erpnext_item_get",
    "erpnext_purchase_invoice_get",
    "erpnext_stock_balance",
    "erpnext_supplier_get",
  ];
  const result = withUiRefreshRequest(
    payload,
    "erpnext_purchase_invoice_get",
    { name: "PINV-1" },
    new Date(2026, 7, 28),
    new Set(tools),
  ) as HintResult;

  assertEquals(result._sendMessageHints?.map((hint) => hint.key), [
    "payments",
    "supplier",
    "item",
    "stock",
  ]);
  assertEquals(result._sendMessageHints?.map((hint) => hint.tool), [
    "erpnext_doc_list",
    "erpnext_supplier_get",
    "erpnext_item_get",
    "erpnext_stock_balance",
  ]);
  assertEquals(result._availableTools, tools);

  const withoutStock = withUiRefreshRequest(
    payload,
    "erpnext_purchase_invoice_get",
    { name: "PINV-1" },
    new Date(2026, 7, 28),
    new Set(tools.filter((tool) => tool !== "erpnext_stock_balance")),
  ) as HintResult;
  assertEquals(withoutStock._sendMessageHints?.map((hint) => hint.tool), [
    "erpnext_doc_list",
    "erpnext_supplier_get",
    "erpnext_item_get",
    undefined,
  ]);
  assertEquals(withoutStock._availableTools, [
    "erpnext_doc_list",
    "erpnext_item_get",
    "erpnext_purchase_invoice_get",
    "erpnext_supplier_get",
  ]);
});

Deno.test("ui refresh - mutation capabilities are bounded by the explicit doctype", () => {
  const available = new Set([
    "erpnext_doc_submit",
    "erpnext_doc_cancel",
    "erpnext_sales_order_submit",
    "erpnext_sales_order_cancel",
    "erpnext_sales_invoice_submit",
  ]);
  const invoiceUri = {
    ui: { resourceUri: "ui://mcp-erpnext/invoice-viewer" },
  };
  const doclistUri = {
    ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" },
  };
  const docUri = {
    ui: { resourceUri: "ui://mcp-erpnext/doc-viewer" },
  };

  assertEquals(
    availableViewerToolNames({
      _meta: invoiceUri,
      data: { doctype: "Sales Order", name: "SO-1" },
    }, available),
    [
      "erpnext_doc_cancel",
      "erpnext_doc_submit",
      "erpnext_sales_order_cancel",
      "erpnext_sales_order_submit",
    ],
  );
  assertEquals(
    availableViewerToolNames({
      _meta: invoiceUri,
      data: { doctype: "Sales Invoice", name: "SINV-1" },
    }, available),
    [
      "erpnext_doc_cancel",
      "erpnext_doc_submit",
      "erpnext_sales_invoice_submit",
    ],
  );
  assertEquals(
    availableViewerToolNames({
      _meta: doclistUri,
      doctype: "Customer",
      data: [],
    }, available),
    [],
  );
  assertEquals(
    availableViewerToolNames({
      _meta: doclistUri,
      doctype: "Item",
      data: [],
    }, available),
    [],
  );
  assertEquals(
    availableViewerToolNames({
      _meta: doclistUri,
      doctype: "Quotation",
      data: [],
    }, available),
    ["erpnext_doc_cancel", "erpnext_doc_submit"],
  );
  assertEquals(
    availableViewerToolNames({
      _meta: docUri,
      data: { doctype: "BOM", name: "BOM-1" },
    }, available),
    ["erpnext_doc_cancel", "erpnext_doc_submit"],
  );
});

Deno.test("ui refresh - mutating viewer payload cannot forge capabilities", () => {
  const filtered = withViewerToolCapabilities({
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/invoice-viewer" } },
    data: { name: "SINV-1", doctype: "Sales Invoice" },
    _availableTools: ["erpnext_doc_cancel", "forged_tool"],
  }, new Set(["erpnext_sales_invoice_submit"])) as Record<string, unknown>;

  assertEquals(filtered._availableTools, ["erpnext_sales_invoice_submit"]);
});

Deno.test("ui refresh - every commercial document keeps its canonical related hints", () => {
  type HintResult = {
    _sendMessageHints?: {
      key: string;
      label: string;
      message: string;
      kind?: string;
      tool?: string;
      args?: Record<string, unknown>;
    }[];
  };
  const viewer = (
    resourceUri: "invoice-viewer" | "doc-viewer",
    data: Record<string, unknown>,
  ) =>
    withUiRefreshRequest(
      {
        data,
        _meta: { ui: { resourceUri: `ui://mcp-erpnext/${resourceUri}` } },
      },
      "erpnext_doc_get",
      {},
    ) as HintResult;

  const salesOrder = viewer("invoice-viewer", {
    doctype: "Sales Order",
    name: "SO-1",
    customer: "CUST-1",
  });
  assertEquals(salesOrder._sendMessageHints?.map((hint) => hint.key), [
    "customer",
    "invoices",
    "deliveries",
    "item",
    "stock",
  ]);
  assertEquals(salesOrder._sendMessageHints?.[0], {
    key: "customer",
    label: "Customer",
    message: "Show customer CUST-1",
    tool: "erpnext_customer_get",
    args: { name: "CUST-1" },
    kind: "record",
  });
  assertEquals(salesOrder._sendMessageHints?.[1].label, "Invoices");
  assertEquals(
    salesOrder._sendMessageHints?.[1].args?.doctype,
    "Sales Invoice",
  );
  assertEquals(salesOrder._sendMessageHints?.[1].args?.filters, [[
    "Sales Invoice Item",
    "sales_order",
    "=",
    "{id}",
  ]]);
  assertEquals(salesOrder._sendMessageHints?.[2].label, "Delivery notes");
  assertEquals(
    salesOrder._sendMessageHints?.[2].args?.doctype,
    "Delivery Note",
  );
  assertEquals(salesOrder._sendMessageHints?.[2].args?.filters, [[
    "Delivery Note Item",
    "against_sales_order",
    "=",
    "{id}",
  ]]);

  const salesInvoice = viewer("invoice-viewer", {
    doctype: "Sales Invoice",
    name: "SINV-1",
    customer: "CUST-1",
  });
  assertEquals(salesInvoice._sendMessageHints?.map((hint) => hint.key), [
    "payments",
    "customer",
    "item",
    "stock",
  ]);
  assertEquals(
    salesInvoice._sendMessageHints?.[0].args?.doctype,
    "Payment Entry",
  );
  assertEquals(salesInvoice._sendMessageHints?.[1].label, "Customer");
  assertEquals(salesInvoice._sendMessageHints?.[1].args, { name: "CUST-1" });

  const purchaseInvoice = viewer("doc-viewer", {
    doctype: "Purchase Invoice",
    name: "PINV-1",
    supplier: "SUPP-1",
  });
  assertEquals(purchaseInvoice._sendMessageHints?.map((hint) => hint.key), [
    "payments",
    "supplier",
    "item",
    "stock",
  ]);
  assertEquals(
    purchaseInvoice._sendMessageHints?.[0].args?.doctype,
    "Payment Entry",
  );
  assertEquals(purchaseInvoice._sendMessageHints?.[1], {
    key: "supplier",
    label: "Supplier",
    message: "Show supplier SUPP-1",
    tool: "erpnext_supplier_get",
    args: { name: "SUPP-1" },
    kind: "record",
  });

  for (
    const [quotationTo, partyName, partyKey, partyTool] of [
      ["Customer", "CUST-2", "customer", "erpnext_customer_get"],
      ["Lead", "LEAD-2", "lead", "erpnext_lead_get"],
    ] as const
  ) {
    const quotation = viewer("invoice-viewer", {
      doctype: "Quotation",
      name: "QTN-1",
      quotation_to: quotationTo,
      party_name: partyName,
    });
    assertEquals(quotation._sendMessageHints?.map((hint) => hint.key), [
      partyKey,
      "item",
      "stock",
    ]);
    assertEquals(quotation._sendMessageHints?.[0].tool, partyTool);
    assertEquals(quotation._sendMessageHints?.[0].args, { name: partyName });
    assertEquals(quotation._sendMessageHints?.[0].label, quotationTo);
  }
});

Deno.test("ui refresh - invoice hints compose canonical document hints plus item actions", () => {
  const document = { customer: "CUST-1" };
  const related = documentNavigationHints("Sales Order", document);
  const invoice = invoiceNavigationHints("Sales Order", document);
  assertEquals(invoice.slice(0, related.length), related);
  assertEquals(invoice.slice(related.length).map((hint) => hint.key), [
    "item",
    "stock",
  ]);
  assertEquals(new Set(invoice.map((hint) => hint.key)).size, invoice.length);
});

Deno.test("ui refresh - malformed Quotation dynamic links fail closed", () => {
  assertEquals(
    documentNavigationHints("Quotation", {
      quotation_to: "Supplier",
      party_name: "SUPP-1",
    }),
    [],
  );
  assertEquals(
    documentNavigationHints("Quotation", {
      quotation_to: "Lead",
      party_name: " ",
    }),
    [],
  );
});

Deno.test("ui refresh - stock and kanban results get typed hints", () => {
  const stock = withUiRefreshRequest(
    {
      doctype: "Bin",
      count: 0,
      data: [],
      _meta: { ui: { resourceUri: "ui://mcp-erpnext/stock-viewer" } },
    },
    "erpnext_stock_balance",
    {},
  ) as { _sendMessageHints?: { key: string; kind?: string }[] };
  assertEquals(stock._sendMessageHints?.map((h) => h.kind), [
    "record",
    "list",
    "chart",
  ]);
  const kanban = withUiRefreshRequest(
    {
      doctype: "Task",
      columns: [],
      _meta: { ui: { resourceUri: "ui://mcp-erpnext/kanban-viewer" } },
    },
    "erpnext_kanban_get_board",
    {},
  ) as { _sendMessageHints?: { key: string }[] };
  assertEquals(kanban._sendMessageHints?.map((h) => h.key), ["timesheets"]);
});

Deno.test("ui refresh - the outstanding and overdue jumps filter like the KPIs do", () => {
  const r = monthRange(new Date(2026, 7, 22, 10));
  const outstanding = KPI_JUMPS["erpnext_kpi_outstanding"](r).number!;
  assertEquals(outstanding.args.filters, [
    ["outstanding_amount", ">", 0],
    ["docstatus", "=", 1],
  ]);
  const overdue = KPI_JUMPS["erpnext_kpi_overdue"](r).number!;
  assertEquals(overdue.args.filters, [
    ["due_date", "<", "2026-08-22"],
    ["outstanding_amount", ">", 0],
    ["docstatus", "=", 1],
  ]);
  // chaque saut porte une clé de libellé traduisible
  for (const [tool, jumps] of Object.entries(KPI_JUMPS)) {
    const { number, trend } = jumps(r);
    if (number) assertEquals(typeof number.key, "string", `${tool}/number`);
    assertEquals(typeof trend.key, "string", `${tool}/trend`);
  }
  assertEquals(
    KPI_JUMPS["erpnext_kpi_gross_margin"](r).number,
    undefined,
    "gross-margin number has no semantically equivalent typed target",
  );
  for (const [stage, jump] of Object.entries(FUNNEL_STAGE_JUMPS)) {
    assertEquals(typeof jump.key, "string", `funnel/${stage}`);
  }
});

Deno.test("ui refresh - chart point jumps: every chart tool, every label, a real read-only tool", () => {
  const now = new Date(2026, 7, 22, 10);
  const cases: [string, Record<string, unknown>, string[]][] = [
    ["erpnext_revenue_trend", { months: 3 }, ["Jun 26", "Jul 26", "Aug 26"]],
    ["erpnext_sales_chart", {}, ["Acme Corp"]],
    ["erpnext_sales_chart", { group_by: "item" }, ["SKU-001"]],
    ["erpnext_sales_chart", { group_by: "status" }, ["Paid"]],
    ["erpnext_order_breakdown", {}, ["Acme Corp"]],
    ["erpnext_revenue_vs_orders", {}, ["Acme Corp"]],
    ["erpnext_gross_profit", {}, ["SKU-001"]],
    ["erpnext_gross_profit", { group_by: "customer" }, ["Acme Corp"]],
    ["erpnext_stock_chart", {}, ["SKU-001"]],
  ];
  for (const [tool, args, labels] of cases) {
    const jumps = chartPointJumps(tool, args, labels, now);
    if (!jumps) throw new Error(`${tool}: no jumps`);
    for (const label of labels) {
      if (!jumps[label]) throw new Error(`${tool}: no jump for ${label}`);
      assertJumpMatchesTool(jumps[label], `${tool}/${label}`);
      assertEquals(jumps[label].label, label);
    }
  }
  // pas de saut pour les formes sans pièce derrière
  assertEquals(
    chartPointJumps("erpnext_product_radar", {}, ["A"], now),
    undefined,
  );
  assertEquals(
    chartPointJumps("erpnext_profit_loss", {}, ["Aug 26"], now),
    undefined,
  );
  assertEquals(
    chartPointJumps("erpnext_ar_aging", {}, ["Acme Corp"], now),
    undefined,
  );
  // un libellé de mois que le graphique n'a pas reçu n'est pas inventé
  assertEquals(
    Object.keys(
      chartPointJumps("erpnext_revenue_trend", { months: 2 }, ["Aug 26"], now)!,
    ),
    ["Aug 26"],
  );
});

Deno.test("ui refresh - a month point opens exactly that civil month", () => {
  const now = new Date(2026, 7, 22, 10);
  const jumps = chartPointJumps("erpnext_revenue_trend", { months: 2 }, [
    "Jul 26",
    "Aug 26",
  ], now)!;
  assertEquals(jumps["Jul 26"].args.filters, [
    ["transaction_date", ">=", "2026-07-01"],
    ["transaction_date", "<=", "2026-07-31"],
    ["docstatus", "<", 2],
  ]);
});

Deno.test("ui refresh - injects _pointJumps on chart results only", () => {
  const now = new Date(2026, 7, 22, 10);
  const chart = withUiRefreshRequest(
    {
      type: "bar",
      labels: ["Acme Corp"],
      datasets: [],
      _meta: { ui: { resourceUri: "ui://mcp-erpnext/chart-viewer" } },
    },
    "erpnext_order_breakdown",
    {},
    now,
  ) as { _pointJumps?: Record<string, { tool: string }> };
  assertEquals(chart._pointJumps?.["Acme Corp"].tool, "erpnext_doc_list");
  const kpi = withUiRefreshRequest(
    {
      value: 1,
      labels: ["x"],
      _meta: { ui: { resourceUri: "ui://mcp-erpnext/kpi-viewer" } },
    },
    "erpnext_kpi_revenue",
    {},
    now,
  ) as { _pointJumps?: unknown };
  assertEquals(kpi._pointJumps, undefined);
});

Deno.test("ui refresh - P&L injects exact series jumps and AR stays context-only", () => {
  const now = new Date(2026, 7, 22, 10);
  const profitLoss = withUiRefreshRequest(
    {
      type: "composed",
      labels: ["Aug 26"],
      datasets: [],
      _meta: { ui: { resourceUri: "ui://mcp-erpnext/chart-viewer" } },
    },
    "erpnext_profit_loss",
    { months: 1 },
    now,
  ) as {
    _drillDown?: string;
    _pointJumps?: unknown;
    _seriesPointJumps?: Record<string, Record<string, NavJump>>;
  };
  assertEquals(
    profitLoss._drillDown,
    "Show submitted sales and purchase orders for month {label}",
  );
  assertEquals(profitLoss._pointJumps, undefined);
  assertEquals(
    Object.keys(profitLoss._seriesPointJumps?.["Aug 26"] ?? {}),
    ["Income", "Expenses"],
  );

  const aging = withUiRefreshRequest(
    {
      type: "stacked-bar",
      labels: ["Acme Corp"],
      datasets: [],
      _meta: { ui: { resourceUri: "ui://mcp-erpnext/chart-viewer" } },
    },
    "erpnext_ar_aging",
    {},
    now,
  ) as {
    _drillDown?: string;
    _pointJumps?: unknown;
    _seriesPointJumps?: unknown;
  };
  assertEquals(
    aging._drillDown,
    "Show outstanding sales invoices for customer {label}",
  );
  assertEquals(aging._pointJumps, undefined);
  assertEquals(aging._seriesPointJumps, undefined);
});

Deno.test("ui refresh - chart point jumps follow the handlers' labels and states", () => {
  const now = new Date(2026, 7, 22, 10);
  const item = chartPointJumps(
    "erpnext_sales_chart",
    { group_by: "item" },
    ["Laptop Pro 14"],
    now,
  )!;
  assertEquals(item["Laptop Pro 14"].args.filters, [
    ["Sales Invoice Item", "item_name", "=", "Laptop Pro 14"],
    ["docstatus", "=", 1],
  ]);
  const status = chartPointJumps(
    "erpnext_sales_chart",
    { group_by: "status" },
    ["Draft"],
    now,
  )!;
  assertEquals(status["Draft"].args.filters, [
    ["status", "=", "Draft"],
    ["docstatus", "!=", 2],
  ]);
  const pl = chartSeriesPointJumps(
    "erpnext_profit_loss",
    { months: 1 },
    ["Aug 26"],
    now,
  )!;
  assertEquals(pl["Aug 26"].Income.args.doctype, "Sales Order");
  assertEquals(pl["Aug 26"].Expenses.args.doctype, "Purchase Order");
  assertEquals(pl["Aug 26"].Income.args.filters, [
    ["transaction_date", ">=", "2026-08-01"],
    ["transaction_date", "<=", "2026-08-31"],
    ["docstatus", "=", 1],
  ]);
  assertEquals(
    pl["Aug 26"].Expenses.args.filters,
    pl["Aug 26"].Income.args.filters,
  );
  assertEquals(pl["Aug 26"]["Net Profit"], undefined);
  assertJumpMatchesTool(pl["Aug 26"].Income, "profit-loss/Aug 26/Income");
  assertJumpMatchesTool(
    pl["Aug 26"].Expenses,
    "profit-loss/Aug 26/Expenses",
  );
  const stock = chartPointJumps(
    "erpnext_stock_chart",
    { warehouse: "Stores - C" },
    ["SKU-001"],
    now,
  )!;
  assertEquals(stock["SKU-001"].args, {
    item_code: "SKU-001",
    warehouse: "Stores - C",
    limit: 50,
  });
});

Deno.test("ui refresh - sales chart jumps mirror published grouping populations", () => {
  const now = new Date(2026, 7, 22, 10);
  const cases: Array<{
    groupBy: "customer" | "item" | "status";
    includeDrafts: boolean;
    expected: unknown[] | undefined;
  }> = [
    {
      groupBy: "customer",
      includeDrafts: false,
      expected: ["docstatus", "=", 1],
    },
    {
      groupBy: "customer",
      includeDrafts: true,
      expected: undefined,
    },
    {
      groupBy: "item",
      includeDrafts: false,
      expected: ["docstatus", "=", 1],
    },
    {
      groupBy: "item",
      includeDrafts: true,
      expected: ["docstatus", "=", 1],
    },
    {
      groupBy: "status",
      includeDrafts: false,
      expected: ["docstatus", "!=", 2],
    },
    {
      groupBy: "status",
      includeDrafts: true,
      expected: ["docstatus", "!=", 2],
    },
  ];

  for (const { groupBy, includeDrafts, expected } of cases) {
    const jump = chartPointJumps(
      "erpnext_sales_chart",
      { group_by: groupBy, include_drafts: includeDrafts },
      ["Target"],
      now,
    )?.Target;
    assertEquals(
      jump?.args.filters && (jump.args.filters as unknown[])[1],
      expected,
      `${groupBy}/include_drafts=${includeDrafts}`,
    );
  }
});

Deno.test("ui refresh - chart point jumps skip the handlers' « Unknown » placeholder", () => {
  const now = new Date(2026, 7, 22, 10);
  const jumps = chartPointJumps("erpnext_sales_chart", { group_by: "item" }, [
    "Unknown",
    "Laptop",
  ], now)!;
  assertEquals(Object.keys(jumps), ["Laptop"]);
  assertEquals(
    chartPointJumps("erpnext_ar_aging", {}, ["Unknown"], now),
    undefined,
  );
});
