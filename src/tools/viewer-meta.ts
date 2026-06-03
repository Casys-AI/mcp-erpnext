/**
 * Viewer metadata constants — single source of truth for tool → viewer binding.
 *
 * Builds the MCP Apps `_meta.ui` object that binds each tool to its viewer
 * resource. Inlined (no `@casys/mcp-compose` dependency) — only `resourceUri`
 * is needed here. Add standard MCP Apps fields (`visibility`, `csp`, …) inline
 * if required; cross-UI sync fields (`emits`/`accepts`) belong to mcp-compose
 * and are only relevant for synchronized multi-UI dashboards.
 *
 * @module lib/erpnext/tools/viewer-meta
 */

import type { MCPToolMeta } from "@casys/mcp-server";

const viewer = (name: string): MCPToolMeta => ({
  ui: { resourceUri: `ui://mcp-erpnext/${name}` },
});

export const DOCLIST_META = viewer("doclist-viewer");
export const INVOICE_META = viewer("invoice-viewer");
export const STOCK_META = viewer("stock-viewer");
export const CHART_META = viewer("chart-viewer");
export const KANBAN_META = viewer("kanban-viewer");
export const KPI_META = viewer("kpi-viewer");
export const FUNNEL_META = viewer("funnel-viewer");
