/**
 * Frappe REST API Types
 *
 * Core type definitions for the Frappe/ERPNext REST API.
 * Covers document responses, list responses, error handling,
 * and common DocType field shapes.
 *
 * @module lib/erpnext/api/types
 */

// ============================================================================
// Core Frappe API shapes
// ============================================================================

/** A single Frappe document (any DocType). Base shape for all ERPNext records. */
export interface FrappeDoc {
  /** Unique document identifier (Frappe `name` field) */
  name: string;
  /** The DocType this document belongs to, e.g. "Sales Order" */
  doctype?: string;
  /** User who created the document */
  owner?: string;
  /** ISO datetime of document creation */
  creation?: string;
  /** ISO datetime of last modification */
  modified?: string;
  /** User who last modified the document */
  modified_by?: string;
  /** Document workflow status: 0 = Draft, 1 = Submitted, 2 = Cancelled */
  docstatus?: 0 | 1 | 2;
  /** Additional DocType-specific fields */
  [key: string]: unknown;
}

/** Frappe list API response wrapper. Returned by `GET /api/resource/{doctype}`. */
export interface FrappeListResponse<T extends FrappeDoc = FrappeDoc> {
  /** Array of documents matching the query */
  data: T[];
}

/** Frappe single document response wrapper. Returned by `GET /api/resource/{doctype}/{name}`. */
export interface FrappeDocResponse<T extends FrappeDoc = FrappeDoc> {
  /** The requested document */
  data: T;
}

/** Frappe whitelisted method call response. Returned by `POST /api/method/{method}`. */
export interface FrappeMethodResponse<T = unknown> {
  /** Return value of the server-side method */
  message: T;
}

/** Frappe error response body returned on HTTP 4xx/5xx. */
export interface FrappeErrorResponse {
  /** Python exception class name, e.g. "ValidationError" */
  exc_type?: string;
  /** Full Python traceback string */
  exc?: string;
  /** JSON-encoded array of user-facing server messages */
  _server_messages?: string;
  /** Human-readable error summary */
  message?: string;
}

/** Frappe list filter: [field, operator, value] */
export type FrappeFilter = [string, string, string | number | boolean | null];

/** Options for Frappe list queries (`GET /api/resource/{doctype}`). */
export interface FrappeListOptions {
  /** Fields to return, e.g. `["name", "customer_name", "grand_total"]`. Defaults to all. */
  fields?: string[];
  /** Frappe filters as `[field, operator, value]` tuples, e.g. `[["status", "=", "Active"]]` */
  filters?: FrappeFilter[];
  /** SQL ORDER BY clause, e.g. `"creation desc"` */
  order_by?: string;
  /** Maximum number of records to return (Frappe `limit_page_length`) */
  limit?: number;
  /** Offset for pagination (Frappe `limit_start`) */
  limit_start?: number;
  /** When true, return results as dictionaries instead of arrays */
  as_dict?: boolean;
}

// ============================================================================
// Common DocType shapes (partial — only the fields we expose in tools)
// ============================================================================

/** ERPNext Customer DocType (`Customer`). */
export interface ErpCustomer extends FrappeDoc {
  /** Full name of the customer */
  customer_name: string;
  /** "Company" or "Individual" */
  customer_type?: string;
  /** Customer Group link, e.g. "Commercial", "Individual" */
  customer_group?: string;
  /** Sales territory assignment */
  territory?: string;
  /** Primary mobile phone number */
  mobile_no?: string;
  /** Primary email address */
  email_id?: string;
  /** 1 if customer is disabled, 0 if active */
  disabled?: 0 | 1;
}

/** ERPNext Supplier DocType (`Supplier`). */
export interface ErpSupplier extends FrappeDoc {
  /** Full name of the supplier */
  supplier_name: string;
  /** "Company" or "Individual" */
  supplier_type?: string;
  /** Supplier Group link, e.g. "Raw Material", "Services" */
  supplier_group?: string;
  /** Primary mobile phone number */
  mobile_no?: string;
  /** Primary email address */
  email_id?: string;
  /** 1 if supplier is disabled, 0 if active */
  disabled?: 0 | 1;
}

/** Line item within an ERPNext Sales Order (`Sales Order Item` child table). */
export interface ErpSalesOrderItem {
  /** Item Code link (unique item identifier) */
  item_code: string;
  /** Human-readable item name */
  item_name?: string;
  /** Item description text */
  description?: string;
  /** Ordered quantity */
  qty: number;
  /** Unit of measure, e.g. "Nos", "Kg" */
  uom?: string;
  /** Price per unit in document currency */
  rate: number;
  /** Line total (qty x rate) in document currency */
  amount: number;
  /** Requested delivery date (ISO date string) */
  delivery_date?: string;
}

