/** UI-only Purchase Invoice submit helpers. Do not import server tools. */

export const PURCHASE_INVOICE_DOCTYPE = "Purchase Invoice";
export const SALES_INVOICE_DOCTYPE = "Sales Invoice";

export type InvoiceSubmitSource = {
  name?: unknown;
  doctype?: unknown;
  customer?: unknown;
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

export type SubmitArgsResult =
  | { ok: true; args: Record<string, unknown> }
  | { ok: false; error: string; errorKey?: string; args?: undefined };

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
  messageKey?: string;
  refresh: boolean;
  invoice?: Record<string, unknown>;
};

export function resolveInvoiceDoctype(data: InvoiceSubmitSource): string {
  if (
    data.doctype === PURCHASE_INVOICE_DOCTYPE ||
    data.doctype === SALES_INVOICE_DOCTYPE
  ) {
    return data.doctype;
  }
  return data.customer ? SALES_INVOICE_DOCTYPE : PURCHASE_INVOICE_DOCTYPE;
}

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

export function buildDocSubmitArguments(
  data: InvoiceSubmitSource,
): SubmitArgsResult {
  if (typeof data.name !== "string" || data.name.length === 0) {
    return {
      ok: false,
      error: "Invoice name is required.",
      errorKey: "stable.invoice.error.name_required",
    };
  }
  return {
    ok: true,
    args: { doctype: resolveInvoiceDoctype(data), name: data.name },
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

export function interpretPurchaseInvoiceSubmitResult(
  result: ToolResultLike,
  requestedName: string,
): ActionFeedback {
  if (result.isError) {
    const message = errorText(result);
    return {
      kind: "error",
      message: message ?? "Action failed",
      ...(message === null
        ? { messageKey: "invoice.error.action_failed" }
        : {}),
      refresh: false,
    };
  }
  const payload = parseActionPayload(result);
  const invoice = returnedInvoice(payload, requestedName);
  if (invoice && invoice.docstatus === 1) {
    const message = payloadMessage(payload);
    return {
      kind: "success",
      message: message ?? "Submitted",
      ...(message === null ? { messageKey: "invoice.action.submitted" } : {}),
      refresh: true,
      invoice,
    };
  }
  return {
    kind: "attention",
    message:
      "Submission could not be confirmed. Inspect the same invoice before retrying.",
    messageKey: "document.purchase_invoice.submit.unconfirmed",
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
    messageKey: "document.purchase_invoice.submit.transport",
    refresh: true,
  };
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
