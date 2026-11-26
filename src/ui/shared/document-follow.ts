import type { KpiPeriod } from "../../code-mode/kpi-period.ts";
import type { InvoiceDocumentRef } from "../../code-mode/document-follow.ts";

export * from "../../code-mode/document-follow.ts";

export type InvoiceFocusReceiver = (document: InvoiceDocumentRef) => boolean;

export interface InvoiceSelection {
  canFollow(): boolean;
  /** Confirmed invoice displayed by a linked panel, independent of the context basket. */
  isOpen(document: InvoiceDocumentRef): boolean;
  subscribe(listener: () => void): () => void;
  select(document: InvoiceDocumentRef, fallback: () => void): void;
  cancelPending(): void;
}

export interface KpiPeriodSelection {
  /** undefined for a standalone chart; null when linked targets span different periods. */
  selected(): KpiPeriod | null | undefined;
  subscribe(listener: () => void): () => void;
  inspect(period: KpiPeriod): void;
}

export interface ViewerInteractions {
  kpiPeriodSelection?: KpiPeriodSelection;
  updateKpiPeriods?(periods: unknown): void;
  invoiceSelection?: InvoiceSelection;
  setInvoiceFocus?(
    receiver: InvoiceFocusReceiver | null,
    displayed?: InvoiceDocumentRef | null,
  ): void;
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
