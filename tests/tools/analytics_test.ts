/**
 * Analytics Tools Tests
 *
 * Tests for ERPNext analytics/chart MCP tools.
 * Injects a mock FrappeClient to avoid real network calls.
 *
 * @module lib/erpnext/tests/tools/analytics_test
 */

import { assertEquals, assert } from "jsr:@std/assert";
import { analyticsTools } from "../../src/tools/analytics.ts";
import { FrappeClient } from "../../src/api/frappe-client.ts";
import type { ErpNextToolContext } from "../../src/tools/types.ts";

// ── Mock FrappeClient ─────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
type AnyFn = (...args: any[]) => any;

function makeMockClient(overrides: Record<string, AnyFn> = {}): FrappeClient {
  const mock: Record<string, AnyFn> = {
    list: async () => [],
    get: async () => ({ name: "TEST-001" }),
    create: async () => ({ name: "NEW-001" }),
    update: async () => ({ name: "TEST-001" }),
    delete: async () => {},
    callMethod: async () => null,
    ...overrides,
  };
  return mock as unknown as FrappeClient;
}

function makeCtx(client: FrappeClient): ErpNextToolContext {
  return { client };
}

function getTool(name: string) {
  const tool = analyticsTools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool;
}

// deno-lint-ignore no-explicit-any
function assertChartMeta(result: any, viewerName = "chart-viewer") {
  assert(result._meta, "Result should have _meta");
  assertEquals(result._meta.ui.resourceUri, `ui://mcp-erpnext/${viewerName}`);
}

// ── erpnext_order_pipeline ──────────────────────────────────────────────────

Deno.test("erpnext_order_pipeline - groups orders by status", async () => {
  const mockClient = makeMockClient({
    list: async (doctype: string) => {
      assertEquals(doctype, "Sales Order");
      return [
        { name: "SO-001", customer: "Acme", customer_name: "Acme Corp", status: "Draft", grand_total: 1000, transaction_date: "2026-01-01" },
        { name: "SO-002", customer: "Globex", customer_name: "Globex Inc", status: "Draft", grand_total: 2000, transaction_date: "2026-01-05" },
        { name: "SO-003", customer: "Acme", customer_name: "Acme Corp", status: "Completed", grand_total: 1500, transaction_date: "2026-01-10" },
      ];
    },
  });

  const tool = getTool("erpnext_order_pipeline");
  // deno-lint-ignore no-explicit-any
  const result = await tool.handler({}, makeCtx(mockClient)) as any;

  assertEquals(result.title, "Sales Order Pipeline");
  assert(result.columns.length >= 2, "Should have at least 2 status columns");
  const draftCol = result.columns.find((c: { status: string }) => c.status === "Draft");
  assert(draftCol, "Should have Draft column");
  assertEquals(draftCol.count, 2);
  assertEquals(draftCol.total, 3000);
  assertChartMeta(result, "order-pipeline-viewer");
});

Deno.test("erpnext_order_pipeline - respects exclude_cancelled", async () => {
  let capturedFilters: unknown[][] = [];
  const mockClient = makeMockClient({
    list: async (_doctype: string, opts: { filters?: unknown[][] }) => {
      capturedFilters = opts?.filters ?? [];
      return [];
    },
  });

  const tool = getTool("erpnext_order_pipeline");
  await tool.handler({ exclude_cancelled: true }, makeCtx(mockClient));

  const hasCancelFilter = capturedFilters.some(
    (f) => f[0] === "status" && f[1] === "!=" && f[2] === "Cancelled",
  );
  assertEquals(hasCancelFilter, true);
});

// ── erpnext_stock_chart ─────────────────────────────────────────────────────

Deno.test("erpnext_stock_chart - returns bar chart data", async () => {
  const mockClient = makeMockClient({
    list: async () => [
      { item_code: "ITEM-A", warehouse: "W1", actual_qty: 50, stock_value: 5000 },
      { item_code: "ITEM-B", warehouse: "W1", actual_qty: 30, stock_value: 3000 },
      { item_code: "ITEM-A", warehouse: "W2", actual_qty: 20, stock_value: 2000 },
    ],
  });

  const tool = getTool("erpnext_stock_chart");
  // deno-lint-ignore no-explicit-any
  const result = await tool.handler({}, makeCtx(mockClient)) as any;

  assertEquals(result.title, "Stock Levels");
  assert(result.labels.length === 2, "Should aggregate by item");
  assertEquals(result.labels[0], "ITEM-A"); // highest qty first
  assertEquals(result.datasets[0].values[0], 70); // 50+20
  assertChartMeta(result);
});

