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

/** A single Frappe document (any DocType) */
export interface FrappeDoc {
  name: string;
  doctype?: string;
  owner?: string;
  creation?: string;
  modified?: string;
  modified_by?: string;
  docstatus?: 0 | 1 | 2; // 0=Draft, 1=Submitted, 2=Cancelled
  [key: string]: unknown;
}

/** Frappe list API response */
export interface FrappeListResponse<T extends FrappeDoc = FrappeDoc> {
  data: T[];
}

/** Frappe single doc response */
export interface FrappeDocResponse<T extends FrappeDoc = FrappeDoc> {
  data: T;
}

/** Frappe method call response */
export interface FrappeMethodResponse<T = unknown> {
  message: T;
}

/** Frappe error response */
export interface FrappeErrorResponse {
  exc_type?: string;
  exc?: string;
  _server_messages?: string;
  message?: string;
}

/** Frappe list filter: [field, operator, value] */
export type FrappeFilter = [string, string, string | number | boolean | null];

/** Options for list queries */
export interface FrappeListOptions {
  fields?: string[];
  filters?: FrappeFilter[];
  order_by?: string;
  limit?: number;
  limit_start?: number;
  as_dict?: boolean;
}

// ============================================================================
// Common DocType shapes (partial — only the fields we expose in tools)
// ============================================================================

export interface ErpCustomer extends FrappeDoc {
  customer_name: string;
  customer_type?: string;
  customer_group?: string;
  territory?: string;
  mobile_no?: string;
  email_id?: string;
  disabled?: 0 | 1;
}

export interface ErpSupplier extends FrappeDoc {
  supplier_name: string;
  supplier_type?: string;
  supplier_group?: string;
  mobile_no?: string;
  email_id?: string;
  disabled?: 0 | 1;
}

export interface ErpSalesOrderItem {
  item_code: string;
  item_name?: string;
  description?: string;
  qty: number;
  uom?: string;
  rate: number;
  amount: number;
  delivery_date?: string;
}

export interface ErpSalesOrder extends FrappeDoc {
  customer: string;
  transaction_date: string;
  delivery_date?: string;
  status?: string;
  grand_total: number;
  currency?: string;
  items?: ErpSalesOrderItem[];
}

export interface ErpSalesInvoiceItem {
  item_code: string;
  item_name?: string;
  qty: number;
  rate: number;
  amount: number;
  income_account?: string;
}

export interface ErpSalesInvoice extends FrappeDoc {
  customer: string;
  posting_date: string;
  due_date?: string;
  status?: string;
  grand_total: number;
  outstanding_amount?: number;
  currency?: string;
  items?: ErpSalesInvoiceItem[];
}

export interface ErpPurchaseOrder extends FrappeDoc {
  supplier: string;
  transaction_date: string;
  schedule_date?: string;
  status?: string;
  grand_total: number;
  currency?: string;
}

export interface ErpPurchaseInvoice extends FrappeDoc {
  supplier: string;
  posting_date: string;
  due_date?: string;
  status?: string;
  grand_total: number;
  outstanding_amount?: number;
  currency?: string;
}

export interface ErpItem extends FrappeDoc {
  item_code: string;
  item_name: string;
  item_group?: string;
  description?: string;
  uom?: string;
  is_stock_item?: 0 | 1;
  standard_rate?: number;
  disabled?: 0 | 1;
}

export interface ErpWarehouse extends FrappeDoc {
  warehouse_name: string;
  warehouse_type?: string;
  company?: string;
  disabled?: 0 | 1;
}

export interface ErpBin extends FrappeDoc {
  item_code: string;
  warehouse: string;
  actual_qty: number;
  reserved_qty?: number;
  ordered_qty?: number;
  projected_qty?: number;
  valuation_rate?: number;
  stock_value?: number;
}

export interface ErpStockEntry extends FrappeDoc {
  stock_entry_type: string;
  posting_date: string;
  from_warehouse?: string;
  to_warehouse?: string;
  total_amount?: number;
}

export interface ErpJournalEntry extends FrappeDoc {
  voucher_type: string;
  posting_date: string;
  total_debit: number;
  total_credit: number;
  remark?: string;
}

export interface ErpPaymentEntry extends FrappeDoc {
  payment_type: string;
  party_type: string;
  party: string;
  posting_date: string;
  paid_amount: number;
  currency?: string;
}

export interface ErpEmployee extends FrappeDoc {
  employee_name: string;
  designation?: string;
  department?: string;
  company?: string;
  date_of_joining?: string;
  status?: string;
  cell_number?: string;
}

export interface ErpProject extends FrappeDoc {
  project_name: string;
  status?: string;
  percent_complete?: number;
  expected_start_date?: string;
  expected_end_date?: string;
  estimated_costing?: number;
  total_billed_amount?: number;
}

export interface ErpTask extends FrappeDoc {
  subject: string;
  project?: string;
  status?: string;
  priority?: string;
  exp_start_date?: string;
  exp_end_date?: string;
  progress?: number;
}
