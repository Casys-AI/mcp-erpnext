/**
 * ERPNext Analytics Tools
 *
 * Tools that return shaped data for chart/pipeline viewers.
 * - erpnext_order_pipeline     → Kanban columns by SO status
 * - erpnext_stock_chart        → Bar chart of stock levels by item
 * - erpnext_sales_chart        → Bar/donut chart of sales by customer or item
 * - erpnext_ar_aging           → Stacked bar of AR aging buckets by customer
 * - erpnext_gross_profit       → Composed chart: revenue bars + margin % line
 * - erpnext_profit_loss        → P&L: income vs expenses per month + net profit
 * - erpnext_purchase_pipeline  → Kanban columns by PO status
 *
 * @module lib/erpnext/tools/analytics
 */

import type { FrappeFilter } from "../api/types.ts";
import type { ErpNextTool } from "./types.ts";

// ── Chart type → resource URI constant ──────────────────────────────────────

const CHART_UI = { ui: { resourceUri: "ui://mcp-erpnext/chart-viewer" } };
const KPI_UI = { ui: { resourceUri: "ui://mcp-erpnext/kpi-viewer" } };
const PIPELINE_UI = { ui: { resourceUri: "ui://mcp-erpnext/order-pipeline-viewer" } };
const FUNNEL_UI = { ui: { resourceUri: "ui://mcp-erpnext/funnel-viewer" } };

