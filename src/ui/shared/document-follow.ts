import type { InvoiceDocumentRef } from "../../code-mode/document-follow.ts";

export * from "../../code-mode/document-follow.ts";

export type InvoiceFocusReceiver = (document: InvoiceDocumentRef) => boolean;

export interface InvoiceSelection {
  canFollow(): boolean;
  subscribe(listener: () => void): () => void;
  select(document: InvoiceDocumentRef, fallback: () => void): void;
  cancelPending(): void;
}

export interface ViewerInteractions {
  invoiceSelection?: InvoiceSelection;
  setInvoiceFocus?(receiver: InvoiceFocusReceiver | null): void;
}

export function matchesInvoiceDocument(
  payload: { data?: unknown },
  expected: InvoiceDocumentRef,
): boolean {
  const candidate = payload.data ?? payload;
  if (candidate === null || typeof candidate !== "object") return false;
  const document = candidate as Record<string, unknown>;
  return document.doctype === expected.doctype &&
    document.name === expected.name;
}
