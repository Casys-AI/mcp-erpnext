/**
 * Viewer metadata constants — single source of truth for tool → viewer binding.
 *
 * Uses uiMeta() from @casys/mcp-server to build _meta objects.
 * These are used on tool definitions and handler return values.
 *
 * @module lib/erpnext/tools/viewer-meta
 */

import { uiMeta } from "@casys/mcp-server";

const ui = (viewer: string) => uiMeta({ resourceUri: `ui://mcp-erpnext/${viewer}` })._meta;

export const DOCLIST_META = ui("doclist-viewer");
export const INVOICE_META = ui("invoice-viewer");
export const STOCK_META = ui("stock-viewer");
export const CHART_META = ui("chart-viewer");
export const KANBAN_META = ui("kanban-viewer");
export const KPI_META = ui("kpi-viewer");
export const FUNNEL_META = ui("funnel-viewer");
