/**
 * Native HTTP 417 hints for Purchase Invoice missing-account errors.
 *
 * Generic create/update/submit keep their HEAD contract. These helpers only
 * append guidance to two known native messages, without changing error identity.
 */

import { FrappeAPIError } from "../api/frappe-client.ts";

export const PURCHASE_INVOICE_DOCTYPE = "Purchase Invoice";

const PARTY_ACCOUNT_HINT =
  "Set data.credit_to, or configure Supplier/Supplier Group accounts, " +
  "or Company.default_payable_account.";

const GRNI_HINT =
  "Company.stock_received_but_not_billed is required with perpetual inventory " +
  "even if update_stock is 0.";

export function isPurchaseInvoiceDoctype(doctype: unknown): boolean {
  return doctype === PURCHASE_INVOICE_DOCTYPE;
}

export function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function purchaseInvoiceAccountHint(text: string): string | undefined {
  const haystack = stripHtml(text);
  if (isEmptyPartyAccountCurrencyNone(haystack)) {
    return PARTY_ACCOUNT_HINT;
  }
  if (
    /please set default stock received but not billed in company/i.test(
      haystack,
    )
  ) {
    return GRNI_HINT;
  }
  return undefined;
}

export function annotateKnownPurchaseInvoiceAccountError(
  error: unknown,
): never {
  if (error instanceof FrappeAPIError && error.status === 417) {
    let hint = purchaseInvoiceAccountHint(error.message);
    if (!hint) {
      const bodyMessage = readErrorBodyMessage(error.body);
      if (bodyMessage) {
        hint = purchaseInvoiceAccountHint(bodyMessage);
      }
    }
    if (hint && !error.message.includes(hint)) {
      error.message = `${error.message} ${hint}`;
    }
  }
  throw error;
}

export async function withPurchaseInvoiceAccountHints<T>(
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    annotateKnownPurchaseInvoiceAccountError(error);
  }
}

function readErrorBodyMessage(body: unknown): string | undefined {
  if (typeof body === "string") return body;
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return undefined;
  }
  const message = (body as Record<string, unknown>).message;
  return typeof message === "string" ? message : undefined;
}

function isEmptyPartyAccountCurrencyNone(text: string): boolean {
  // Native missing account: empty HTML tag, or the literal word None.
  // Named accounts are excluded even when their currency is (None).
  return /party account\s+(?:none\s+)?currency\s*\(\s*none\s*\)\s+and document currency\s*\([^)]*\)\s+should be same/i
    .test(text);
}
