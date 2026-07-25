/**
 * Error hint tests.
 *
 * @module lib/erpnext/tests/api/error-hints_test
 */

import { assertEquals, assertMatch, assertStringIncludes } from "@std/assert";
import { buildErrorHint, extractMandatoryFields } from "./error-hints.ts";
import { FrappeAPIError } from "./frappe-client.ts";

// ── extractMandatoryFields ──────────────────────────────────────────────────

Deno.test("extractMandatoryFields - snake_case '<field> is required'", () => {
  assertEquals(
    extractMandatoryFields("MandatoryError: selling_price_list is required"),
    ["selling_price_list"],
  );
});

Deno.test("extractMandatoryFields - 'Value missing for <doctype>: <fields>'", () => {
  assertEquals(
    extractMandatoryFields("Value missing for Item: Item Group, Stock Uom"),
    ["Item Group", "Stock Uom"],
  );
});

Deno.test("extractMandatoryFields - 'Missing Fields: <fields>'", () => {
  assertEquals(
    extractMandatoryFields("[Sales Order] Missing Fields: customer, company"),
    ["customer", "company"],
  );
});

Deno.test("extractMandatoryFields - deduplicates across patterns", () => {
  assertEquals(
    extractMandatoryFields(
      "Missing Fields: selling_price_list; selling_price_list is required",
    ),
    ["selling_price_list"],
  );
});

Deno.test("extractMandatoryFields - returns empty on an unrecognised shape", () => {
  assertEquals(extractMandatoryFields("something went wrong"), []);
});

// ── buildErrorHint ──────────────────────────────────────────────────────────

Deno.test("buildErrorHint - MandatoryError on a setup field points at erpnext_setup_check", () => {
  const hint = buildErrorHint(
    "MandatoryError",
    417,
    "Value missing for Sales Order: selling_price_list",
  )!;
  assertStringIncludes(hint, "selling_price_list");
  assertStringIncludes(hint, "erpnext_setup_check");
});

Deno.test("buildErrorHint - MandatoryError on a payload field says to pass it", () => {
  const hint = buildErrorHint(
    "MandatoryError",
    417,
    "Value missing for Sales Order: delivery_date",
  )!;
  assertStringIncludes(hint, "delivery_date");
  assertStringIncludes(hint, "Pass them in the tool input");
  // A caller-supplied field must not be misattributed to instance master data.
  assertEquals(hint.includes("erpnext_setup_check"), false);
});

Deno.test("buildErrorHint - MandatoryError with no parseable field still guides", () => {
  const hint = buildErrorHint(
    "MandatoryError",
    417,
    "mandatory fields absent",
  )!;
  assertStringIncludes(hint, "required field is missing");
});

Deno.test("buildErrorHint - TimestampMismatchError prescribes the re-read", () => {
  const hint = buildErrorHint("TimestampMismatchError", 409, "conflict")!;
  assertStringIncludes(hint, "skipCache: true");
});

Deno.test("buildErrorHint - maps the remaining known exc_types", () => {
  const cases: Array<[string, RegExp]> = [
    ["DuplicateEntryError", /already exists/],
    ["LinkValidationError", /does not exist/],
    ["LinkExistsError", /still referenced/],
    ["DoesNotExistError", /No such document/],
    ["PermissionError", /lacks permission/],
  ];
  for (const [excType, pattern] of cases) {
    assertMatch(buildErrorHint(excType, 417, "")!, pattern);
  }
});

Deno.test("buildErrorHint - recognises the fresh-instance rounding crash", () => {
  const hint = buildErrorHint(
    undefined,
    500,
    "TypeError: bad operand type for abs(None) in validate_grand_total, base_rounded_total",
  )!;
  assertStringIncludes(hint, "disable_rounded_total");
});

Deno.test("buildErrorHint - falls back to status-based hints", () => {
  assertMatch(buildErrorHint(undefined, 401, "")!, /ERPNEXT_API_KEY/);
  assertMatch(buildErrorHint(undefined, 403, "")!, /lacks permission/);
  assertMatch(buildErrorHint(undefined, 404, "")!, /ERPNEXT_URL/);
  assertMatch(buildErrorHint(undefined, 429, "")!, /Rate limited/);
  assertMatch(buildErrorHint(undefined, 503, "")!, /server error/);
});

Deno.test("buildErrorHint - returns undefined when nothing is known", () => {
  // A wrong guess is worse than no hint.
  assertEquals(buildErrorHint(undefined, 400, "odd request"), undefined);
});

// ── FrappeAPIError integration ──────────────────────────────────────────────

Deno.test("FrappeAPIError - exposes exc_type and appends the hint to the message", () => {
  const err = new FrappeAPIError(
    "POST /api/resource/Sales Order failed: MandatoryError: selling_price_list is required",
    417,
    {
      exc_type: "MandatoryError",
      _server_messages: '["selling_price_list is required"]',
    },
  );

  assertEquals(err.excType, "MandatoryError");
  assertStringIncludes(err.hint!, "erpnext_setup_check");
  // The original message survives verbatim ahead of the hint.
  assertStringIncludes(
    err.message,
    "MandatoryError: selling_price_list is required",
  );
  assertStringIncludes(err.message, "(HTTP 417)");
  assertStringIncludes(err.message, "erpnext_setup_check");
});

Deno.test("FrappeAPIError - no hint leaves the message untouched", () => {
  const err = new FrappeAPIError("GET /api/resource/X failed: odd", 400, {});
  assertEquals(err.excType, undefined);
  assertEquals(err.hint, undefined);
  assertEquals(
    err.message,
    "[FrappeClient] GET /api/resource/X failed: odd (HTTP 400)",
  );
});

Deno.test("FrappeAPIError - tolerates a non-object body", () => {
  const err = new FrappeAPIError("network failure", 0, "connection refused");
  assertEquals(err.excType, undefined);
  assertEquals(err.status, 0);
});
