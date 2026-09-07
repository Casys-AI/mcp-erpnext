import { assertEquals } from "@std/assert";
import {
  buildDocSubmitArguments,
  formatPurchaseInvoiceAmount,
  formatSignedPurchaseInvoiceAmount,
  interpretPurchaseInvoiceSubmitResult,
  interpretSubmitTransportFailure,
  purchaseInvoiceEffectiveTotal,
  resolveInvoiceDoctype,
} from "./submission.ts";

function pi(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    name: "PINV-001",
    doctype: "Purchase Invoice",
    supplier: "Acme",
    currency: "EUR",
    grand_total: 3.6,
    disable_rounded_total: 1,
    rounded_total: 0,
    rounding_adjustment: 0,
    base_rounded_total: 0,
    outstanding_amount: 3.6,
    posting_date: "2026-01-01",
    status: "Draft",
    ...overrides,
  };
}

function onlyDoctypeName(
  doctype: string,
  name: string,
): Record<string, unknown> {
  return { doctype, name };
}

Deno.test("resolveInvoiceDoctype - native doctype wins; otherwise customer implies Sales Invoice", () => {
  assertEquals(resolveInvoiceDoctype(pi()), "Purchase Invoice");
  assertEquals(
    resolveInvoiceDoctype({ name: "SINV-001", customer: "Cust" }),
    "Sales Invoice",
  );
  assertEquals(
    resolveInvoiceDoctype({
      name: "SINV-001",
      doctype: "Sales Invoice",
      customer: "Cust",
    }),
    "Sales Invoice",
  );
});

Deno.test("purchaseInvoiceEffectiveTotal - actual payable amount and rounding application", () => {
  const unrounded = purchaseInvoiceEffectiveTotal(pi());
  assertEquals(unrounded.ok, true);
  if (!unrounded.ok) return;
  assertEquals(unrounded.amount, 3.6);
  assertEquals(unrounded.currency, "EUR");
  assertEquals(unrounded.roundingAdjustment, 0);

  const rounded = purchaseInvoiceEffectiveTotal(pi({
    disable_rounded_total: 0,
    grand_total: 3.6,
    rounded_total: 4,
    rounding_adjustment: 0.4,
    base_rounded_total: 4,
  }));
  assertEquals(rounded.ok, true);
  if (!rounded.ok) return;
  assertEquals(rounded.amount, 4);
  assertEquals(rounded.roundingAdjustment, 0.4);

  const negativeAdj = purchaseInvoiceEffectiveTotal(pi({
    disable_rounded_total: 0,
    grand_total: 4.4,
    rounded_total: 4,
    rounding_adjustment: -0.4,
  }));
  assertEquals(negativeAdj.ok, true);
  if (!negativeAdj.ok) return;
  assertEquals(negativeAdj.amount, 4);
  assertEquals(negativeAdj.roundingAdjustment, -0.4);

  const zeroRounded = purchaseInvoiceEffectiveTotal(pi({
    disable_rounded_total: 0,
    grand_total: 0.4,
    rounded_total: 0,
    rounding_adjustment: -0.4,
    base_rounded_total: 0,
  }));
  assertEquals(zeroRounded.ok, true);
  if (!zeroRounded.ok) return;
  assertEquals(zeroRounded.amount, 0.4);
  assertEquals(zeroRounded.roundingAdjustment, 0);

  const paidStillGross = purchaseInvoiceEffectiveTotal(pi({
    outstanding_amount: 0,
    paid_amount: 3.6,
  }));
  assertEquals(paidStillGross.ok, true);
  if (!paidStillGross.ok) return;
  assertEquals(paidStillGross.amount, 3.6);
  assertEquals(paidStillGross.roundingAdjustment, 0);
});

