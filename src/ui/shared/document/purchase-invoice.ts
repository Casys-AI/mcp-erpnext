/** UI-only Purchase Invoice amount/submit helpers. Do not import server tools. */

export const PURCHASE_INVOICE_DOCTYPE = "Purchase Invoice";
export const DISABLE_ROUNDED_TOTAL_LABEL = "Disable Rounded Total";

export type InvoiceSubmitSource = {
  name?: unknown;
  doctype?: unknown;
  currency?: unknown;
  grand_total?: unknown;
  disable_rounded_total?: unknown;
  rounded_total?: unknown;
  rounding_adjustment?: unknown;
  base_rounded_total?: unknown;
  [key: string]: unknown;
};

export type ToolResultLike = {
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
  content?: Array<{ type: string; text?: string }>;
};

export type EffectiveTotalResult =
  | {
    ok: true;
    amount: number;
    currency: string;
    roundingAdjustment: number;
  }
  | { ok: false; error: string };

export type ActionFeedbackKind = "success" | "error" | "attention";

export type ActionFeedback = {
  kind: ActionFeedbackKind;
  message: string;
  refresh: boolean;
  invoice?: Record<string, unknown>;
};

export type PurchaseInvoiceGrossTotal = {
  amount: number;
  currency: string;
  roundingAdjustment: number;
  calculatedTotal: number;
  showNote: boolean;
};

export type HostPurchaseInvoiceSubmitReason =
  | "success"
  | "error"
  | "unconfirmed"
  | "transport";

export type HostPurchaseInvoiceSubmitDecision =
  | {
    applies: true;
    kind: ActionFeedbackKind;
    reason: HostPurchaseInvoiceSubmitReason;
    message: string;
    claimSubmitted: boolean;
    emitCommittedEvent: boolean;
    reread: boolean;
  }
  | { applies: false };

export function purchaseInvoiceEffectiveTotal(
  data: InvoiceSubmitSource,
): EffectiveTotalResult {
  const currency = documentCurrency(data.currency);
  if (!currency) {
    return {
      ok: false,
      error: "Purchase Invoice is missing document currency.",
    };
  }
  const grandTotal = finiteNumber(data.grand_total);
  if (grandTotal === null) {
    return {
      ok: false,
      error: "Purchase Invoice has invalid or missing grand_total.",
    };
  }
  if (data.disable_rounded_total === 1) {
    return {
      ok: true,
      amount: grandTotal,
      currency,
      roundingAdjustment: 0,
    };
  }
  if (data.disable_rounded_total === 0) {
    // The submit fallback disables rounding when this field is present but null.
    if ("base_rounded_total" in data && data.base_rounded_total == null) {
      return {
        ok: false,
        error: "Purchase Invoice has an unconfigured base rounded total.",
      };
    }
    const roundedTotal = finiteNumber(data.rounded_total);
    const roundingAdjustment = finiteNumber(data.rounding_adjustment);
    if (roundedTotal === null || roundingAdjustment === null) {
      return {
        ok: false,
        error: "Purchase Invoice has invalid or missing rounding amounts.",
      };
    }
    const roundingApplied = roundingAdjustment !== 0 && roundedTotal !== 0;
    return {
      ok: true,
      amount: roundingApplied ? roundedTotal : grandTotal,
      currency,
      roundingAdjustment: roundingApplied ? roundingAdjustment : 0,
    };
  }
  return {
    ok: false,
    error: "Purchase Invoice has an unknown rounding setting.",
  };
}

export function purchaseInvoiceGrossTotal(
  doctype: string,
  document: InvoiceSubmitSource,
): PurchaseInvoiceGrossTotal | null {
  if (doctype !== PURCHASE_INVOICE_DOCTYPE) return null;
  const result = purchaseInvoiceEffectiveTotal(document);
  if (!result.ok) return null;
  const calculatedTotal = finiteNumber(document.grand_total);
  if (calculatedTotal === null) return null;
  return {
    amount: result.amount,
    currency: result.currency,
    roundingAdjustment: result.roundingAdjustment,
    calculatedTotal,
    showNote: result.roundingAdjustment !== 0,
  };
}

export function formatPurchaseInvoiceAmount(
  amount: number,
  currency: string,
): string {
  return `${String(amount)} ${currency}`;
}

export function formatSignedPurchaseInvoiceAmount(
  amount: number,
  currency: string,
): string {
  const formatted = formatPurchaseInvoiceAmount(amount, currency);
  return amount > 0 ? `+${formatted}` : formatted;
}

export function purchaseInvoiceRoundingAria(
  adjustment: number,
  invoiceTotal: number,
  currency: string,
): { key: string; params: Record<string, string> } {
  if (invoiceTotal < 0) {
    return {
      key: "document.purchase_invoice.aria.adjustment",
      params: {
        signed: formatSignedPurchaseInvoiceAmount(adjustment, currency),
      },
    };
  }
  if (adjustment > 0) {
    return {
      key: "document.purchase_invoice.aria.adds",
      params: { amount: formatPurchaseInvoiceAmount(adjustment, currency) },
    };
  }
  return {
    key: "document.purchase_invoice.aria.reduces",
    params: {
      amount: formatPurchaseInvoiceAmount(Math.abs(adjustment), currency),
    },
  };
}