Deno.test("erpnext_stock_chart - uses horizontal-bar for many items", async () => {
  const items = Array.from({ length: 10 }, (_, i) => ({
    item_code: `ITEM-${i}`, warehouse: "W1", actual_qty: 100 - i * 10, stock_value: 1000,
  }));

  const mockClient = makeMockClient({ list: async () => items });

  const tool = getTool("erpnext_stock_chart");
  // deno-lint-ignore no-explicit-any
  const result = await tool.handler({}, makeCtx(mockClient)) as any;

  assertEquals(result.type, "horizontal-bar");
});

// ── erpnext_sales_chart ─────────────────────────────────────────────────────

Deno.test("erpnext_sales_chart - status grouping returns donut", async () => {
  const mockClient = makeMockClient({
    list: async () => [
      { name: "SINV-001", status: "Paid", grand_total: 5000 },
      { name: "SINV-002", status: "Paid", grand_total: 3000 },
      { name: "SINV-003", status: "Unpaid", grand_total: 2000 },
    ],
  });

  const tool = getTool("erpnext_sales_chart");
  // deno-lint-ignore no-explicit-any
  const result = await tool.handler({ group_by: "status" }, makeCtx(mockClient)) as any;

  assertEquals(result.type, "donut");
  assertEquals(result.labels[0], "Paid"); // highest value first
  assertEquals(result.datasets[0].values[0], 8000);
  assertChartMeta(result);
});

Deno.test("erpnext_sales_chart - customer grouping returns horizontal-bar", async () => {
  const mockClient = makeMockClient({
    list: async () => [
      { customer: "C1", customer_name: "Customer One", grand_total: 5000 },
      { customer: "C2", customer_name: "Customer Two", grand_total: 3000 },
    ],
  });

  const tool = getTool("erpnext_sales_chart");
  // deno-lint-ignore no-explicit-any
  const result = await tool.handler({ group_by: "customer" }, makeCtx(mockClient)) as any;

  assertEquals(result.type, "horizontal-bar");
  assertEquals(result.labels[0], "Customer One");
  assertChartMeta(result);
});

// ── erpnext_revenue_trend ───────────────────────────────────────────────────

Deno.test("erpnext_revenue_trend - returns line chart with monthly data", async () => {
  const mockClient = makeMockClient({
    list: async () => [
      { customer_name: "Acme", grand_total: 5000, transaction_date: "2026-02-10" },
      { customer_name: "Acme", grand_total: 3000, transaction_date: "2026-01-15" },
    ],
  });

  const tool = getTool("erpnext_revenue_trend");
  // deno-lint-ignore no-explicit-any
  const result = await tool.handler({ months: 3, type: "line" }, makeCtx(mockClient)) as any;

  assertEquals(result.type, "line");
  assertEquals(result.labels.length, 3);
  assertEquals(result.datasets.length, 1); // total mode
  assertChartMeta(result);
});

Deno.test("erpnext_revenue_trend - customer grouping produces multiple datasets", async () => {
  const mockClient = makeMockClient({
    list: async () => [
      { customer_name: "Acme", grand_total: 5000, transaction_date: "2026-02-10" },
      { customer_name: "Globex", grand_total: 3000, transaction_date: "2026-02-15" },
    ],
  });

  const tool = getTool("erpnext_revenue_trend");
  // deno-lint-ignore no-explicit-any
  const result = await tool.handler({ months: 2, group_by: "customer" }, makeCtx(mockClient)) as any;

  assert(result.datasets.length >= 2, "Should have dataset per customer");
  assertChartMeta(result);
});

// ── erpnext_order_breakdown ─────────────────────────────────────────────────

