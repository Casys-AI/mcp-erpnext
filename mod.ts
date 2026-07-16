/**
 * MCP ERPNext Library
 *
 * MCP tools for ERPNext/Frappe ERP operations via the Frappe REST API.
 * Zero external dependencies — custom HTTP client using fetch().
 *
 * Tools available:
 *   Sales:       customer_list/get, sales_order_list/get/create, sales_invoice_list/get, quotation_list
 *   Inventory:   item_list/get, stock_balance, warehouse_list, stock_entry_list
 *   Accounting:  account_list, journal_entry_list/get, payment_entry_list,
 *                purchase_order_list, purchase_invoice_list
 *   HR:          employee_list/get, attendance_list, leave_application_list/create
 *   Project:     project_list/get, task_list/create, timesheet_list
 *
 * Usage:
 *   import { ErpNextToolsClient } from "@casys/mcp-erpnext";
 *
 *   const client = new ErpNextToolsClient();
 *   const result = await client.execute("erpnext_customer_list", { limit: 10 });
 *
 * @module lib/erpnext
 */

// Re-export client and tools
export {
  allTools,
  defaultClient,
  ErpNextToolsClient,
  getCategories,
  getToolByName,
  getToolsByCategory,
  toolsByCategory,
} from "./src/client.ts";

export type {
  ErpNextTool,
  ErpNextToolCategory,
  ErpNextToolsClientOptions,
  JSONSchema,
  MCPToolWireFormat,
} from "./src/client.ts";

// Re-export Frappe client (for direct use or DI in tests)
export {
  FrappeAPIError,
  FrappeClient,
  getFrappeClient,
  setFrappeClient,
} from "./src/api/frappe-client.ts";

export type { FrappeClientConfig } from "./src/api/frappe-client.ts";

// Re-export cache (for direct use or DI in tests)
export { getCache, setCache } from "./src/cache/cache.ts";
export { MemoryCache } from "./src/cache/memory.ts";
export { NoopCache } from "./src/cache/noop.ts";
export type { Cache } from "./src/cache/types.ts";
export { warmCache } from "./src/cache/warm.ts";

// Re-export link resolution helpers
export {
  resolveCustomer,
  resolveDynamicLink,
  resolveEmployee,
  resolveItem,
  resolveLink,
  resolveSupplier,
} from "./src/api/resolve.ts";

// Re-export API types
export type {
  ErpBin,
  ErpCustomer,
  ErpEmployee,
  ErpItem,
  ErpProject,
  ErpSalesInvoice,
  ErpSalesOrder,
  ErpTask,
  FrappeDoc,
  FrappeFile,
  FrappeFileUploadInput,
  FrappeFilter,
  FrappeListOptions,
} from "./src/api/types.ts";
