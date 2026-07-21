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