export function interpretPurchaseInvoiceSubmitResult(
  result: ToolResultLike,
  requestedName: string,
): ActionFeedback {
  if (result.isError) {
    return {
      kind: "error",
      message: errorText(result) ?? "Action failed",
      refresh: false,
    };
  }
  const payload = parseActionPayload(result);
  const invoice = returnedInvoice(payload, requestedName);
  if (invoice && invoice.docstatus === 1) {
    return {
      kind: "success",
      message: payloadMessage(payload) ?? "Submitted",
      refresh: true,
      invoice,
    };
  }
  return {
    kind: "attention",
    message:
      "Submission could not be confirmed. Inspect the same invoice before retrying.",
    refresh: true,
    invoice,
  };
}

export function interpretSubmitTransportFailure(
  _cause: unknown,
): ActionFeedback {
  return {
    kind: "attention",
    message:
      "Submit response was not received. Inspect the same invoice before retrying; submission is unconfirmed.",
    refresh: true,
  };
}

export function interpretHostPurchaseInvoiceSubmit(
  toolName: string,
  args: Record<string, unknown>,
  outcome: { result: ToolResultLike } | { transportFailure: unknown },
): HostPurchaseInvoiceSubmitDecision {
  if (
    toolName !== "erpnext_doc_submit" ||
    args.doctype !== PURCHASE_INVOICE_DOCTYPE ||
    typeof args.name !== "string" ||
    args.name.length === 0
  ) {
    return { applies: false };
  }
  const feedback = "transportFailure" in outcome
    ? interpretSubmitTransportFailure(outcome.transportFailure)
    : interpretPurchaseInvoiceSubmitResult(outcome.result, args.name);
  const reason: HostPurchaseInvoiceSubmitReason = feedback.kind === "success"
    ? "success"
    : feedback.kind === "error"
    ? "error"
    : "transportFailure" in outcome
    ? "transport"
    : "unconfirmed";
  return {
    applies: true,
    kind: feedback.kind,
    reason,
    message: feedback.message,
    claimSubmitted: feedback.kind === "success",
    emitCommittedEvent: feedback.kind === "success",
    reread: feedback.refresh,
  };
}

export function purchaseInvoiceConfirmAmount(
  doctype: string,
  document: InvoiceSubmitSource,
): string | null {
  const gross = purchaseInvoiceGrossTotal(doctype, document);
  if (!gross) return null;
  return formatPurchaseInvoiceAmount(gross.amount, gross.currency);
}

export function clampAnchoredPopover(
  anchor: { top: number; left: number; right: number; bottom: number },
  viewport: { width: number; height: number },
  panel: { width: number; height: number },
  gap = 6,
  margin = 8,
): { top: number; left: number } {
  const width = Math.min(panel.width, Math.max(0, viewport.width - margin * 2));
  const height = panel.height;
  let top = anchor.bottom + gap;
  if (top + height > viewport.height - margin) {
    top = anchor.top - gap - height;
  }
  if (top < margin) top = margin;
  if (top + height > viewport.height - margin) {
    top = Math.max(margin, viewport.height - margin - height);
  }
  let left = anchor.right - width;
  if (left < margin) left = margin;
  if (left + width > viewport.width - margin) {
    left = Math.max(margin, viewport.width - margin - width);
  }
  return { top, left };
}

function documentCurrency(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.trim().length === 0) return null;
  return value;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseActionPayload(
  result: ToolResultLike,
): Record<string, unknown> | null {
  if (
    result.structuredContent &&
    typeof result.structuredContent === "object" &&
    !Array.isArray(result.structuredContent)
  ) {
    return result.structuredContent;
  }
  const text = result.content?.find((entry) => entry.type === "text")?.text;
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

function payloadMessage(
  payload: Record<string, unknown> | null,
): string | null {
  return typeof payload?.message === "string" && payload.message.length > 0
    ? payload.message
    : null;
}

function errorText(result: ToolResultLike): string | null {
  const payload = parseActionPayload(result);
  const fromPayload = payloadMessage(payload);
  if (fromPayload) return fromPayload;
  return result.content?.find((entry) => entry.type === "text")?.text ?? null;
}

function returnedInvoice(
  payload: Record<string, unknown> | null,
  requestedName: string,
): Record<string, unknown> | undefined {
  const data = payload?.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return undefined;
  }
  const invoice = data as Record<string, unknown>;
  if (
    invoice.name === requestedName &&
    invoice.doctype === PURCHASE_INVOICE_DOCTYPE
  ) {
    return invoice;
  }
  return undefined;
}