Deno.test("purchaseInvoiceEffectiveTotal - missing rounding info does not guess or require base_rounded_total", () => {
  const noBaseInvoice = pi({
    disable_rounded_total: 0,
    rounded_total: 4,
    rounding_adjustment: 0.4,
  });
  delete noBaseInvoice.base_rounded_total;
  const noBase = purchaseInvoiceEffectiveTotal(noBaseInvoice);
  assertEquals(noBase.ok, true);
  if (!noBase.ok) return;
  assertEquals(noBase.amount, 4);
  assertEquals(noBase.roundingAdjustment, 0.4);

  for (const base_rounded_total of [null, undefined]) {
    const nullBaseInvoice = { ...noBaseInvoice, base_rounded_total };
    assertEquals(purchaseInvoiceEffectiveTotal(nullBaseInvoice).ok, false);
    assertEquals(buildDocSubmitArguments(nullBaseInvoice), {
      ok: true,
      args: onlyDoctypeName("Purchase Invoice", "PINV-001"),
    });
  }

  const noRoundedFields = purchaseInvoiceEffectiveTotal(pi({
    disable_rounded_total: 0,
    rounded_total: null,
    rounding_adjustment: 0.4,
    base_rounded_total: 4,
  }));
  assertEquals(noRoundedFields.ok, false);

  const unknownFlag = purchaseInvoiceEffectiveTotal(pi({
    disable_rounded_total: undefined,
  }));
  assertEquals(unknownFlag.ok, false);

  const booleanFlag = purchaseInvoiceEffectiveTotal(pi({
    disable_rounded_total: true,
  }));
  assertEquals(booleanFlag.ok, false);

  const missingCurrency = purchaseInvoiceEffectiveTotal(pi({ currency: "" }));
  assertEquals(missingCurrency.ok, false);

  const infiniteGrand = purchaseInvoiceEffectiveTotal(pi({
    grand_total: Number.POSITIVE_INFINITY,
  }));
  assertEquals(infiniteGrand.ok, false);

  const stringGrand = purchaseInvoiceEffectiveTotal(pi({ grand_total: "3.6" }));
  assertEquals(stringGrand.ok, false);
});

Deno.test("purchaseInvoiceEffectiveTotal - preserves exact display precision", () => {
  const precise = purchaseInvoiceEffectiveTotal(pi({ grand_total: 3.123 }));
  assertEquals(precise.ok, true);
  if (!precise.ok) return;
  assertEquals(precise.amount, 3.123);
  assertEquals(
    formatPurchaseInvoiceAmount(precise.amount, precise.currency),
    "3.123 EUR",
  );
  assertEquals(
    formatPurchaseInvoiceAmount(3.123, "EUR"),
    `${String(3.123)} EUR`,
  );
  assertEquals(formatPurchaseInvoiceAmount(-0.0001, "KWD"), "-0.0001 KWD");
  assertEquals(
    formatSignedPurchaseInvoiceAmount(0.4, "EUR"),
    "+0.4 EUR",
  );
  assertEquals(
    formatSignedPurchaseInvoiceAmount(-0.4, "EUR"),
    "-0.4 EUR",
  );
});

Deno.test("buildDocSubmitArguments - PI and Sales send only doctype/name", () => {
  const cases: Array<Record<string, unknown>> = [
    pi(),
    pi({
      disable_rounded_total: 0,
      grand_total: 3.6,
      rounded_total: 4,
      rounding_adjustment: 0.4,
    }),
    pi({
      disable_rounded_total: 0,
      grand_total: 0.4,
      rounded_total: 0,
      rounding_adjustment: -0.4,
    }),
    pi({ currency: undefined }),
    pi({ disable_rounded_total: undefined }),
    pi({ grand_total: Number.POSITIVE_INFINITY }),
    pi({
      disable_rounded_total: 0,
      rounded_total: null,
      rounding_adjustment: 0.4,
      base_rounded_total: null,
    }),
    {
      name: "SINV-001",
      doctype: "Sales Invoice",
      customer: "Cust",
      currency: "USD",
      grand_total: 10,
    },
  ];

  for (const invoice of cases) {
    const built = buildDocSubmitArguments(invoice);
    assertEquals(built.ok, true, String(invoice.name));
    if (!built.ok) continue;
    const doctype = resolveInvoiceDoctype(invoice);
    assertEquals(built.args, onlyDoctypeName(doctype, invoice.name as string));
    assertEquals("expected_total" in built.args, false);
    assertEquals("expected_currency" in built.args, false);
    assertEquals("total_verification" in built.args, false);
  }
});

const UNCONFIRMED_SUBMIT_MESSAGE =
  "Submission could not be confirmed. Inspect the same invoice before retrying.";

