/**
 * Viewer metadata constants — single source of truth for tool → viewer binding.
 *
 * @module lib/erpnext/tools/viewer-meta
 */

const meta = (viewer: string) => ({ ui: { resourceUri: `ui://mcp-erpnext/${viewer}` } });

export const DOCLIST_META = meta("doclist-viewer");
export const INVOICE_META = meta("invoice-viewer");
export const STOCK_META = meta("stock-viewer");
export const CHART_META = meta("chart-viewer");
export const KANBAN_META = meta("kanban-viewer");
export const KPI_META = meta("kpi-viewer");
export const FUNNEL_META = meta("funnel-viewer");
