import { assertEquals, assertNotStrictEquals } from "@std/assert";
import { allTools } from "./mod.ts";
import {
  chartPointJumps,
  FUNNEL_STAGE_JUMPS,
  INVOICE_HINTS,
  KPI_JUMPS,
  monthRange,
  type NavJump,
  STOCK_HINTS,
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
    ...Object.fromEntries(
      Object.entries(INVOICE_HINTS).map(([k, v]) => [`invoice:${k}`, v]),
    ),
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
  assertEquals(["list", "record", "chart"].includes(jump.kind), true, where);
}

Deno.test("ui refresh - every KPI and funnel jump targets a real tool with valid args", () => {
  const range = monthRange(new Date(2026, 7, 22, 10));
  for (const [tool, jumps] of Object.entries(KPI_JUMPS)) {
    const { number, trend } = jumps(range);
    assertJumpMatchesTool(number, `${tool}/number`);
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

Deno.test("ui refresh - invoice, stock and kanban results get typed hints", () => {
  // La forme réelle d'un `_get` : le document sous `data`, le doctype dessus.
  const invoice = withUiRefreshRequest(
    {
      data: { doctype: "Sales Invoice", name: "X" },
      _meta: { ui: { resourceUri: "ui://mcp-erpnext/invoice-viewer" } },
    },
    "erpnext_sales_invoice_get",
    {},
  ) as { _sendMessageHints?: { key: string; kind?: string }[] };
  assertEquals(invoice._sendMessageHints?.map((h) => h.key), [
    "payments",
    "customer",
    "item",
    "stock",
  ]);
  assertEquals(invoice._sendMessageHints?.[1].kind, "record");
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
  const outstanding = KPI_JUMPS["erpnext_kpi_outstanding"](r).number;
  assertEquals(outstanding.args.filters, [
    ["outstanding_amount", ">", 0],
    ["docstatus", "=", 1],
  ]);
  const overdue = KPI_JUMPS["erpnext_kpi_overdue"](r).number;
  assertEquals(overdue.args.filters, [
    ["due_date", "<", "2026-08-22"],
    ["outstanding_amount", ">", 0],
    ["docstatus", "=", 1],
  ]);
  // chaque saut porte une clé de libellé traduisible
  for (const [tool, jumps] of Object.entries(KPI_JUMPS)) {
    const { number, trend } = jumps(r);
    assertEquals(typeof number.key, "string", `${tool}/number`);
    assertEquals(typeof trend.key, "string", `${tool}/trend`);
  }
  for (const [stage, jump] of Object.entries(FUNNEL_STAGE_JUMPS)) {
    assertEquals(typeof jump.key, "string", `funnel/${stage}`);
  }
});

Deno.test("ui refresh - chart point jumps: every chart tool, every label, a real read-only tool", () => {
  const now = new Date(2026, 7, 22, 10);
  const cases: [string, Record<string, unknown>, string[]][] = [
    ["erpnext_revenue_trend", { months: 3 }, ["Jun 26", "Jul 26", "Aug 26"]],
    ["erpnext_profit_loss", {}, ["Mar 26", "Aug 26"]],
    ["erpnext_sales_chart", {}, ["Acme Corp"]],
    ["erpnext_sales_chart", { group_by: "item" }, ["SKU-001"]],
    ["erpnext_sales_chart", { group_by: "status" }, ["Paid"]],
    ["erpnext_order_breakdown", {}, ["Acme Corp"]],
    ["erpnext_revenue_vs_orders", {}, ["Acme Corp"]],
    ["erpnext_ar_aging", {}, ["Acme Corp"]],
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
    ["docstatus", "<", 2],
  ]);
  const pl = chartPointJumps(
    "erpnext_profit_loss",
    { months: 1 },
    ["Aug 26"],
    now,
  )!;
  assertEquals(pl["Aug 26"].args.doctype, "Sales Order");
  assertEquals(pl["Aug 26"].args.filters, [
    ["transaction_date", ">=", "2026-08-01"],
    ["transaction_date", "<=", "2026-08-31"],
    ["docstatus", "=", 1],
  ]);
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
