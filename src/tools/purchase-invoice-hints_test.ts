/**
 * Pure tests for Purchase Invoice HTTP 417 account hints.
 */

import { assertEquals, assertStrictEquals } from "@std/assert";
import { FrappeAPIError } from "../api/frappe-client.ts";
import {
  annotateKnownPurchaseInvoiceAccountError,
  isPurchaseInvoiceDoctype,
  purchaseInvoiceAccountHint,
  stripHtml,
  withPurchaseInvoiceAccountHints,
} from "./purchase-invoice-hints.ts";

const PARTY_HINT_NEEDLE = "credit_to";
const GRNI_HINT_NEEDLE = "stock_received_but_not_billed";

const HINT_CASES: Array<{
  name: string;
  text: string;
  needle: string | undefined;
}> = [
  {
    name: "empty HTML Party Account",
    text:
      "Party Account <strong></strong> currency (None) and document currency (EUR) should be same",
    needle: PARTY_HINT_NEEDLE,
  },
  {
    name: "literal None Party Account",
    text:
      "Party Account <strong>None</strong> currency (<strong>None</strong>) and document currency (EUR) should be same",
    needle: PARTY_HINT_NEEDLE,
  },
  {
    name: "named account currency USD",
    text:
      "Party Account Creditors - ABC currency (USD) and document currency (EUR) should be same",
    needle: undefined,
  },
  {
    name: "named account currency None",
    text:
      "Party Account Creditors - ABC currency (None) and document currency (EUR) should be same",
    needle: undefined,
  },
  {
    name: "literal None without document currency clause",
    text: "Party Account None currency (None)",
    needle: undefined,
  },
  {
    name: "GRNI missing company default",
    text: "Please set default <b>Stock Received But Not Billed</b> in Company",
    needle: GRNI_HINT_NEEDLE,
  },
  {
    name: "GRNI disabled account",
    text: "Account Stock Received But Not Billed - ACME is disabled",
    needle: undefined,
  },
  {
    name: "GRNI wrong company",
    text:
      "Stock Received But Not Billed account does not belong to company ACME",
    needle: undefined,
  },
  {
    name: "GRNI currency mismatch",
    text:
      "Account Stock Received But Not Billed - ACME currency (USD) and document currency (EUR) should be same",
    needle: undefined,
  },
];

for (const { name, text, needle } of HINT_CASES) {
  Deno.test(`purchaseInvoiceAccountHint - ${name}`, () => {
    const hint = purchaseInvoiceAccountHint(text);
    if (needle === undefined) {
      assertEquals(hint, undefined);
    } else {
      assertEquals(hint?.includes(needle), true);
    }
  });
}

Deno.test("isPurchaseInvoiceDoctype - exact DocType only", () => {
  assertEquals(isPurchaseInvoiceDoctype("Purchase Invoice"), true);
  assertEquals(isPurchaseInvoiceDoctype("purchase invoice"), false);
  assertEquals(isPurchaseInvoiceDoctype("Sales Invoice"), false);
});

Deno.test("stripHtml - removes tags without touching named-account text", () => {
  assertEquals(
    stripHtml("Party Account <b>None</b> currency (<i>None</i>)"),
    "Party Account None currency ( None )",
  );
});

Deno.test("annotateKnownPurchaseInvoiceAccountError - mutates the same 417 object", () => {
  const err = new FrappeAPIError(
    "POST failed: Party Account None currency (None) and document currency (EUR) should be same",
    417,
    {
      message:
        "<p>Party Account None currency (None) and document currency (EUR) should be same</p>",
    },
    1200,
  );
  const prefix = err.message;
  const body = err.body;
  try {
    annotateKnownPurchaseInvoiceAccountError(err);
    throw new Error("expected rethrow");
  } catch (caught) {
    assertStrictEquals(caught, err);
    assertEquals(err.status, 417);
    assertEquals(err.retryAfterMs, 1200);
    assertEquals(err.body, body);
    assertEquals(err.message.startsWith(prefix), true);
    assertEquals(err.message.includes(PARTY_HINT_NEEDLE), true);
  }
});

Deno.test("annotateKnownPurchaseInvoiceAccountError - reads body.message only, never JSON.stringify", () => {
  const fromBody = new FrappeAPIError("ValidationError", 417, {
    message:
      "Party Account None currency (None) and document currency (EUR) should be same",
    nested: {
      text:
        "Party Account None currency (None) and document currency (EUR) should be same",
    },
  });
  try {
    annotateKnownPurchaseInvoiceAccountError(fromBody);
    throw new Error("expected rethrow");
  } catch (caught) {
    assertStrictEquals(caught, fromBody);
    assertEquals(fromBody.message.includes(PARTY_HINT_NEEDLE), true);
  }

  const nestedOnly = new FrappeAPIError("ValidationError", 417, {
    nested: {
      message:
        "Party Account None currency (None) and document currency (EUR) should be same",
    },
  });
  const nestedMessage = nestedOnly.message;
  try {
    annotateKnownPurchaseInvoiceAccountError(nestedOnly);
    throw new Error("expected rethrow");
  } catch (caught) {
    assertStrictEquals(caught, nestedOnly);
    assertEquals(nestedOnly.message, nestedMessage);
    assertEquals(nestedOnly.message.includes(PARTY_HINT_NEEDLE), false);
  }
});

Deno.test("annotateKnownPurchaseInvoiceAccountError - disabled GRNI and non-417 stay unchanged", () => {
  const disabled = new FrappeAPIError(
    "Account Stock Received But Not Billed - ACME is disabled",
    417,
    { message: "Account Stock Received But Not Billed - ACME is disabled" },
    900,
  );
  const disabledMessage = disabled.message;
  try {
    annotateKnownPurchaseInvoiceAccountError(disabled);
    throw new Error("expected rethrow");
  } catch (caught) {
    assertStrictEquals(caught, disabled);
    assertEquals(disabled.message, disabledMessage);
    assertEquals(disabled.message.includes(GRNI_HINT_NEEDLE), false);
  }

  const forbidden = new FrappeAPIError("nope", 403, {
    exc_type: "PermissionError",
  });
  const forbiddenMessage = forbidden.message;
  try {
    annotateKnownPurchaseInvoiceAccountError(forbidden);
    throw new Error("expected rethrow");
  } catch (caught) {
    assertStrictEquals(caught, forbidden);
    assertEquals(forbidden.message, forbiddenMessage);
  }
});

Deno.test("withPurchaseInvoiceAccountHints - success and annotated failure", async () => {
  assertEquals(await withPurchaseInvoiceAccountHints(async () => 42), 42);

  const err = new FrappeAPIError(
    "Please set default Stock Received But Not Billed in Company",
    417,
    { message: "Please set default Stock Received But Not Billed in Company" },
  );
  try {
    await withPurchaseInvoiceAccountHints(async () => {
      throw err;
    });
    throw new Error("expected throw");
  } catch (caught) {
    assertStrictEquals(caught, err);
    assertEquals(err.message.includes(GRNI_HINT_NEEDLE), true);
  }
});