Deno.test("erpnext_order_breakdown - stacked-bar groups by customer and status", async () => {
  const mockClient = makeMockClient({
    list: async () => [
      { customer_name: "Acme", status: "Draft", grand_total: 1000 },
      { customer_name: "Acme", status: "To Deliver and Bill", grand_total: 2000 },
      { customer_name: "Globex", status: "Draft", grand_total: 500 },
    ],
  });

  const tool = getTool("erpnext_order_breakdown");
  // deno-lint-ignore no-explicit-any
  const result = await tool.handler({ type: "stacked-bar" }, makeCtx(mockClient)) as any;

  assertEquals(result.type, "stacked-bar");
  assertEquals(result.labels[0], "Acme"); // highest total first
  assert(result.datasets.length >= 1);
  assert(result.datasets.every((d: { stack: string }) => d.stack === "status"));
  assertChartMeta(result);
});

Deno.test("erpnext_order_breakdown - pie mode returns single dataset", async () => {
  const mockClient = makeMockClient({
    list: async () => [
      { customer_name: "Acme", status: "Draft", grand_total: 3000 },
      { customer_name: "Globex", status: "Draft", grand_total: 1000 },
    ],
  });

  const tool = getTool("erpnext_order_breakdown");
  // deno-lint-ignore no-explicit-any
  const result = await tool.handler({ type: "pie" }, makeCtx(mockClient)) as any;

  assertEquals(result.type, "pie");
  assertEquals(result.datasets.length, 1);
  assertChartMeta(result);
});

// ── erpnext_revenue_vs_orders ───────────────────────────────────────────────

Deno.test("erpnext_revenue_vs_orders - returns composed chart with dual axis", async () => {
  const mockClient = makeMockClient({
    list: async () => [
      { customer_name: "Acme", grand_total: 5000 },
      { customer_name: "Acme", grand_total: 3000 },
      { customer_name: "Globex", grand_total: 2000 },
    ],
  });

  const tool = getTool("erpnext_revenue_vs_orders");
  // deno-lint-ignore no-explicit-any
  const result = await tool.handler({}, makeCtx(mockClient)) as any;

  assertEquals(result.type, "composed");
  assertEquals(result.showRightAxis, true);
  assertEquals(result.datasets.length, 2);
  assertEquals(result.datasets[0].type, "bar");
  assertEquals(result.datasets[1].type, "line");
  assertEquals(result.datasets[1].yAxisId, "right");
  // Acme: 2 orders, 8000 total
  assertEquals(result.datasets[0].values[0], 8000);
  assertEquals(result.datasets[1].values[0], 2);
  assertChartMeta(result);
});

// ── erpnext_stock_treemap ───────────────────────────────────────────────────

Deno.test("erpnext_stock_treemap - returns treemap data", async () => {
  const mockClient = makeMockClient({
    list: async () => [
      { item_code: "ITEM-A", warehouse: "W1", stock_value: 5000 },
      { item_code: "ITEM-B", warehouse: "W1", stock_value: 3000 },
    ],
  });

  const tool = getTool("erpnext_stock_treemap");
  // deno-lint-ignore no-explicit-any
  const result = await tool.handler({}, makeCtx(mockClient)) as any;

  assertEquals(result.type, "treemap");
  assert(result.treeData.length === 2);
  assertEquals(result.treeData[0].name, "ITEM-A");
  assertEquals(result.treeData[0].value, 5000);
  assertChartMeta(result);
});

Deno.test("erpnext_stock_treemap - group by warehouse aggregates", async () => {
  const mockClient = makeMockClient({
    list: async () => [
      { item_code: "ITEM-A", warehouse: "W1", stock_value: 5000 },
      { item_code: "ITEM-B", warehouse: "W1", stock_value: 3000 },
      { item_code: "ITEM-A", warehouse: "W2", stock_value: 2000 },
    ],
  });

  const tool = getTool("erpnext_stock_treemap");
  // deno-lint-ignore no-explicit-any
  const result = await tool.handler({ group_by: "warehouse" }, makeCtx(mockClient)) as any;

  assertEquals(result.treeData.length, 2);
  const w1 = result.treeData.find((t: { name: string }) => t.name === "W1");
  assertEquals(w1.value, 8000);
});

// ── erpnext_product_radar ───────────────────────────────────────────────────

