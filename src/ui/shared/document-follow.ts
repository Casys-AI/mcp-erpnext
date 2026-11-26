import type { InvoiceDocumentRef } from "../../code-mode/document-follow.ts";

export * from "../../code-mode/document-follow.ts";

export interface ViewerInteractions {
  onInvoiceSelected?(document: InvoiceDocumentRef): void;
  subscribeInvoiceFocus?(
    listener: (document: InvoiceDocumentRef) => void,
  ): () => void;
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