/** ERPNext Sales Order DocType (`Sales Order`). */
export interface ErpSalesOrder extends FrappeDoc {
  /** Customer link (Frappe `name` of the Customer document) */
  customer: string;
  /** Order date (ISO date string) */
  transaction_date: string;
  /** Expected delivery date (ISO date string) */
  delivery_date?: string;
  /** Workflow status, e.g. "Draft", "To Deliver and Bill", "Completed" */
  status?: string;
  /** Total order amount including taxes */
  grand_total: number;
  /** Currency code, e.g. "USD", "EUR" */
  currency?: string;
  /** Sales Order Item child table rows */
  items?: ErpSalesOrderItem[];
}

/** Line item within an ERPNext Sales Invoice (`Sales Invoice Item` child table). */
export interface ErpSalesInvoiceItem {
  /** Item Code link (unique item identifier) */
  item_code: string;
  /** Human-readable item name */
  item_name?: string;
  /** Invoiced quantity */
  qty: number;
  /** Price per unit in document currency */
  rate: number;
  /** Line total (qty x rate) in document currency */
  amount: number;
  /** GL income account for this line, e.g. "Sales - C" */
  income_account?: string;
}

/** ERPNext Sales Invoice DocType (`Sales Invoice`). */
export interface ErpSalesInvoice extends FrappeDoc {
  /** Customer link (Frappe `name` of the Customer document) */
  customer: string;
  /** Invoice posting date (ISO date string) */
  posting_date: string;
  /** Payment due date (ISO date string) */
  due_date?: string;
  /** Workflow status, e.g. "Draft", "Unpaid", "Paid", "Overdue" */
  status?: string;
  /** Total invoice amount including taxes */
  grand_total: number;
  /** Remaining unpaid amount */
  outstanding_amount?: number;
  /** Currency code, e.g. "USD", "EUR" */
  currency?: string;
  /** Sales Invoice Item child table rows */
  items?: ErpSalesInvoiceItem[];
}

/** ERPNext Purchase Order DocType (`Purchase Order`). */
export interface ErpPurchaseOrder extends FrappeDoc {
  /** Supplier link (Frappe `name` of the Supplier document) */
  supplier: string;
  /** Order date (ISO date string) */
  transaction_date: string;
  /** Expected delivery schedule date (ISO date string) */
  schedule_date?: string;
  /** Workflow status, e.g. "Draft", "To Receive and Bill", "Completed" */
  status?: string;
  /** Total order amount including taxes */
  grand_total: number;
  /** Currency code, e.g. "USD", "EUR" */
  currency?: string;
}

/** ERPNext Purchase Invoice DocType (`Purchase Invoice`). */
export interface ErpPurchaseInvoice extends FrappeDoc {
  /** Supplier link (Frappe `name` of the Supplier document) */
  supplier: string;
  /** Invoice posting date (ISO date string) */
  posting_date: string;
  /** Payment due date (ISO date string) */
  due_date?: string;
  /** Workflow status, e.g. "Draft", "Unpaid", "Paid", "Overdue" */
  status?: string;
  /** Total invoice amount including taxes */
  grand_total: number;
  /** Remaining unpaid amount */
  outstanding_amount?: number;
  /** Currency code, e.g. "USD", "EUR" */
  currency?: string;
}

/** ERPNext Item DocType (`Item`). Master record for products, services, and materials. */
export interface ErpItem extends FrappeDoc {
  /** Unique item identifier (e.g. "ITEM-00042") */
  item_code: string;
  /** Human-readable item name */
  item_name: string;
  /** Item Group link, e.g. "Raw Material", "Finished Goods" */
  item_group?: string;
  /** Free-text item description */
  description?: string;
  /** Default unit of measure, e.g. "Nos", "Kg", "Meter" */
  uom?: string;
  /** 1 if item is maintained in stock, 0 for non-stock/service items */
  is_stock_item?: 0 | 1;
  /** Default selling/buying rate */
  standard_rate?: number;
  /** 1 if item is disabled, 0 if active */
  disabled?: 0 | 1;
}

/** ERPNext Warehouse DocType (`Warehouse`). Storage location for stock items. */
export interface ErpWarehouse extends FrappeDoc {
  /** Human-readable warehouse name */
  warehouse_name: string;
  /** Warehouse type, e.g. "Stores", "Manufacturing", "Transit" */
  warehouse_type?: string;
  /** Company link this warehouse belongs to */
  company?: string;
  /** 1 if warehouse is disabled, 0 if active */
  disabled?: 0 | 1;
}