export const analyticsTools: ErpNextTool[] = [
  // ── Order Pipeline ────────────────────────────────────────────────────────

  {
    name: "erpnext_order_pipeline",
    _meta: PIPELINE_UI,
    description:
      "Get sales orders grouped by workflow status as a kanban pipeline. " +
      "Returns columns (Draft, Open, To Deliver, To Bill, Completed, Cancelled) " +
      "with order count, total value, and individual order cards. " +
      "Ideal for seeing the current state of your sales pipeline at a glance.",
    category: "analytics",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max total orders to fetch (default 200)" },
        customer: { type: "string", description: "Filter by customer name" },
        exclude_cancelled: {
          type: "boolean",
          description: "Exclude cancelled orders from results (default false)",
        },
      },
    },
    handler: async (input, ctx) => {
      const limit = (input.limit as number) ?? 200;
      const filters: FrappeFilter[] = [];

      if (input.customer) {
        filters.push(["customer", "=", input.customer as string]);
      }
      if (input.exclude_cancelled) {
        filters.push(["status", "!=", "Cancelled"]);
      }

      const orders = await ctx.client.list("Sales Order", {
        fields: [
          "name",
          "customer",
          "customer_name",
          "status",
          "grand_total",
          "transaction_date",
          "delivery_date",
        ],
        filters,
        limit,
        order_by: "modified desc",
      });

      const STATUS_MAP: Record<string, { label: string; color: string }> = {
        "Draft":                { label: "Draft",       color: "#78716c" },
        "Open":                 { label: "Open",        color: "#fbbf24" },
        "To Deliver and Bill":  { label: "To Deliver",  color: "#60a5fa" },
        "To Bill":              { label: "To Bill",     color: "#c084fc" },
        "Completed":            { label: "Completed",   color: "#4ade80" },
        "Cancelled":            { label: "Cancelled",   color: "#f87171" },
      };

      const grouped: Record<string, typeof orders> = {};
      for (const order of orders) {
        const status = (order.status as string) ?? "Draft";
        if (!grouped[status]) grouped[status] = [];
        grouped[status].push(order);
      }

      const columns = Object.entries(STATUS_MAP)
        .filter(([status]) => grouped[status]?.length > 0)
        .map(([status, { label, color }]) => {
          const statusOrders = grouped[status] ?? [];
          return {
            status,
            label,
            color,
            count: statusOrders.length,
            total: statusOrders.reduce((sum, o) => sum + (Number(o.grand_total) || 0), 0),
            orders: statusOrders.map((o) => ({
              name: o.name,
              customer: (o.customer_name ?? o.customer) as string,
              amount: Number(o.grand_total) || 0,
              date: o.transaction_date as string,
              delivery_date: o.delivery_date as string | undefined,
            })),
          };
        });

      return {
        title: "Sales Order Pipeline",
        currency: "EUR",
        generatedAt: new Date().toISOString(),
        columns,
        _meta: PIPELINE_UI,
      };
    },
  },

  // ── Stock Chart ───────────────────────────────────────────────────────────

  {
    name: "erpnext_stock_chart",
    _meta: CHART_UI,
    description:
      "Get stock levels as a bar chart. Shows actual_qty per item (optionally filtered by warehouse). " +
      "Groups items and returns chart-ready data. " +
      "Use type='horizontal-bar' for readability with many items.",
    category: "analytics",
    inputSchema: {
      type: "object",
      properties: {
        warehouse: { type: "string", description: "Filter by warehouse name" },
        item_group: { type: "string", description: "Filter by item group" },
        limit: { type: "number", description: "Max items to show (default 20)" },
        type: {
          type: "string",
          enum: ["bar", "horizontal-bar"],
          description: "Chart type (default: horizontal-bar for many items, bar for few)",
        },
        min_qty: { type: "number", description: "Only show items with qty >= this value (filters out zeros)" },
      },
    },
    handler: async (input, ctx) => {
      const limit = (input.limit as number) ?? 20;
      const filters: FrappeFilter[] = [["actual_qty", ">", (input.min_qty as number) ?? 0]];

      if (input.warehouse) filters.push(["warehouse", "=", input.warehouse as string]);
      if (input.item_group) filters.push(["item_group", "=", input.item_group as string]);

      const bins = await ctx.client.list("Bin", {
        fields: ["item_code", "warehouse", "actual_qty", "stock_value"],
        filters,
        limit,
        order_by: "actual_qty desc",
      });

      // Aggregate by item_code (sum across warehouses if no filter)
      const byItem: Record<string, { qty: number; value: number }> = {};
      for (const bin of bins) {
        const item = bin.item_code as string;
        if (!byItem[item]) byItem[item] = { qty: 0, value: 0 };
        byItem[item].qty += Number(bin.actual_qty) || 0;
        byItem[item].value += Number(bin.stock_value) || 0;
      }

      const sorted = Object.entries(byItem)
        .sort(([, a], [, b]) => b.qty - a.qty)
        .slice(0, limit);

      const warehouseLabel = (input.warehouse as string) ?? "All Warehouses";
      const chartType = (input.type as string) ?? (sorted.length > 6 ? "horizontal-bar" : "bar");

      return {
        title: "Stock Levels",
        subtitle: warehouseLabel,
        type: chartType,
        labels: sorted.map(([item]) => item),
        datasets: [
          {
            label: "Qty on Hand",
            values: sorted.map(([, { qty }]) => qty),
            color: "#60a5fa",
          },
        ],
        unit: "units",
        generatedAt: new Date().toISOString(),
        _meta: CHART_UI,
      };
    },
  },

  // ── Sales Chart ───────────────────────────────────────────────────────────

  {
    name: "erpnext_sales_chart",
    _meta: CHART_UI,
    description:
      "Analyze sales revenue as a chart. " +
      "group_by='customer' → bar chart of top customers by revenue. " +
      "group_by='item' → bar chart of top items sold. " +
      "group_by='status' → donut chart of invoice status breakdown. " +
      "Reads from Sales Invoice (submitted only by default).",
    category: "analytics",
    inputSchema: {
      type: "object",
      properties: {
        group_by: {
          type: "string",
          enum: ["customer", "item", "status"],
          description: "Dimension to group by (default: customer)",
        },
        limit: { type: "number", description: "Top N results (default 10)" },
        include_drafts: { type: "boolean", description: "Include Draft invoices (default false)" },
      },
    },
    handler: async (input, ctx) => {
      const limit = (input.limit as number) ?? 10;
      const groupBy = (input.group_by as string) ?? "customer";
      const filters: FrappeFilter[] = [];

      if (!input.include_drafts) {
        filters.push(["docstatus", "=", 1]); // Submitted only
      }

      if (groupBy === "status") {
        // Get invoice counts + amounts by status — fetch more to cover all statuses
        const invoices = await ctx.client.list("Sales Invoice", {
          fields: ["name", "status", "grand_total"],
          filters: [["docstatus", "!=", 2]], // exclude cancelled
          limit: 500,
          order_by: "modified desc",
        });

        const byStatus: Record<string, number> = {};
        for (const inv of invoices) {
          const s = (inv.status as string) ?? "Unknown";
          byStatus[s] = (byStatus[s] ?? 0) + (Number(inv.grand_total) || 0);
        }

        const sorted = Object.entries(byStatus).sort(([, a], [, b]) => b - a);

        return {
          title: "Invoice Revenue by Status",
          type: "donut",
          labels: sorted.map(([s]) => s),
          datasets: [{ label: "Revenue", values: sorted.map(([, v]) => v) }],
          currency: "EUR",
          generatedAt: new Date().toISOString(),
          _meta: CHART_UI,
        };
      }

      if (groupBy === "item") {
        // Fetch invoice items (Sales Invoice Item child table)
        const items = await ctx.client.list("Sales Invoice Item", {
          fields: ["item_code", "item_name", "amount"],
          filters: [["docstatus", "=", 1]],
          limit: 500,
          order_by: "amount desc",
        });

        const byItem: Record<string, { name: string; total: number }> = {};
        for (const row of items) {
          const code = (row.item_code as string) ?? "Unknown";
          if (!byItem[code]) byItem[code] = { name: (row.item_name as string) ?? code, total: 0 };
          byItem[code].total += Number(row.amount) || 0;
        }

        const sorted = Object.entries(byItem)
          .sort(([, a], [, b]) => b.total - a.total)
          .slice(0, limit);

        return {
          title: "Top Items by Revenue",
          subtitle: `Top ${sorted.length} items`,
          type: "horizontal-bar",
          labels: sorted.map(([, { name }]) => name),
          datasets: [{ label: "Revenue", values: sorted.map(([, { total }]) => total), color: "#c084fc" }],
          currency: "EUR",
          generatedAt: new Date().toISOString(),
          _meta: CHART_UI,
        };
      }

      // Default: group by customer
      const invoices = await ctx.client.list("Sales Invoice", {
        fields: ["customer", "customer_name", "grand_total"],
        filters,
        limit: 500,
        order_by: "modified desc",
      });

      const byCustomer: Record<string, { name: string; total: number }> = {};
      for (const inv of invoices) {
        const code = (inv.customer as string) ?? "Unknown";
        if (!byCustomer[code]) byCustomer[code] = { name: (inv.customer_name as string) ?? code, total: 0 };
        byCustomer[code].total += Number(inv.grand_total) || 0;
      }

      const sorted = Object.entries(byCustomer)
        .sort(([, a], [, b]) => b.total - a.total)
        .slice(0, limit);

      return {
        title: "Top Customers by Revenue",
        subtitle: `Top ${sorted.length} customers`,
        type: "horizontal-bar",
        labels: sorted.map(([, { name }]) => name),
        datasets: [{ label: "Revenue", values: sorted.map(([, { total }]) => total), color: "#4ade80" }],
        currency: "EUR",
        generatedAt: new Date().toISOString(),
        _meta: CHART_UI,
      };
    },
  },

  // ── Revenue Trend (line / area) ─────────────────────────────────────────

  {
    name: "erpnext_revenue_trend",
    _meta: CHART_UI,
    description:
      "Sales revenue trend over time. Returns a line chart (or area if type='area') " +
      "with monthly revenue from Sales Orders. " +
      "Add group_by='customer' for multi-line per customer. " +
      "Use type='stacked-area' to stack customers.",
    category: "analytics",
    inputSchema: {
      type: "object",
      properties: {
        months: { type: "number", description: "How many months back to include (default 6)" },
        type: {
          type: "string",
          enum: ["line", "area", "stacked-area"],
          description: "Chart type (default: line)",
        },
        group_by: {
          type: "string",
          enum: ["total", "customer"],
          description: "Group by total or per customer (default: total)",
        },
      },
    },
    handler: async (input, ctx) => {
      const monthsBack = (input.months as number) ?? 6;
      const chartType = (input.type as string) ?? "line";
      const groupBy = (input.group_by as string) ?? "total";

      // Build date range
      const now = new Date();
      const startDate = new Date(now.getFullYear(), now.getMonth() - monthsBack + 1, 1);
      const startStr = startDate.toISOString().split("T")[0];

      const orders = await ctx.client.list("Sales Order", {
        fields: ["customer_name", "grand_total", "transaction_date"],
        filters: [["transaction_date", ">=", startStr], ["docstatus", "!=", 2]],
        limit: 1000,
        order_by: "transaction_date asc",
      });

      // Build month labels
      const months: string[] = [];
      for (let m = 0; m < monthsBack; m++) {
        const d = new Date(now.getFullYear(), now.getMonth() - monthsBack + 1 + m, 1);
        months.push(`${d.toLocaleString("en", { month: "short" })} ${d.getFullYear().toString().slice(2)}`);
      }

      if (groupBy === "customer") {
        // Multi-line: one dataset per customer
        const byCustomerMonth: Record<string, number[]> = {};
        for (const order of orders) {
          const d = new Date(order.transaction_date as string);
          const mIdx = (d.getFullYear() - startDate.getFullYear()) * 12 + d.getMonth() - startDate.getMonth();
          if (mIdx < 0 || mIdx >= monthsBack) continue;
          const cust = (order.customer_name as string) ?? "Unknown";
          if (!byCustomerMonth[cust]) byCustomerMonth[cust] = new Array(monthsBack).fill(0);
          byCustomerMonth[cust][mIdx] += Number(order.grand_total) || 0;
        }

        // Top 5 customers by total
        const sorted = Object.entries(byCustomerMonth)
          .sort(([, a], [, b]) => b.reduce((s, v) => s + v, 0) - a.reduce((s, v) => s + v, 0))
          .slice(0, 5);

        const COLORS = ["#60a5fa", "#4ade80", "#fbbf24", "#c084fc", "#f472b6"];
        return {
          title: "Revenue by Customer",
          subtitle: `Last ${monthsBack} months`,
          type: chartType,
          labels: months,
          datasets: sorted.map(([name, values], i) => ({
            label: name,
            values,
            color: COLORS[i % COLORS.length],
            showDots: chartType === "line",
            ...(chartType === "stacked-area" ? { stack: "revenue" } : {}),
          })),
          currency: "EUR",
          yAxisLabel: "Revenue",
          _meta: CHART_UI,
        };
      }

      // Single line: total revenue per month
      const monthlyTotals = new Array(monthsBack).fill(0);
      for (const order of orders) {
        const d = new Date(order.transaction_date as string);
        const mIdx = (d.getFullYear() - startDate.getFullYear()) * 12 + d.getMonth() - startDate.getMonth();
        if (mIdx >= 0 && mIdx < monthsBack) {
          monthlyTotals[mIdx] += Number(order.grand_total) || 0;
        }
      }

      return {
        title: "Revenue Trend",
        subtitle: `Last ${monthsBack} months`,
        type: chartType,
        labels: months,
        datasets: [{
          label: "Revenue",
          values: monthlyTotals,
          color: "#60a5fa",
          showDots: true,
        }],
        currency: "EUR",
        yAxisLabel: "Revenue",
        _meta: CHART_UI,
      };
    },
  },

  // ── Order Breakdown (stacked bar / pie) ─────────────────────────────────

  {
    name: "erpnext_order_breakdown",
    _meta: CHART_UI,
    description:
      "Breakdown of Sales Orders by customer (stacked-bar by status) or as a pie chart of totals. " +
      "type='stacked-bar' → orders stacked by status per customer. " +
      "type='pie' → total order value per customer as pie. " +
      "type='donut' → same as pie but with donut hole.",
    category: "analytics",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["stacked-bar", "pie", "donut"],
          description: "Chart type (default: stacked-bar)",
        },
        limit: { type: "number", description: "Top N customers (default 8)" },
      },
    },
    handler: async (input, ctx) => {
      const chartType = (input.type as string) ?? "stacked-bar";
      const limit = (input.limit as number) ?? 8;

      const orders = await ctx.client.list("Sales Order", {
        fields: ["customer_name", "status", "grand_total"],
        filters: [["docstatus", "!=", 2]],
        limit: 500,
        order_by: "modified desc",
      });

      if (chartType === "pie" || chartType === "donut") {
        const byCustomer: Record<string, number> = {};
        for (const o of orders) {
          const c = (o.customer_name as string) ?? "Unknown";
          byCustomer[c] = (byCustomer[c] ?? 0) + (Number(o.grand_total) || 0);
        }
        const sorted = Object.entries(byCustomer).sort(([, a], [, b]) => b - a).slice(0, limit);

        return {
          title: "Orders by Customer",
          type: chartType,
          labels: sorted.map(([c]) => c),
          datasets: [{ label: "Total", values: sorted.map(([, v]) => v) }],
          currency: "EUR",
          _meta: CHART_UI,
        };
      }

      // Stacked bar: customers on X, stacked by status
      const STATUS_ORDER = ["Draft", "To Deliver and Bill", "To Bill", "Completed", "Cancelled"];
      const STATUS_COLORS: Record<string, string> = {
        Draft: "#78716c", "To Deliver and Bill": "#60a5fa",
        "To Bill": "#c084fc", Completed: "#4ade80", Cancelled: "#f87171",
      };

      const byCustomerStatus: Record<string, Record<string, number>> = {};
      for (const o of orders) {
        const c = (o.customer_name as string) ?? "Unknown";
        const s = (o.status as string) ?? "Draft";
        if (!byCustomerStatus[c]) byCustomerStatus[c] = {};
        byCustomerStatus[c][s] = (byCustomerStatus[c][s] ?? 0) + (Number(o.grand_total) || 0);
      }

      // Top N customers
      const customerTotals = Object.entries(byCustomerStatus)
        .map(([c, statuses]) => ({ name: c, total: Object.values(statuses).reduce((s, v) => s + v, 0) }))
        .sort((a, b) => b.total - a.total)
        .slice(0, limit);

      const customers = customerTotals.map((c) => c.name);
      const activeStatuses = STATUS_ORDER.filter((s) =>
        customers.some((c) => (byCustomerStatus[c]?.[s] ?? 0) > 0)
      );

      return {
        title: "Order Value by Customer & Status",
        type: "stacked-bar",
        labels: customers,
        datasets: activeStatuses.map((s) => ({
          label: s === "To Deliver and Bill" ? "To Deliver" : s,
          values: customers.map((c) => byCustomerStatus[c]?.[s] ?? 0),
          color: STATUS_COLORS[s] ?? "#94a3b8",
          stack: "status",
        })),
        currency: "EUR",
        xAxisLabel: "Customer",
        yAxisLabel: "Order Value",
        _meta: CHART_UI,
      };
    },
  },

  // ── Revenue vs Orders Composed ──────────────────────────────────────────

  {
    name: "erpnext_revenue_vs_orders",
    _meta: CHART_UI,
    description:
      "Composed chart (bar + line) showing revenue (bars, left axis) vs order count (line, right axis) " +
      "per customer. Demonstrates dual-axis composed chart.",
    category: "analytics",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Top N customers (default 8)" },
      },
    },
    handler: async (input, ctx) => {
      const limit = (input.limit as number) ?? 8;
      const orders = await ctx.client.list("Sales Order", {
        fields: ["customer_name", "grand_total"],
        filters: [["docstatus", "!=", 2]],
        limit: 500,
        order_by: "modified desc",
      });

      const byCustomer: Record<string, { total: number; count: number }> = {};
      for (const o of orders) {
        const c = (o.customer_name as string) ?? "Unknown";
        if (!byCustomer[c]) byCustomer[c] = { total: 0, count: 0 };
        byCustomer[c].total += Number(o.grand_total) || 0;
        byCustomer[c].count += 1;
      }

      const sorted = Object.entries(byCustomer)
        .sort(([, a], [, b]) => b.total - a.total)
        .slice(0, limit);

      return {
        title: "Revenue vs Order Count",
        subtitle: `Top ${sorted.length} customers`,
        type: "composed",
        labels: sorted.map(([c]) => c),
        datasets: [
          {
            label: "Revenue",
            values: sorted.map(([, { total }]) => total),
            color: "#60a5fa",
            type: "bar",
          },
          {
            label: "Orders",
            values: sorted.map(([, { count }]) => count),
            color: "#fbbf24",
            type: "line",
            yAxisId: "right",
            showDots: true,
          },
        ],
        showRightAxis: true,
        yAxisLabel: "Revenue (€)",
        rightAxisLabel: "# Orders",
        currency: "EUR",
        _meta: CHART_UI,
      };
    },
  },

  // ── Stock Value Treemap ─────────────────────────────────────────────────

  {
    name: "erpnext_stock_treemap",
    _meta: CHART_UI,
    description:
      "Stock value as a treemap. Each rectangle represents an item, sized by stock value. " +
      "Use group_by='warehouse' to group by warehouse instead.",
    category: "analytics",
    inputSchema: {
      type: "object",
      properties: {
        group_by: {
          type: "string",
          enum: ["item", "warehouse"],
          description: "Group by item or warehouse (default: item)",
        },
        limit: { type: "number", description: "Top N entries (default 15)" },
      },
    },
    handler: async (input, ctx) => {
      const groupBy = (input.group_by as string) ?? "item";
      const limit = (input.limit as number) ?? 15;

      const bins = await ctx.client.list("Bin", {
        fields: ["item_code", "warehouse", "stock_value"],
        filters: [["stock_value", ">", 0]],
        limit: 500,
        order_by: "stock_value desc",
      });

      const grouped: Record<string, number> = {};
      for (const bin of bins) {
        const key = groupBy === "warehouse" ? (bin.warehouse as string) : (bin.item_code as string);
        grouped[key] = (grouped[key] ?? 0) + (Number(bin.stock_value) || 0);
      }

      const sorted = Object.entries(grouped)
        .sort(([, a], [, b]) => b - a)
        .slice(0, limit);

      const COLORS = ["#60a5fa", "#4ade80", "#fbbf24", "#818cf8", "#c084fc", "#fb923c", "#34d399", "#f472b6", "#a78bfa", "#f97316", "#22d3ee", "#e879f9"];

      return {
        title: `Stock Value by ${groupBy === "warehouse" ? "Warehouse" : "Item"}`,
        type: "treemap",
        labels: [],
        datasets: [],
        treeData: sorted.map(([name, value], i) => ({
          name: name.length > 20 ? name.slice(0, 18) + "…" : name,
          value: Math.round(value),
          color: COLORS[i % COLORS.length],
        })),
        currency: "EUR",
        _meta: CHART_UI,
      };
    },
  },

  // ── Product Comparison Radar ────────────────────────────────────────────

  {
    name: "erpnext_product_radar",
    _meta: CHART_UI,
    description:
      "Radar chart comparing items across multiple dimensions: " +
      "stock level, stock value, order frequency, and revenue. " +
      "Pass 2-4 item codes to compare.",
    category: "analytics",
    inputSchema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: { type: "string" },
          description: "2-4 item codes to compare. Leave empty for auto-select top items.",
        },
      },
    },
    handler: async (input, ctx) => {
      let itemCodes = (input.items as string[]) ?? [];

      // Auto-select top items if not provided
      if (itemCodes.length === 0) {
        const topBins = await ctx.client.list("Bin", {
          fields: ["item_code"],
          filters: [["actual_qty", ">", 0]],
          limit: 4,
          order_by: "stock_value desc",
        });
        itemCodes = topBins.map((b) => b.item_code as string);
      }

      if (itemCodes.length < 2) {
        return {
          title: "Product Comparison",
          type: "radar",
          labels: [],
          datasets: [],
          _meta: CHART_UI,
        };
      }

      // Gather data for each item
      const dimensions = ["Stock Qty", "Stock Value", "Order Lines", "Revenue"];
      const raw: Record<string, number[]> = {};

      // Stock data
      for (const code of itemCodes) {
        const bins = await ctx.client.list("Bin", {
          fields: ["actual_qty", "stock_value"],
          filters: [["item_code", "=", code]],
          limit: 100,
        });
        const totalQty = bins.reduce((s, b) => s + (Number(b.actual_qty) || 0), 0);
        const totalVal = bins.reduce((s, b) => s + (Number(b.stock_value) || 0), 0);
        raw[code] = [totalQty, totalVal, 0, 0];
      }

      // Order data — fetch all, filter in memory (FrappeFilter doesn't support "in" arrays)
      const soItems = await ctx.client.list("Sales Order Item", {
        fields: ["item_code", "qty", "amount"],
        filters: [["docstatus", "!=", 2]],
        limit: 500,
      });

      const itemSet = new Set(itemCodes);
      for (const row of soItems) {
        const code = row.item_code as string;
        if (itemSet.has(code) && raw[code]) {
          raw[code][2] += 1; // order lines
          raw[code][3] += Number(row.amount) || 0; // revenue
        }
      }

      // Normalize to 0-100 scale per dimension
      const maxPerDim = dimensions.map((_, di) =>
        Math.max(1, ...itemCodes.map((c) => raw[c]?.[di] ?? 0))
      );

      const COLORS = ["#60a5fa", "#f472b6", "#4ade80", "#fbbf24"];
      return {
        title: "Product Comparison",
        subtitle: itemCodes.join(" vs "),
        type: "radar",
        labels: dimensions,
        datasets: itemCodes.map((code, i) => ({
          label: code,
          values: dimensions.map((_, di) => Math.round(((raw[code]?.[di] ?? 0) / maxPerDim[di]) * 100)),
          color: COLORS[i % COLORS.length],
        })),
        _meta: CHART_UI,
      };
    },
  },

  // ── Price vs Quantity Scatter ────────────────────────────────────────────

  {
    name: "erpnext_price_vs_qty",
    _meta: CHART_UI,
    description:
      "Scatter chart: item selling price (X) vs total qty ordered (Y). " +
      "Each point is an item. Colored by item group if available.",
    category: "analytics",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max items to show (default 30)" },
      },
    },
    handler: async (input, ctx) => {
      const limit = (input.limit as number) ?? 30;

      // Get items with selling price
      const items = await ctx.client.list("Item Price", {
        fields: ["item_code", "price_list_rate"],
        filters: [["selling", "=", 1]],
        limit: 200,
        order_by: "modified desc",
      });

      const priceMap: Record<string, number> = {};
      for (const ip of items) {
        const code = ip.item_code as string;
        if (!priceMap[code]) priceMap[code] = Number(ip.price_list_rate) || 0;
      }

      // Get order quantities
      const soItems = await ctx.client.list("Sales Order Item", {
        fields: ["item_code", "qty"],
        filters: [["docstatus", "!=", 2]],
        limit: 500,
      });

      const qtyMap: Record<string, number> = {};
      for (const row of soItems) {
        const code = row.item_code as string;
        qtyMap[code] = (qtyMap[code] ?? 0) + (Number(row.qty) || 0);
      }

      // Combine: only items that have both price and orders
      const allItems = Object.keys(priceMap).filter((c) => qtyMap[c] != null);
      const limited = allItems.slice(0, limit);

      if (limited.length === 0) {
        // Fallback: use stock data
        const bins = await ctx.client.list("Bin", {
          fields: ["item_code", "valuation_rate", "actual_qty"],
          filters: [["actual_qty", ">", 0], ["valuation_rate", ">", 0]],
          limit,
          order_by: "stock_value desc",
        });

        return {
          title: "Valuation Rate vs Stock Qty",
          type: "scatter",
          labels: [],
          datasets: [],
          scatterData: [{
            label: "Items",
            color: "#818cf8",
            points: bins.map((b) => ({
              x: Math.round(Number(b.valuation_rate) || 0),
              y: Math.round(Number(b.actual_qty) || 0),
              label: b.item_code as string,
            })),
          }],
          xAxisLabel: "Valuation Rate (€/unit)",
          yAxisLabel: "Stock Qty",
          _meta: CHART_UI,
        };
      }

      return {
        title: "Price vs Quantity Ordered",
        type: "scatter",
        labels: [],
        datasets: [],
        scatterData: [{
          label: "Items",
          color: "#818cf8",
          points: limited.map((code) => ({
            x: Math.round(priceMap[code]),
            y: Math.round(qtyMap[code]),
            label: code,
          })),
        }],
        xAxisLabel: "Selling Price (€)",
        yAxisLabel: "Total Qty Ordered",
        _meta: CHART_UI,
      };
    },
  },

  // ── KPI: Revenue MTD ────────────────────────────────────────────────────

  {
    name: "erpnext_kpi_revenue",
    _meta: KPI_UI,
    description:
      "KPI card: total Sales Order revenue for the current month, " +
      "with delta % vs previous month and sparkline of last 6 months.",
    category: "analytics",
    inputSchema: { type: "object", properties: {} },
    handler: async (_input, ctx) => {
      const now = new Date();
      // Single API call: fetch all orders from 6 months ago to today
      const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      const sinceStr = sixMonthsAgo.toISOString().split("T")[0];

      const allOrders = await ctx.client.list("Sales Order", {
        fields: ["grand_total", "transaction_date"],
        filters: [
          ["transaction_date", ">=", sinceStr],
          ["docstatus", "!=", 2],
        ],
        limit: 5000,
      });

      // Bucket into 6 monthly bins
      const sparkline: number[] = [0, 0, 0, 0, 0, 0];
      for (const o of allOrders) {
        const d = new Date(o.transaction_date as string);
        // Month index: 0 = oldest (5 months ago), 5 = current month
        const monthDiff = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
        const idx = 5 - monthDiff;
        if (idx >= 0 && idx < 6) {
          sparkline[idx] += Number(o.grand_total) || 0;
        }
      }

      const currentTotal = sparkline[5];
      const prevTotal = sparkline[4];

      const delta = prevTotal > 0
        ? ((currentTotal - prevTotal) / prevTotal) * 100
        : 0;

      return {
        label: "Revenue MTD",
        value: currentTotal,
        currency: "EUR",
        delta: Math.round(delta * 10) / 10,
        deltaLabel: "vs last month",
        trend: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
        trendIsGood: true,
        sparkline,
        color: "#60a5fa",
        _meta: KPI_UI,
      };
    },
  },

  // ── KPI: Outstanding Receivables ────────────────────────────────────────

  {
    name: "erpnext_kpi_outstanding",
    _meta: KPI_UI,
    description:
      "KPI card: total outstanding receivables from submitted Sales Invoices " +
      "with outstanding_amount > 0. Shows count of open invoices.",
    category: "analytics",
    inputSchema: { type: "object", properties: {} },
    handler: async (_input, ctx) => {
      const invoices = await ctx.client.list("Sales Invoice", {
        fields: ["outstanding_amount"],
        filters: [
          ["outstanding_amount", ">", 0],
          ["docstatus", "=", 1],
        ],
        limit: 1000,
      });

      const total = invoices.reduce(
        (sum, inv) => sum + (Number(inv.outstanding_amount) || 0), 0,
      );
      const count = invoices.length;

      return {
        label: "Outstanding Receivables",
        value: total,
        formattedValue: `${count} inv. / ${total.toLocaleString("en-US", { style: "currency", currency: "EUR" })}`,
        currency: "EUR",
        trend: total > 0 ? "up" : "flat",
        trendIsGood: false,
        color: "#fbbf24",
        _meta: KPI_UI,
      };
    },
  },

  // ── KPI: Orders This Month ──────────────────────────────────────────────

  {
    name: "erpnext_kpi_orders",
    _meta: KPI_UI,
    description:
      "KPI card: count and total value of Sales Orders created this month, " +
      "with delta % vs last month.",
    category: "analytics",
    inputSchema: { type: "object", properties: {} },
    handler: async (_input, ctx) => {
      const now = new Date();
      const thisMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      const lastMonthStartStr = lastMonthStart.toISOString().split("T")[0];
      const lastMonthEndStr = lastMonthEnd.toISOString().split("T")[0];

      const currentOrders = await ctx.client.list("Sales Order", {
        fields: ["grand_total"],
        filters: [
          ["transaction_date", ">=", thisMonthStart],
          ["docstatus", "!=", 2],
        ],
        limit: 1000,
      });
      const currentCount = currentOrders.length;

      const prevOrders = await ctx.client.list("Sales Order", {
        fields: ["grand_total"],
        filters: [
          ["transaction_date", ">=", lastMonthStartStr],
          ["transaction_date", "<=", lastMonthEndStr],
          ["docstatus", "!=", 2],
        ],
        limit: 1000,
      });
      const prevCount = prevOrders.length;

      const delta = prevCount > 0
        ? ((currentCount - prevCount) / prevCount) * 100
        : 0;

      return {
        label: "Orders This Month",
        value: currentCount,
        formattedValue: `${currentCount} orders`,
        unit: "orders",
        delta: Math.round(delta * 10) / 10,
        deltaLabel: "vs last month",
        trend: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
        trendIsGood: true,
        color: "#4ade80",
        _meta: KPI_UI,
      };
    },
  },

  // ── KPI: Gross Margin ──────────────────────────────────────────────────

  {
    name: "erpnext_kpi_gross_margin",
    _meta: KPI_UI,
    description:
      "KPI card: estimated gross margin % based on Sales Order revenue vs " +
      "valuation rate from stock (Bin). Margin = (revenue - cost) / revenue * 100.",
    category: "analytics",
    inputSchema: { type: "object", properties: {} },
    handler: async (_input, ctx) => {
      // Revenue from Sales Order Items (all non-cancelled)
      const soItems = await ctx.client.list("Sales Order Item", {
        fields: ["item_code", "qty", "amount"],
        filters: [
          ["docstatus", "!=", 2],
        ],
        limit: 1000,
      });

      const revenue = soItems.reduce(
        (sum, row) => sum + (Number(row.amount) || 0), 0,
      );

      // Cost from Bin valuation_rate * qty sold
      const itemQty: Record<string, number> = {};
      for (const row of soItems) {
        const code = row.item_code as string;
        itemQty[code] = (itemQty[code] ?? 0) + (Number(row.qty) || 0);
      }

      // Fetch valuation rates
      const bins = await ctx.client.list("Bin", {
        fields: ["item_code", "valuation_rate"],
        filters: [["valuation_rate", ">", 0]],
        limit: 500,
      });

      const valMap: Record<string, number> = {};
      for (const bin of bins) {
        const code = bin.item_code as string;
        if (!valMap[code]) {
          valMap[code] = Number(bin.valuation_rate) || 0;
        }
      }

      let cost = 0;
      for (const [code, qty] of Object.entries(itemQty)) {
        if (valMap[code]) {
          cost += valMap[code] * qty;
        }
      }

      const margin = revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0;

      return {
        label: "Gross Margin",
        value: Math.round(margin * 10) / 10,
        unit: "%",
        trend: margin >= 30 ? "up" : margin >= 15 ? "flat" : "down",
        trendIsGood: true,
        color: "#c084fc",
        _meta: KPI_UI,
      };
    },
  },

  // ── KPI: Overdue Invoices ──────────────────────────────────────────────

  {
    name: "erpnext_kpi_overdue",
    _meta: KPI_UI,
    description:
      "KPI card: count and total value of overdue Sales Invoices " +
      "(due_date < today, outstanding_amount > 0, submitted).",
    category: "analytics",
    inputSchema: { type: "object", properties: {} },
    handler: async (_input, ctx) => {
      const today = new Date().toISOString().split("T")[0];

      const invoices = await ctx.client.list("Sales Invoice", {
        fields: ["outstanding_amount", "due_date"],
        filters: [
          ["due_date", "<", today],
          ["outstanding_amount", ">", 0],
          ["docstatus", "=", 1],
        ],
        limit: 1000,
      });

      const count = invoices.length;
      const total = invoices.reduce(
        (sum, inv) => sum + (Number(inv.outstanding_amount) || 0), 0,
      );

      return {
        label: "Overdue Invoices",
        value: count,
        formattedValue: `${count} inv. / ${total.toLocaleString("en-US", { style: "currency", currency: "EUR" })}`,
        trend: count > 0 ? "up" : "flat",
        trendIsGood: false,
        color: "#f87171",
        _meta: KPI_UI,
      };
    },
  },

  // ── Sales Funnel ──────────────────────────────────────────────────────────

  {
    name: "erpnext_sales_funnel",
    _meta: FUNNEL_UI,
    description:
      "Sales funnel from Lead → Opportunity → Quotation → Sales Order. " +
      "Shows count and value at each stage with conversion rates between stages.",
    category: "analytics",
    inputSchema: {
      type: "object",
      properties: {
        period: {
          type: "string",
          enum: ["this_month", "this_quarter", "this_year", "all"],
          description: "Time period (default: all)",
        },
      },
    },
    handler: async (_input, ctx) => {
      const period = (_input.period as string) ?? "all";
      const now = new Date();
      let sinceDate: string | null = null;
      if (period === "this_month") {
        sinceDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      } else if (period === "this_quarter") {
        const qMonth = Math.floor(now.getMonth() / 3) * 3 + 1;
        sinceDate = `${now.getFullYear()}-${String(qMonth).padStart(2, "0")}-01`;
      } else if (period === "this_year") {
        sinceDate = `${now.getFullYear()}-01-01`;
      }

      // Leads use "creation", the rest use "transaction_date"
      const leadFilters: FrappeFilter[] = sinceDate ? [["creation", ">=", sinceDate]] : [];
      const txnFilters: FrappeFilter[] = sinceDate ? [["transaction_date", ">=", sinceDate]] : [];
      const submittedTxnFilters: FrappeFilter[] = [
        ...txnFilters,
        ["docstatus", "!=", 2],
      ];

      const leads = await ctx.client.list("Lead", {
        fields: ["name"],
        filters: leadFilters,
        limit: 500,
      });

      const opps = await ctx.client.list("Opportunity", {
        fields: ["name", "opportunity_amount"],
        filters: txnFilters,
        limit: 500,
      });

      const quots = await ctx.client.list("Quotation", {
        fields: ["name", "grand_total"],
        filters: submittedTxnFilters,
        limit: 500,
      });

      const orders = await ctx.client.list("Sales Order", {
        fields: ["name", "grand_total"],
        filters: submittedTxnFilters,
        limit: 500,
      });

      const stages = [
        {
          label: "Leads",
          count: leads.length,
          color: "#818cf8",
        },
        {
          label: "Opportunities",
          count: opps.length,
          value: opps.reduce((s, o) => s + (Number(o.opportunity_amount) || 0), 0),
          color: "#60a5fa",
          conversionRate: leads.length > 0
            ? Math.round((opps.length / leads.length) * 100)
            : 0,
        },
        {
          label: "Quotations",
          count: quots.length,
          value: quots.reduce((s, q) => s + (Number(q.grand_total) || 0), 0),
          color: "#4ade80",
          conversionRate: opps.length > 0
            ? Math.round((quots.length / opps.length) * 100)
            : 0,
        },
        {
          label: "Orders",
          count: orders.length,
          value: orders.reduce((s, o) => s + (Number(o.grand_total) || 0), 0),
          color: "#fbbf24",
          conversionRate: quots.length > 0
            ? Math.round((orders.length / quots.length) * 100)
            : 0,
        },
      ];

      const periodLabels: Record<string, string> = {
        this_month: "This Month",
        this_quarter: "This Quarter",
        this_year: "This Year",
        all: "All Time",
      };

      return {
        title: "Sales Funnel",
        subtitle: periodLabels[period] ?? "All Time",
        stages,
        currency: "EUR",
        _meta: FUNNEL_UI,
      };
    },
  },

  // ── AR Aging ──────────────────────────────────────────────────────────────

  {
    name: "erpnext_ar_aging",
    _meta: CHART_UI,
    description:
      "Accounts Receivable Aging — stacked bar showing outstanding invoices by customer, " +
      "grouped into aging buckets (0-30, 31-60, 61-90, 90+ days). " +
      "Shows who owes you money and for how long.",
    category: "analytics",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Top N customers (default 10)" },
        type: {
          type: "string",
          enum: ["stacked-bar", "horizontal-bar", "treemap"],
          description: "Chart type (default: stacked-bar)",
        },
      },
    },
    handler: async (input, ctx) => {
      const limit = (input.limit as number) ?? 10;
      const chartType = (input.type as string) ?? "stacked-bar";

      const invoices = await ctx.client.list("Sales Invoice", {
        fields: ["customer_name", "outstanding_amount", "due_date", "posting_date"],
        filters: [["outstanding_amount", ">", 0], ["docstatus", "=", 1]],
        limit: 500,
        order_by: "outstanding_amount desc",
      });

      const today = new Date();
      const BUCKETS = [
        { label: "0-30 days", min: 0, max: 30, color: "#4ade80" },
        { label: "31-60 days", min: 31, max: 60, color: "#fbbf24" },
        { label: "61-90 days", min: 61, max: 90, color: "#fb923c" },
        { label: "90+ days", min: 91, max: 99999, color: "#f87171" },
      ];

      // Group by customer + aging bucket
      const byCustomer: Record<string, number[]> = {};
      for (const inv of invoices) {
        const customer = (inv.customer_name as string) ?? "Unknown";
        const dateStr = (inv.due_date as string) ?? (inv.posting_date as string);
        const dueDate = dateStr ? new Date(dateStr) : today;
        const agingDays = Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / 86400000));

        if (!byCustomer[customer]) byCustomer[customer] = new Array(BUCKETS.length).fill(0);

        const bucketIdx = BUCKETS.findIndex((b) => agingDays >= b.min && agingDays <= b.max);
        if (bucketIdx >= 0) {
          byCustomer[customer][bucketIdx] += Number(inv.outstanding_amount) || 0;
        }
      }

      // Sort by total outstanding, take top N
      const sorted = Object.entries(byCustomer)
        .map(([name, buckets]) => ({ name, buckets, total: buckets.reduce((s, v) => s + v, 0) }))
        .sort((a, b) => b.total - a.total)
        .slice(0, limit);

      if (chartType === "treemap") {
        const COLORS = ["#60a5fa", "#4ade80", "#fbbf24", "#818cf8", "#c084fc", "#fb923c", "#34d399", "#f472b6", "#a78bfa", "#f97316"];
        return {
          title: "Accounts Receivable by Customer",
          type: "treemap",
          labels: [],
          datasets: [],
          treeData: sorted.map(({ name, total }, i) => ({
            name: name.length > 20 ? name.slice(0, 18) + "..." : name,
            value: Math.round(total),
            color: COLORS[i % COLORS.length],
          })),
          currency: "EUR",
          _meta: CHART_UI,
        };
      }

      // stacked-bar or horizontal-bar
      const customers = sorted.map(({ name }) => name);
      return {
        title: "Accounts Receivable Aging",
        subtitle: `Top ${customers.length} customers`,
        type: chartType,
        labels: customers,
        datasets: BUCKETS.map((bucket, bi) => ({
          label: bucket.label,
          values: sorted.map(({ buckets }) => buckets[bi]),
          color: bucket.color,
          stack: "aging",
        })),
        currency: "EUR",
        xAxisLabel: "Customer",
        yAxisLabel: "Outstanding Amount",
        _meta: CHART_UI,
      };
    },
  },

  // ── Gross Profit ──────────────────────────────────────────────────────────

  {
    name: "erpnext_gross_profit",
    _meta: CHART_UI,
    description:
      "Gross profit analysis — composed chart showing revenue (bars) vs margin % (line) by item or customer. " +
      "Uses Sales Invoice Item for revenue and Bin valuation_rate for cost estimation.",
    category: "analytics",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Top N entries (default 10)" },
        group_by: {
          type: "string",
          enum: ["item", "customer"],
          description: "Group by item or customer (default: item)",
        },
      },
    },
    handler: async (input, ctx) => {
      const limit = (input.limit as number) ?? 10;
      const groupBy = (input.group_by as string) ?? "item";

      // Fetch submitted Sales Invoice Items for revenue
      const siItems = await ctx.client.list("Sales Invoice Item", {
        fields: ["parent", "item_code", "item_name", "amount", "qty"],
        filters: [["docstatus", "=", 1]],
        limit: 500,
        order_by: "amount desc",
      });

      // Fetch Bin for valuation_rate (cost per unit)
      const bins = await ctx.client.list("Bin", {
        fields: ["item_code", "valuation_rate"],
        filters: [["valuation_rate", ">", 0]],
        limit: 500,
      });

      const costMap: Record<string, number> = {};
      for (const bin of bins) {
        const code = bin.item_code as string;
        // Keep highest valuation_rate if multiple warehouses
        costMap[code] = Math.max(costMap[code] ?? 0, Number(bin.valuation_rate) || 0);
      }

      if (groupBy === "customer") {
        // Fetch invoices to map parent invoice name to customer
        const invoices = await ctx.client.list("Sales Invoice", {
          fields: ["name", "customer_name"],
          filters: [["docstatus", "=", 1]],
          limit: 500,
        });

        const custMap: Record<string, string> = {};
        for (const inv of invoices) {
          custMap[inv.name as string] = (inv.customer_name as string) ?? "Unknown";
        }

        const byCustomer: Record<string, { revenue: number; cost: number }> = {};
        for (const row of siItems) {
          const customer = custMap[row.parent as string] ?? "Unknown";
          if (!byCustomer[customer]) byCustomer[customer] = { revenue: 0, cost: 0 };
          const qty = Number(row.qty) || 0;
          const unitCost = costMap[row.item_code as string] ?? 0;
          byCustomer[customer].revenue += Number(row.amount) || 0;
          byCustomer[customer].cost += qty * unitCost;
        }

        const sorted = Object.entries(byCustomer)
          .sort(([, a], [, b]) => b.revenue - a.revenue)
          .slice(0, limit);

        const labels = sorted.map(([name]) => name);
        const revenues = sorted.map(([, { revenue }]) => Math.round(revenue));
        const margins = sorted.map(([, { revenue, cost }]) =>
          revenue > 0 ? Math.round(((revenue - cost) / revenue) * 10000) / 100 : 0
        );

        return {
          title: "Gross Profit by Customer",
          subtitle: `Top ${labels.length} customers`,
          type: "composed",
          labels,
          datasets: [
            { label: "Revenue", values: revenues, color: "#60a5fa", type: "bar" as const },
            { label: "Margin %", values: margins, color: "#4ade80", type: "line" as const, yAxisId: "right" as const, showDots: true },
          ],
          showRightAxis: true,
          currency: "EUR",
          yAxisLabel: "Revenue",
          rightAxisLabel: "Margin %",
          _meta: CHART_UI,
        };
      }

      // Default: group by item
      const byItem: Record<string, { name: string; revenue: number; cost: number }> = {};
      for (const row of siItems) {
        const code = (row.item_code as string) ?? "Unknown";
        if (!byItem[code]) byItem[code] = { name: (row.item_name as string) ?? code, revenue: 0, cost: 0 };
        const qty = Number(row.qty) || 0;
        const unitCost = costMap[code] ?? 0;
        byItem[code].revenue += Number(row.amount) || 0;
        byItem[code].cost += qty * unitCost;
      }

      const sorted = Object.entries(byItem)
        .sort(([, a], [, b]) => b.revenue - a.revenue)
        .slice(0, limit);

      const labels = sorted.map(([, { name }]) => name);
      const revenues = sorted.map(([, { revenue }]) => Math.round(revenue));
      const margins = sorted.map(([, { revenue, cost }]) =>
        revenue > 0 ? Math.round(((revenue - cost) / revenue) * 10000) / 100 : 0
      );

      return {
        title: "Gross Profit by Item",
        subtitle: `Top ${labels.length} items`,
        type: "composed",
        labels,
        datasets: [
          { label: "Revenue", values: revenues, color: "#60a5fa", type: "bar" as const },
          { label: "Margin %", values: margins, color: "#4ade80", type: "line" as const, yAxisId: "right" as const, showDots: true },
        ],
        showRightAxis: true,
        currency: "EUR",
        yAxisLabel: "Revenue",
        rightAxisLabel: "Margin %",
        _meta: CHART_UI,
      };
    },
  },

  // ── Profit & Loss ─────────────────────────────────────────────────────────

  {
    name: "erpnext_profit_loss",
    _meta: CHART_UI,
    description:
      "Profit & Loss overview — bar chart comparing total income vs total expenses per month " +
      "from Sales Orders (income) and Purchase Orders (expenses). " +
      "Shows net profit line. Use type='composed' for bar+line.",
    category: "analytics",
    inputSchema: {
      type: "object",
      properties: {
        months: { type: "number", description: "How many months back (default 6)" },
        type: {
          type: "string",
          enum: ["bar", "stacked-bar", "composed"],
          description: "Chart type (default: composed)",
        },
      },
    },
    handler: async (input, ctx) => {
      const monthsBack = (input.months as number) ?? 6;
      const chartType = (input.type as string) ?? "composed";

      const now = new Date();
      const startDate = new Date(now.getFullYear(), now.getMonth() - monthsBack + 1, 1);
      const startStr = startDate.toISOString().split("T")[0];

      // Fetch Sales Orders (income) — submitted only
      const salesOrders = await ctx.client.list("Sales Order", {
        fields: ["grand_total", "transaction_date"],
        filters: [["transaction_date", ">=", startStr], ["docstatus", "=", 1]],
        limit: 1000,
        order_by: "transaction_date asc",
      });

      // Fetch Purchase Orders (expenses) — submitted only
      const purchaseOrders = await ctx.client.list("Purchase Order", {
        fields: ["grand_total", "transaction_date"],
        filters: [["transaction_date", ">=", startStr], ["docstatus", "=", 1]],
        limit: 1000,
        order_by: "transaction_date asc",
      });

      // Build month labels
      const months: string[] = [];
      for (let m = 0; m < monthsBack; m++) {
        const d = new Date(now.getFullYear(), now.getMonth() - monthsBack + 1 + m, 1);
        months.push(`${d.toLocaleString("en", { month: "short" })} ${d.getFullYear().toString().slice(2)}`);
      }

      // Aggregate by month
      const income = new Array(monthsBack).fill(0) as number[];
      const expenses = new Array(monthsBack).fill(0) as number[];

      for (const so of salesOrders) {
        const d = new Date(so.transaction_date as string);
        const mIdx = (d.getFullYear() - startDate.getFullYear()) * 12 + d.getMonth() - startDate.getMonth();
        if (mIdx >= 0 && mIdx < monthsBack) {
          income[mIdx] += Number(so.grand_total) || 0;
        }
      }

      for (const po of purchaseOrders) {
        const d = new Date(po.transaction_date as string);
        const mIdx = (d.getFullYear() - startDate.getFullYear()) * 12 + d.getMonth() - startDate.getMonth();
        if (mIdx >= 0 && mIdx < monthsBack) {
          expenses[mIdx] += Number(po.grand_total) || 0;
        }
      }

      const netProfit = income.map((inc, i) => Math.round(inc - expenses[i]));

      // deno-lint-ignore no-explicit-any
      const datasets: any[] = [
        { label: "Income", values: income.map((v) => Math.round(v)), color: "#4ade80", type: "bar" },
        { label: "Expenses", values: expenses.map((v) => Math.round(v)), color: "#f87171", type: "bar" },
      ];

      if (chartType === "composed") {
        datasets.push({
          label: "Net Profit",
          values: netProfit,
          color: "#60a5fa",
          type: "line",
          yAxisId: "right",
          showDots: true,
        });
      }

      return {
        title: "Profit & Loss",
        subtitle: `Last ${monthsBack} months`,
        type: chartType,
        labels: months,
        datasets,
        ...(chartType === "composed" ? { showRightAxis: true, rightAxisLabel: "Net Profit" } : {}),
        currency: "EUR",
        yAxisLabel: "Amount",
        _meta: CHART_UI,
      };
    },
  },

  // ── Purchase Pipeline ─────────────────────────────────────────────────────

  {
    name: "erpnext_purchase_pipeline",
    _meta: PIPELINE_UI,
    description:
      "Purchase Orders grouped by status as a kanban pipeline. " +
      "Shows columns (Draft, To Receive, To Bill, Completed, Cancelled) " +
      "with order count, total value, and individual order cards.",
    category: "analytics",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max POs (default 200)" },
        supplier: { type: "string", description: "Filter by supplier name" },
      },
    },
    handler: async (input, ctx) => {
      const limit = (input.limit as number) ?? 200;
      const filters: FrappeFilter[] = [];

      if (input.supplier) {
        filters.push(["supplier_name", "=", input.supplier as string]);
      }

      const orders = await ctx.client.list("Purchase Order", {
        fields: [
          "name",
          "supplier",
          "supplier_name",
          "status",
          "grand_total",
          "transaction_date",
          "schedule_date",
        ],
        filters,
        limit,
        order_by: "modified desc",
      });

      const STATUS_MAP: Record<string, { label: string; color: string }> = {
        "Draft":                { label: "Draft",           color: "#78716c" },
        "To Receive and Bill":  { label: "To Receive",      color: "#60a5fa" },
        "To Receive":           { label: "To Receive Only", color: "#fbbf24" },
        "To Bill":              { label: "To Bill",         color: "#c084fc" },
        "Completed":            { label: "Completed",       color: "#4ade80" },
        "Cancelled":            { label: "Cancelled",       color: "#f87171" },
      };

      const grouped: Record<string, typeof orders> = {};
      for (const order of orders) {
        const status = (order.status as string) ?? "Draft";
        if (!grouped[status]) grouped[status] = [];
        grouped[status].push(order);
      }

      const columns = Object.entries(STATUS_MAP)
        .filter(([status]) => grouped[status]?.length > 0)
        .map(([status, { label, color }]) => {
          const statusOrders = grouped[status] ?? [];
          return {
            status,
            label,
            color,
            count: statusOrders.length,
            total: statusOrders.reduce((sum, o) => sum + (Number(o.grand_total) || 0), 0),
            orders: statusOrders.map((o) => ({
              name: o.name,
              customer: (o.supplier_name ?? o.supplier) as string,
              amount: Number(o.grand_total) || 0,
              date: o.transaction_date as string,
              delivery_date: o.schedule_date as string | undefined,
            })),
          };
        });

      return {
        title: "Purchase Order Pipeline",
        currency: "EUR",
        generatedAt: new Date().toISOString(),
        columns,
        _meta: PIPELINE_UI,
      };
    },
  },
];
