/**
 * Viewer metadata constants — single source of truth for tool → viewer binding.
 *
 * Uses uiMeta() from @casys/mcp-server (re-exported from @casys/mcp-compose/sdk)
 * to build typed _meta objects with full MCP Apps support.
 *
 * @module lib/erpnext/tools/viewer-meta
 */

import { uiMeta } from "@casys/mcp-server";

const viewer = (name: string) => uiMeta({ resourceUri: `ui://mcp-erpnext/${name}` })._meta;

export const DOCLIST_META = viewer("doclist-viewer");
export const INVOICE_META = viewer("invoice-viewer");
export const STOCK_META = viewer("stock-viewer");
export const CHART_META = viewer("chart-viewer");
export const KANBAN_META = viewer("kanban-viewer");
export const KPI_META = viewer("kpi-viewer");
export const FUNNEL_META = viewer("funnel-viewer");
