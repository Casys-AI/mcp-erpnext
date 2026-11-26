export const INVOICE_SELECTED = "invoice.selected";
export const INVOICE_FOCUS = "invoice.focus";
export const INVOICE_SELECTION_VIEW = "ui://mcp-erpnext/doclist-viewer";
export const INVOICE_FOCUS_VIEW = "ui://mcp-erpnext/invoice-viewer";
export const SALES_INVOICE_GET = "erpnext_sales_invoice_get";
export const SALES_INVOICE_DOCTYPE = "Sales Invoice";

export const INVOICE_FOLLOW_PORTS = {
  source: { resourceUri: INVOICE_SELECTION_VIEW, event: INVOICE_SELECTED },
  target: { resourceUri: INVOICE_FOCUS_VIEW, action: INVOICE_FOCUS },
} as const;

export interface InvoiceDocumentRef {
  doctype: typeof SALES_INVOICE_DOCTYPE;
  name: string;
}

export function invoiceDocumentRef(
  doctype: unknown,
  name: unknown,
): InvoiceDocumentRef | null {
  if (
    doctype !== SALES_INVOICE_DOCTYPE || typeof name !== "string" ||
    !name || name.trim() !== name
  ) return null;
  return { doctype, name };
}

export function invoiceSelectionRef(
  listDoctype: unknown,
  row: Record<string, unknown>,
): InvoiceDocumentRef | null {
  if (row.doctype !== undefined && row.doctype !== listDoctype) return null;
  return invoiceDocumentRef(listDoctype, row.name);
}
