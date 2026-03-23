import { assertEquals, assertNotStrictEquals } from "jsr:@std/assert";
import { withUiRefreshRequest } from "./ui-refresh.ts";

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
    refreshRequest: { toolName: "erpnext_kanban_get_board", arguments: { doctype: "Task" } },
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

  const hints = result._sendMessageHints as Array<{ label: string; message: string }>;
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

  assertEquals(result._drillDown, "Show all sales invoices for this month");
  assertEquals(result._trendDrillDown, "Show revenue trend chart for the last 12 months");
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
    assertEquals(rowAction.toolName, expectedTool, `${doctype} should use ${expectedTool}`);
  }
});
