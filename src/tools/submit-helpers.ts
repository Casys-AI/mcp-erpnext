/**
 * Shared helpers for submit-handler tools (erpnext_doc_submit,
 * erpnext_sales_order_submit, erpnext_sales_invoice_submit).
 *
 * @module lib/erpnext/tools/submit-helpers
 */

/**
 * On a fresh ERPNext instance (rounding configuration not initialized),
 * `base_rounded_total`/`rounded_total` stay `None` and `validate_grand_total()`
 * crashes with `TypeError: abs(None)` on submit. Set `disable_rounded_total`
 * to skip that computation when the fields are present but unset.
 *
 * The two fields move together on a fetched doc (both null on a fresh
 * instance, both set otherwise), so `||` rather than `&&` is intentional —
 * either one being null is enough to trigger the fallback.
 *
 * See docs/known-issues.md — P0 "Fresh instance: base_rounded_total = None".
 */
export function withRoundedTotalFallback(
  doc: Record<string, unknown>,
): Record<string, unknown> {
  const hasNullRoundedTotal =
    ("base_rounded_total" in doc && doc.base_rounded_total == null) ||
    ("rounded_total" in doc && doc.rounded_total == null);

  if (!hasNullRoundedTotal || doc.disable_rounded_total) {
    return doc;
  }

  return { ...doc, disable_rounded_total: 1 };
}

/**
 * Returns a warning to surface to the caller when `withRoundedTotalFallback`
 * silently patched the doc — so an agent consumer can tell rounding was
 * suppressed on its behalf rather than the totals genuinely being zero.
 */
export function roundedTotalFallbackWarning(
  original: Record<string, unknown>,
  patched: Record<string, unknown>,
): string[] {
  if (
    patched.disable_rounded_total === 1 &&
    original.disable_rounded_total !== 1
  ) {
    return [
      "disable_rounded_total auto-set — rounded totals were null " +
      "(rounding not configured on this instance)",
    ];
  }
  return [];
}