Deno.test("interpretPurchaseInvoiceSubmitResult - native submitted identity is success without verification", () => {
  const native = interpretPurchaseInvoiceSubmitResult({
    structuredContent: {
      message: "Purchase Invoice PINV-001 submitted successfully",
      data: {
        name: "PINV-001",
        doctype: "Purchase Invoice",
        grand_total: 3.6,
        docstatus: 1,
      },
    },
    content: [{
      type: "text",
      text: JSON.stringify({
        message: "from text",
        total_verification: { matches: false },
      }),
    }],
  }, "PINV-001");
  assertEquals(native.kind, "success");
  assertEquals(
    native.message,
    "Purchase Invoice PINV-001 submitted successfully",
  );
  assertEquals(native.refresh, true);
  assertEquals(native.invoice?.name, "PINV-001");
  assertEquals(native.invoice?.docstatus, 1);

  const leftoverVerification = interpretPurchaseInvoiceSubmitResult({
    structuredContent: {
      message: "Purchase Invoice PINV-001 submitted successfully",
      data: {
        name: "PINV-001",
        doctype: "Purchase Invoice",
        docstatus: 1,
      },
      total_verification: { matches: false },
    },
  }, "PINV-001");
  assertEquals(leftoverVerification.kind, "success");
  assertEquals(leftoverVerification.refresh, true);
  assertEquals(leftoverVerification.invoice?.name, "PINV-001");

  const callFailure = interpretPurchaseInvoiceSubmitResult({
    isError: true,
    content: [{ type: "text", text: "Account missing" }],
  }, "PINV-001");
  assertEquals(callFailure.kind, "error");
  assertEquals(callFailure.message, "Account missing");
  assertEquals(callFailure.refresh, false);
});

Deno.test("interpretPurchaseInvoiceSubmitResult - malformed or unconfirmed stay attention", () => {
  const unconfirmed = interpretPurchaseInvoiceSubmitResult({
    structuredContent: {
      data: { name: "PINV-001", doctype: "Purchase Invoice", docstatus: 0 },
    },
  }, "PINV-001");
  assertEquals(unconfirmed.kind, "attention");
  assertEquals(unconfirmed.message, UNCONFIRMED_SUBMIT_MESSAGE);
  assertEquals(unconfirmed.message.includes("Submitted"), false);
  assertEquals(unconfirmed.refresh, true);
  assertEquals(unconfirmed.invoice?.name, "PINV-001");
  assertEquals(unconfirmed.invoice?.docstatus, 0);

  const withBackendMessage = interpretPurchaseInvoiceSubmitResult({
    structuredContent: {
      message: "Purchase Invoice PINV-001 submitted successfully",
      data: { name: "PINV-001", doctype: "Purchase Invoice", docstatus: 0 },
    },
  }, "PINV-001");
  assertEquals(withBackendMessage.kind, "attention");
  assertEquals(
    withBackendMessage.message,
    UNCONFIRMED_SUBMIT_MESSAGE,
  );

  const malformed = interpretPurchaseInvoiceSubmitResult({
    structuredContent: {
      data: { name: "PINV-001" },
    },
  }, "PINV-001");
  assertEquals(malformed.kind, "attention");
  assertEquals(malformed.message, UNCONFIRMED_SUBMIT_MESSAGE);
  assertEquals(malformed.refresh, true);
  assertEquals(malformed.invoice, undefined);
});

Deno.test("interpretPurchaseInvoiceSubmitResult - hydrates only the same Purchase Invoice", () => {
  const wrongName = interpretPurchaseInvoiceSubmitResult({
    structuredContent: {
      message: "Purchase Invoice PINV-OTHER submitted successfully",
      data: {
        name: "PINV-OTHER",
        doctype: "Purchase Invoice",
        docstatus: 1,
      },
    },
  }, "PINV-001");
  assertEquals(wrongName.kind, "attention");
  assertEquals(wrongName.refresh, true);
  assertEquals(wrongName.invoice, undefined);

  const wrongDoctype = interpretPurchaseInvoiceSubmitResult({
    structuredContent: {
      message: "ok",
      data: { name: "PINV-001", doctype: "Sales Invoice", docstatus: 1 },
    },
  }, "PINV-001");
  assertEquals(wrongDoctype.kind, "attention");
  assertEquals(wrongDoctype.refresh, true);
  assertEquals(wrongDoctype.invoice, undefined);
});

Deno.test("interpretSubmitTransportFailure - unconfirmed, refresh, no proof submit failed", () => {
  const feedback = interpretSubmitTransportFailure(
    new Error("Tool call timed out after 10000ms"),
  );
  assertEquals(feedback.kind, "attention");
  assertEquals(feedback.refresh, true);
  assertEquals(feedback.invoice, undefined);
  assertEquals(
    feedback.message,
    "Submit response was not received. Inspect the same invoice before retrying; submission is unconfirmed.",
  );
  assertEquals(feedback.message.toLowerCase().includes("timed out"), false);
  assertEquals(feedback.message.toLowerCase().includes("timeout"), false);
  assertEquals(feedback.message.toLowerCase().includes("inspect"), true);
  assertEquals(feedback.message.toLowerCase().includes("never"), false);
  assertEquals(feedback.message.toLowerCase().includes("rollback"), false);
});