Deno.test("erpnext_product_radar - returns radar with auto-selected items", async () => {
  let callCount = 0;
  const mockClient = makeMockClient({
    list: async (doctype: string) => {
      if (doctype === "Bin") {
        callCount++;
        if (callCount === 1) {
          // Auto-select top items
          return [
            { item_code: "ITEM-A" },
            { item_code: "ITEM-B" },
          ];
        }
        // Per-item bin queries
        return [{ actual_qty: 50, stock_value: 5000 }];
      }
      if (doctype === "Sales Order Item") {
        return [];
      }
      return [];
    },
  });

  const tool = getTool("erpnext_product_radar");
  // deno-lint-ignore no-explicit-any
  const result = await tool.handler({}, makeCtx(mockClient)) as any;

  assertEquals(result.type, "radar");
  assertEquals(result.datasets.length, 2);
  assertEquals(result.labels.length, 4); // 4 dimensions
  assertChartMeta(result);
});

// ── erpnext_price_vs_qty ────────────────────────────────────────────────────

Deno.test("erpnext_price_vs_qty - falls back to Bin data when no Item Price", async () => {
  let callCount = 0;
  const mockClient = makeMockClient({
    list: async (doctype: string) => {
      callCount++;
      if (doctype === "Item Price") return [];
      if (doctype === "Sales Order Item") return [];
      if (doctype === "Bin") {
        return [
          { item_code: "ITEM-A", valuation_rate: 100, actual_qty: 50 },
          { item_code: "ITEM-B", valuation_rate: 200, actual_qty: 30 },
        ];
      }
      return [];
    },
  });

  const tool = getTool("erpnext_price_vs_qty");
  // deno-lint-ignore no-explicit-any
  const result = await tool.handler({}, makeCtx(mockClient)) as any;

  assertEquals(result.type, "scatter");
  assert(result.scatterData.length > 0);
  assertEquals(result.scatterData[0].points.length, 2);
  assertChartMeta(result);
});

// ── erpnext_kpi_revenue ─────────────────────────────────────────────────────

