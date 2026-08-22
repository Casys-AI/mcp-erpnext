import type { NavHint } from "../../shared/jumps.ts";
import type { UiRefreshRequestData } from "~/shared/refresh";

export interface InvoiceItem {
  item_code: string;
  item_name?: string;
  qty: number;
  rate: number;
  amount: number;
}

export interface InvoiceData {
  /** Les sauts de la pièce (paiements, tiers, article, stock) — posés par le serveur. */
  _sendMessageHints?: NavHint[];
  name: string;
  customer?: string;
  customer_name?: string;
  supplier?: string;
  supplier_name?: string;
  company?: string;
  posting_date: string;
  due_date?: string;
  status: string;
  docstatus?: number;
  grand_total: number;
  net_total?: number;
  total_taxes_and_charges?: number;
  outstanding_amount?: number;
  currency?: string;
  items?: InvoiceItem[];
  contact_email?: string;
  address_display?: string;
}

export interface InvoicePayload {
  data?: InvoiceData;
  refreshRequest?: UiRefreshRequestData;
  [key: string]: unknown;
}

export interface ItemRecord {
  item_name?: unknown;
  item_group?: unknown;
  stock_uom?: unknown;
  standard_rate?: unknown;
  [key: string]: unknown;
}

export interface StockRow {
  warehouse?: unknown;
  actual_qty?: unknown;
  [key: string]: unknown;
}
