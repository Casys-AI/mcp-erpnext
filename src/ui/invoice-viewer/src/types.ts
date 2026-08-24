import type { NavHint } from "../../shared/jumps.ts";
import type { UiRefreshRequestData } from "../../shared/refresh.ts";

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
  /** Identité serveur explicite : aucune déduction depuis customer/supplier. */
  doctype: string;
  name: string;
  customer?: string;
  customer_name?: string;
  supplier?: string;
  supplier_name?: string;
  quotation_to?: string;
  party_name?: string;
  company?: string;
  posting_date?: string;
  transaction_date?: string;
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
  /** Outils exacts autorisés par le registre serveur pour ce viewer. */
  _availableTools?: string[];
  [key: string]: unknown;
}

function legacyDoctype(payload: InvoicePayload): string {
  const request = payload.refreshRequest;
  const genericDoctype = request?.arguments?.doctype;
  if (typeof genericDoctype === "string" && genericDoctype.trim() !== "") {
    return genericDoctype;
  }
  const toolName = request?.toolName ?? "";
  if (toolName.startsWith("erpnext_sales_order_")) return "Sales Order";
  if (toolName.startsWith("erpnext_sales_invoice_")) return "Sales Invoice";
  if (toolName.startsWith("erpnext_quotation_")) return "Quotation";

  const candidate = payload.data ?? payload;
  return typeof (candidate as Record<string, unknown>).customer === "string" &&
      ((candidate as Record<string, unknown>).customer as string).trim() !== ""
    ? "Sales Invoice"
    : "Purchase Invoice";
}

/** Préfère l'identité serveur, avec le comportement 3.0.x en repli. */
export function invoiceDataFromPayload(
  payload: InvoicePayload,
): InvoiceData | null {
  const candidate = payload.data ?? payload;
  if (typeof candidate !== "object" || candidate === null) return null;
  const record = candidate as Record<string, unknown>;
  if (typeof record.name !== "string" || record.name.trim() === "") {
    return null;
  }
  if (typeof record.doctype === "string" && record.doctype.trim() !== "") {
    return record as unknown as InvoiceData;
  }
  return {
    ...record,
    doctype: legacyDoctype(payload),
  } as unknown as InvoiceData;
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