Deno.test("erpnext_kpi_revenue - returns KPI with sparkline (single API call)", async () => {
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-15`;
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15).toISOString().split("T")[0];

  const mockClient = makeMockClient({
    list: async () => [
      { grand_total: 5000, transaction_date: thisMonth },
      { grand_total: 3000, transaction_date: lastMonth },
    ],
  });

  const tool = getTool("erpnext_kpi_revenue");
  // deno-lint-ignore no-explicit-any
  const result = await tool.handler({}, makeCtx(mockClient)) as any;

  assertEquals(result.label, "Revenue MTD");
  assertEquals(result.currency, "EUR");
  assertEquals(result.value, 5000); // only current month bucket
  assert(Array.isArray(result.sparkline));
  assertEquals(result.sparkline.length, 6);
  assertEquals(result.sparkline[5], 5000); // current month
  assertEquals(result.sparkline[4], 3000); // previous month
  assert(result.trendIsGood === true);
  assertChartMeta(result, "kpi-viewer");
});

// ── erpnext_kpi_outstanding ─────────────────────────────────────────────────

Deno.test("erpnext_kpi_outstanding - sums outstanding invoices", async () => {
  const mockClient = makeMockClient({
    list: async () => [
      { outstanding_amount: 2000 },
      { outstanding_amount: 3000 },
    ],
  });

  const tool = getTool("erpnext_kpi_outstanding");
  // deno-lint-ignore no-explicit-any
  const result = await tool.handler({}, makeCtx(mockClient)) as any;

  assertEquals(result.label, "Outstanding Receivables");
  assertEquals(result.value, 5000);
  assert(result.trendIsGood === false);
  assertChartMeta(result, "kpi-viewer");
});

// ── erpnext_kpi_orders ──────────────────────────────────────────────────────

Deno.test("erpnext_kpi_orders - counts orders this month", async () => {
  const mockClient = makeMockClient({
    list: async () => [{ grand_total: 1000 }, { grand_total: 2000 }],
  });

  const tool = getTool("erpnext_kpi_orders");
  // deno-lint-ignore no-explicit-any
  const result = await tool.handler({}, makeCtx(mockClient)) as any;

  assertEquals(result.label, "Orders This Month");
  assertEquals(result.value, 2); // count, not sum
  assert(result.unit === "orders");
  assertChartMeta(result, "kpi-viewer");
});

// ── erpnext_kpi_gross_margin ────────────────────────────────────────────────

Deno.test("erpnext_kpi_gross_margin - computes margin from SO items and Bin", async () => {
  let callIdx = 0;
  const mockClient = makeMockClient({
    list: async (doctype: string) => {
      callIdx++;
      if (doctype === "Sales Order Item") {
        return [
          { item_code: "ITEM-A", qty: 10, amount: 5000 },
          { item_code: "ITEM-B", qty: 5, amount: 2500 },
        ];
      }
      if (doctype === "Bin") {
        return [
          { item_code: "ITEM-A", valuation_rate: 300 },
          { item_code: "ITEM-B", valuation_rate: 200 },
        ];
      }
      return [];
    },
  });

  const tool = getTool("erpnext_kpi_gross_margin");
  // deno-lint-ignore no-explicit-any
  const result = await tool.handler({}, makeCtx(mockClient)) as any;

  assertEquals(result.label, "Gross Margin");
  assertEquals(result.unit, "%");
  // Revenue 7500, cost = 10*300 + 5*200 = 4000, margin = (7500-4000)/7500*100 = 46.7%
  assert(result.value > 40 && result.value < 50);
  assertChartMeta(result, "kpi-viewer");
});

// ── erpnext_kpi_overdue ─────────────────────────────────────────────────────

Deno.test("erpnext_kpi_overdue - counts overdue invoices", async () => {
  const mockClient = makeMockClient({
    list: async () => [
      { outstanding_amount: 1500, due_date: "2026-01-01" },
      { outstanding_amount: 500, due_date: "2025-12-15" },
    ],
  });

  const tool = getTool("erpnext_kpi_overdue");
  // deno-lint-ignore no-explicit-any
  const result = await tool.handler({}, makeCtx(mockClient)) as any;

  assertEquals(result.label, "Overdue Invoices");
  assertEquals(result.value, 2);
  assert(result.trendIsGood === false);
  assertChartMeta(result, "kpi-viewer");
});

// ── erpnext_sales_funnel ────────────────────────────────────────────────────

Deno.test("erpnext_sales_funnel - returns 4-stage funnel with conversion rates", async () => {
  const mockClient = makeMockClient({
    list: async (doctype: string) => {
      if (doctype === "Lead") return [{ name: "L1" }, { name: "L2" }, { name: "L3" }, { name: "L4" }];
      if (doctype === "Opportunity") return [{ name: "O1", opportunity_amount: 5000 }, { name: "O2", opportunity_amount: 3000 }];
      if (doctype === "Quotation") return [{ name: "Q1", grand_total: 4000 }];
      if (doctype === "Sales Order") return [{ name: "SO1", grand_total: 3500 }];
      return [];
    },
  });

  const tool = getTool("erpnext_sales_funnel");
  // deno-lint-ignore no-explicit-any
  const result = await tool.handler({}, makeCtx(mockClient)) as any;

  assertEquals(result.title, "Sales Funnel");
  assertEquals(result.stages.length, 4);
  assertEquals(result.stages[0].label, "Leads");
  assertEquals(result.stages[0].count, 4);
  assertEquals(result.stages[1].label, "Opportunities");
  assertEquals(result.stages[1].count, 2);
  assertEquals(result.stages[1].conversionRate, 50); // 2/4
  assertEquals(result.stages[2].conversionRate, 50); // 1/2
  assertEquals(result.stages[3].conversionRate, 100); // 1/1
  assertChartMeta(result, "funnel-viewer");
});

// ── erpnext_ar_aging ────────────────────────────────────────────────────────

Deno.test("erpnext_ar_aging - groups invoices into aging buckets", async () => {
  const today = new Date();
  const d10 = new Date(today); d10.setDate(today.getDate() - 10);
  const d45 = new Date(today); d45.setDate(today.getDate() - 45);
  const d100 = new Date(today); d100.setDate(today.getDate() - 100);

  const mockClient = makeMockClient({
    list: async () => [
      { customer_name: "Acme", outstanding_amount: 1000, due_date: d10.toISOString().split("T")[0], posting_date: d10.toISOString().split("T")[0] },
      { customer_name: "Acme", outstanding_amount: 2000, due_date: d45.toISOString().split("T")[0], posting_date: d45.toISOString().split("T")[0] },
      { customer_name: "Globex", outstanding_amount: 3000, due_date: d100.toISOString().split("T")[0], posting_date: d100.toISOString().split("T")[0] },
    ],
  });

  const tool = getTool("erpnext_ar_aging");
  // deno-lint-ignore no-explicit-any
  const result = await tool.handler({}, makeCtx(mockClient)) as any;

  assertEquals(result.type, "stacked-bar");
  assert(result.labels.length > 0);
  assert(result.datasets.length > 0);
  assertChartMeta(result);
});

// ── erpnext_gross_profit ────────────────────────────────────────────────────

Deno.test("erpnext_gross_profit - returns composed chart with margin line", async () => {
  const mockClient = makeMockClient({
    list: async (doctype: string) => {
      if (doctype === "Sales Invoice Item") {
        return [
          { item_code: "ITEM-A", qty: 10, amount: 5000, parent: "SINV-001" },
          { item_code: "ITEM-B", qty: 5, amount: 2500, parent: "SINV-001" },
        ];
      }
      if (doctype === "Sales Invoice") {
        return [{ name: "SINV-001", customer_name: "Acme" }];
      }
      if (doctype === "Bin") {
        return [
          { item_code: "ITEM-A", valuation_rate: 300 },
          { item_code: "ITEM-B", valuation_rate: 200 },
        ];
      }
      return [];
    },
  });

  const tool = getTool("erpnext_gross_profit");
  // deno-lint-ignore no-explicit-any
  const result = await tool.handler({}, makeCtx(mockClient)) as any;

  assertEquals(result.type, "composed");
  assertEquals(result.showRightAxis, true);
  assert(result.datasets.length >= 2);
  assertChartMeta(result);
});

// ── erpnext_profit_loss ─────────────────────────────────────────────────────

Deno.test("erpnext_profit_loss - returns monthly income vs expense", async () => {
  const mockClient = makeMockClient({
    list: async (doctype: string) => {
      if (doctype === "Sales Order") {
        return [{ grand_total: 10000, transaction_date: "2026-02-15" }];
      }
      if (doctype === "Purchase Order") {
        return [{ grand_total: 6000, transaction_date: "2026-02-10" }];
      }
      return [];
    },
  });

  const tool = getTool("erpnext_profit_loss");
  // deno-lint-ignore no-explicit-any
  const result = await tool.handler({ months: 3 }, makeCtx(mockClient)) as any;

  assertEquals(result.type, "composed");
  assert(result.labels.length > 0);
  assert(result.datasets.length >= 2);
  assertChartMeta(result);
});

// ── erpnext_purchase_pipeline ───────────────────────────────────────────────

Deno.test("erpnext_purchase_pipeline - groups POs by status", async () => {
  const mockClient = makeMockClient({
    list: async () => [
      { name: "PO-001", supplier: "S1", supplier_name: "Supplier One", status: "Draft", grand_total: 5000, transaction_date: "2026-02-01", schedule_date: "2026-03-01" },
      { name: "PO-002", supplier: "S2", supplier_name: "Supplier Two", status: "To Receive and Bill", grand_total: 3000, transaction_date: "2026-02-05", schedule_date: "2026-03-05" },
    ],
  });

  const tool = getTool("erpnext_purchase_pipeline");
  // deno-lint-ignore no-explicit-any
  const result = await tool.handler({}, makeCtx(mockClient)) as any;

  assertEquals(result.title, "Purchase Order Pipeline");
  assert(result.columns.length >= 2);
  assertChartMeta(result, "order-pipeline-viewer");
});

// ── All tools have required fields ──────────────────────────────────────────

Deno.test("all analytics tools have name, description, category, handler", () => {
  for (const tool of analyticsTools) {
    assert(tool.name, `Tool should have name`);
    assert(tool.description, `${tool.name} should have description`);
    assert(tool.category === "analytics", `${tool.name} should have category "analytics"`);
    assert(typeof tool.handler === "function", `${tool.name} should have handler function`);
    assert(tool.inputSchema, `${tool.name} should have inputSchema`);
  }
});

Deno.test("all analytics tools have _meta with resourceUri", () => {
  for (const tool of analyticsTools) {
    // deno-lint-ignore no-explicit-any
    const meta = (tool as any)._meta;
    assert(meta, `${tool.name} should have _meta`);
    assert(meta.ui, `${tool.name} should have _meta.ui`);
    assert(meta.ui.resourceUri, `${tool.name} should have _meta.ui.resourceUri`);
    assert(
      meta.ui.resourceUri.startsWith("ui://mcp-erpnext/"),
      `${tool.name} resourceUri should start with ui://mcp-erpnext/`,
    );
  }
});