/** ERPNext Bin DocType (`Bin`). Real-time stock level per item per warehouse. */
export interface ErpBin extends FrappeDoc {
  /** Item Code link */
  item_code: string;
  /** Warehouse link */
  warehouse: string;
  /** Current physical quantity in stock */
  actual_qty: number;
  /** Quantity reserved against Sales Orders */
  reserved_qty?: number;
  /** Quantity on order from Purchase Orders */
  ordered_qty?: number;
  /** Projected quantity (actual - reserved + ordered) */
  projected_qty?: number;
  /** Weighted average valuation rate per unit */
  valuation_rate?: number;
  /** Total stock value (actual_qty x valuation_rate) */
  stock_value?: number;
}

/** ERPNext Stock Entry DocType (`Stock Entry`). Records stock movements between warehouses. */
export interface ErpStockEntry extends FrappeDoc {
  /** Type of stock movement, e.g. "Material Receipt", "Material Transfer", "Manufacture" */
  stock_entry_type: string;
  /** Posting date of the stock entry (ISO date string) */
  posting_date: string;
  /** Source warehouse link (for transfers and issues) */
  from_warehouse?: string;
  /** Target warehouse link (for receipts and transfers) */
  to_warehouse?: string;
  /** Total monetary amount of the stock entry */
  total_amount?: number;
}

/** ERPNext Journal Entry DocType (`Journal Entry`). General ledger accounting entry. */
export interface ErpJournalEntry extends FrappeDoc {
  /** Voucher type, e.g. "Journal Entry", "Bank Entry", "Cash Entry" */
  voucher_type: string;
  /** Posting date (ISO date string) */
  posting_date: string;
  /** Total debit amount across all accounts */
  total_debit: number;
  /** Total credit amount across all accounts (must equal total_debit) */
  total_credit: number;
  /** Free-text remark or narration */
  remark?: string;
}

/** ERPNext Payment Entry DocType (`Payment Entry`). Records incoming/outgoing payments. */
export interface ErpPaymentEntry extends FrappeDoc {
  /** "Receive", "Pay", or "Internal Transfer" */
  payment_type: string;
  /** Party DocType, e.g. "Customer", "Supplier", "Employee" */
  party_type: string;
  /** Party document name (links to Customer/Supplier/Employee) */
  party: string;
  /** Payment posting date (ISO date string) */
  posting_date: string;
  /** Amount paid in payment currency */
  paid_amount: number;
  /** Currency code, e.g. "USD", "EUR" */
  currency?: string;
}

/** ERPNext Employee DocType (`Employee`). HR master record. */
export interface ErpEmployee extends FrappeDoc {
  /** Full name of the employee */
  employee_name: string;
  /** Job title / designation, e.g. "Software Engineer" */
  designation?: string;
  /** Department link, e.g. "Engineering", "Sales" */
  department?: string;
  /** Company link this employee belongs to */
  company?: string;
  /** Date of joining (ISO date string) */
  date_of_joining?: string;
  /** Employment status, e.g. "Active", "Inactive", "Left" */
  status?: string;
  /** Mobile / cell phone number */
  cell_number?: string;
}

/** ERPNext Project DocType (`Project`). Project management master record. */
export interface ErpProject extends FrappeDoc {
  /** Human-readable project name */
  project_name: string;
  /** Project status, e.g. "Open", "Completed", "Cancelled" */
  status?: string;
  /** Completion percentage (0-100) */
  percent_complete?: number;
  /** Planned start date (ISO date string) */
  expected_start_date?: string;
  /** Planned end date (ISO date string) */
  expected_end_date?: string;
  /** Estimated project cost */
  estimated_costing?: number;
  /** Total amount billed to the customer so far */
  total_billed_amount?: number;
}

/** ERPNext Task DocType (`Task`). Individual task within a Project. */
export interface ErpTask extends FrappeDoc {
  /** Task title / subject line */
  subject: string;
  /** Parent Project link */
  project?: string;
  /** Task status, e.g. "Open", "Working", "Completed", "Cancelled" */
  status?: string;
  /** Priority level, e.g. "Low", "Medium", "High", "Urgent" */
  priority?: string;
  /** Expected start date (ISO date string) */
  exp_start_date?: string;
  /** Expected end date (ISO date string) */
  exp_end_date?: string;
  /** Completion percentage (0-100) */
  progress?: number;
}
