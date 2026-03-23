/**
 * Viewer URI constants — single source of truth for tool → viewer binding.
 *
 * These objects are used as `_meta` values on tool definitions and handler
 * return values to bind them to a specific UI viewer resource.
 *
 * @module lib/erpnext/tools/viewer-meta
 */

export const DOCLIST_META = { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } };
export const INVOICE_META = { ui: { resourceUri: "ui://mcp-erpnext/invoice-viewer" } };
export const STOCK_META = { ui: { resourceUri: "ui://mcp-erpnext/stock-viewer" } };
export const CHART_META = { ui: { resourceUri: "ui://mcp-erpnext/chart-viewer" } };
export const KANBAN_META = { ui: { resourceUri: "ui://mcp-erpnext/kanban-viewer" } };
export const KPI_META = { ui: { resourceUri: "ui://mcp-erpnext/kpi-viewer" } };
export const FUNNEL_META = { ui: { resourceUri: "ui://mcp-erpnext/funnel-viewer" } };
