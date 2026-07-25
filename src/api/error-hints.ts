/**
 * Frappe error remediation hints.
 *
 * Frappe reports failures at two levels — an `exc_type` class name and a
 * `_server_messages` payload — neither of which tells a calling agent what to
 * do next. `FrappeAPIError` already merges both into its message; this module
 * turns that into an actionable next step.
 *
 * Hints are advisory. Nothing here suppresses or rewrites the underlying
 * error: the original message is always preserved, and the hint is appended.
 *
 * @module lib/erpnext/api/error-hints
 */

/** Setup-level fields whose absence is fixed by master data, not by the caller. */
const SETUP_FIELDS = [
  "selling_price_list",
  "buying_price_list",
  "price_list",
  "item_group",
  "stock_uom",
  "warehouse",
  "company",
];

/**
 * Best-effort extraction of the field names a `MandatoryError` names.
 *
 * Frappe is not consistent here — the field can arrive as a snake_case name
 * (`selling_price_list is required`), as a label (`Value missing for Item:
 * Item Group`), or as a list (`Missing Fields: a, b`). All three forms are
 * matched; an unrecognised form yields an empty array and the caller falls
 * back to a generic hint.
 */
export function extractMandatoryFields(message: string): string[] {
  const fields = new Set<string>();

  const valueMissing = message.match(/Value missing for [^:]+:\s*([^.;\n]+)/i);
  if (valueMissing) {
    for (const part of valueMissing[1].split(",")) {
      const field = part.trim();
      if (field) fields.add(field);
    }
  }

  const missingFields = message.match(/Missing Fields?:\s*([^.;\n]+)/i);
  if (missingFields) {
    for (const part of missingFields[1].split(",")) {
      const field = part.trim();
      if (field) fields.add(field);
    }
  }

  for (
    const match of message.matchAll(
      /\b([a-z][a-z0-9_]*_[a-z0-9_]+)\b\s+is required/gi,
    )
  ) {
    fields.add(match[1]);
  }

  return [...fields];
}

/** Normalise a field name or label to the snake_case form used in schemas. */
function normalizeField(field: string): string {
  return field.trim().toLowerCase().replace(/\s+/g, "_");
}

/**
 * Build a remediation hint for a failed Frappe request.
 *
 * @param excType - Frappe's `exc_type` from the response body, if present.
 * @param status - HTTP status code.
 * @param message - The merged message (base + `_server_messages`).
 * @returns A single-sentence next step, or `undefined` when nothing specific
 *          is known — a wrong guess is worse than no hint.
 */
export function buildErrorHint(
  excType: string | undefined,
  status: number,
  message: string,
): string | undefined {
  switch (excType) {
    case "MandatoryError": {
      const fields = extractMandatoryFields(message);
      if (fields.length === 0) {
        return "A required field is missing. Read the server message above for the field name; " +
          "if it names master data, run erpnext_setup_check.";
      }
      const setup = fields.filter((f) =>
        SETUP_FIELDS.includes(normalizeField(f))
      );
      const list = fields.join(", ");
      return setup.length > 0
        ? `Missing required field(s): ${list}. These depend on instance master data — ` +
          "run erpnext_setup_check to see what the instance is missing."
        : `Missing required field(s): ${list}. Pass them in the tool input and retry.`;
    }

    case "TimestampMismatchError":
      return "The document changed between the read and the write. Re-read it with " +
        "{ skipCache: true } and retry the operation with the fresh `modified` timestamp.";

    case "DuplicateEntryError":
      return "A document with this name or unique key already exists. Use the existing " +
        "document, or supply a different name.";

    case "LinkValidationError":
      return "A linked document referenced by this payload does not exist. Create it first, " +
        "or pass an existing document's exact name.";

    case "LinkExistsError":
      return "This document is still referenced by other documents and cannot be deleted or " +
        "cancelled until they are removed or amended.";

    case "DoesNotExistError":
      return "No such document. Check the doctype and the exact `name` — Frappe names are " +
        "case-sensitive and are not the human-readable title for every doctype.";

    case "PermissionError":
      return "The API key lacks permission for this doctype or operation. Grant the role in " +
        "ERPNext, or use a key with wider access.";
  }

  // Fresh instances that skipped the setup wizard leave the rounding config
  // unset, so ERPNext's own validation crashes on `abs(None)`.
  if (/rounded_total/.test(message) && /NoneType|abs\(None\)/.test(message)) {
    return "The instance has no rounding configuration (a fresh-install symptom). Submitting " +
      "through erpnext_doc_submit / erpnext_sales_order_submit handles this by setting " +
      "disable_rounded_total; complete the ERPNext setup wizard for a permanent fix.";
  }

  if (status === 401) {
    return "Authentication failed. Check ERPNEXT_API_KEY and ERPNEXT_API_SECRET.";
  }
  if (status === 403) {
    return "The API key lacks permission for this doctype or operation.";
  }
  if (status === 404) {
    return "Endpoint or document not found. Check ERPNEXT_URL and the doctype spelling.";
  }
  if (status === 429) {
    return "Rate limited by ERPNext. Reads retry automatically; slow down writes.";
  }
  if (status >= 500) {
    return "ERPNext returned a server error. Check the instance's error log for the traceback.";
  }

  return undefined;
}
