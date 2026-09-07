import { assertEquals } from "@std/assert";
import {
  clampAnchoredPopover,
  formatPurchaseInvoiceAmount,
  formatSignedPurchaseInvoiceAmount,
  interpretHostPurchaseInvoiceSubmit,
  interpretPurchaseInvoiceSubmitResult,
  interpretSubmitTransportFailure,
  PURCHASE_INVOICE_DOCTYPE,
  purchaseInvoiceConfirmAmount,
  purchaseInvoiceEffectiveTotal,
  purchaseInvoiceGrossTotal,
  purchaseInvoiceRoundingAria,
} from "./purchase-invoice.ts";
import { en } from "../i18n/en.ts";
import { fr } from "../i18n/fr.ts";

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

Deno.test("purchaseInvoiceGrossTotal - explicit envelope doctype only, never customer/supplier", () => {
  const rounded = pi({
    disable_rounded_total: 0,
    grand_total: 3.6,
    rounded_total: 4,
    rounding_adjustment: 0.4,
    customer: "Would-be sales",
  });
  const shown = purchaseInvoiceGrossTotal(PURCHASE_INVOICE_DOCTYPE, rounded);
  assertEquals(shown?.amount, 4);
  assertEquals(shown?.showNote, true);
  assertEquals(shown?.calculatedTotal, 3.6);

  assertEquals(
    purchaseInvoiceGrossTotal("Sales Invoice", rounded),
    null,
  );
  assertEquals(
    purchaseInvoiceGrossTotal("Purchase Order", rounded),
    null,
  );

  const unknown = purchaseInvoiceGrossTotal(
    PURCHASE_INVOICE_DOCTYPE,
    pi({ disable_rounded_total: undefined }),
  );
  assertEquals(unknown, null);

  const noAdj = purchaseInvoiceGrossTotal(PURCHASE_INVOICE_DOCTYPE, pi());
  assertEquals(noAdj?.amount, 3.6);
  assertEquals(noAdj?.showNote, false);
});

Deno.test("purchaseInvoiceGrossTotal - zero rounded_total keeps calculated amount without the icon", () => {
  const zeroRounded = purchaseInvoiceGrossTotal(
    PURCHASE_INVOICE_DOCTYPE,
    pi({
      disable_rounded_total: 0,
      grand_total: 0.4,
      rounded_total: 0,
      rounding_adjustment: -0.4,
      base_rounded_total: 0,
    }),
  );
  assertEquals(zeroRounded?.amount, 0.4);
  assertEquals(zeroRounded?.roundingAdjustment, 0);
  assertEquals(zeroRounded?.showNote, false);
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

Deno.test("interpretHostPurchaseInvoiceSubmit - PI-only gates, no extra submit fields", () => {
  const submitted = interpretHostPurchaseInvoiceSubmit(
    "erpnext_doc_submit",
    { doctype: "Purchase Invoice", name: "PINV-001" },
    {
      result: {
        structuredContent: {
          data: {
            name: "PINV-001",
            doctype: "Purchase Invoice",
            docstatus: 1,
          },
        },
      },
    },
  );
  assertEquals(submitted.applies, true);
  if (!submitted.applies) return;
  assertEquals(submitted.reason, "success");
  assertEquals(submitted.claimSubmitted, true);
  assertEquals(submitted.emitCommittedEvent, true);
  assertEquals(submitted.reread, true);

  const unconfirmed = interpretHostPurchaseInvoiceSubmit(
    "erpnext_doc_submit",
    { doctype: "Purchase Invoice", name: "PINV-001" },
    {
      result: {
        structuredContent: {
          data: {
            name: "PINV-001",
            doctype: "Purchase Invoice",
            docstatus: 0,
          },
        },
      },
    },
  );
  assertEquals(unconfirmed.applies, true);
  if (!unconfirmed.applies) return;
  assertEquals(unconfirmed.reason, "unconfirmed");
  assertEquals(unconfirmed.claimSubmitted, false);
  assertEquals(unconfirmed.emitCommittedEvent, false);
  assertEquals(unconfirmed.reread, true);
  assertEquals(unconfirmed.message.includes("Submitted"), false);

  const wrongIdentity = interpretHostPurchaseInvoiceSubmit(
    "erpnext_doc_submit",
    { doctype: "Purchase Invoice", name: "PINV-001" },
    {
      result: {
        structuredContent: {
          data: {
            name: "PINV-OTHER",
            doctype: "Purchase Invoice",
            docstatus: 1,
          },
        },
      },
    },
  );
  assertEquals(wrongIdentity.applies, true);
  if (!wrongIdentity.applies) return;
  assertEquals(wrongIdentity.claimSubmitted, false);
  assertEquals(wrongIdentity.emitCommittedEvent, false);
  assertEquals(wrongIdentity.reread, true);

  const callError = interpretHostPurchaseInvoiceSubmit(
    "erpnext_doc_submit",
    { doctype: "Purchase Invoice", name: "PINV-001" },
    { result: { isError: true, content: [{ type: "text", text: "Nope" }] } },
  );
  assertEquals(callError.applies, true);
  if (!callError.applies) return;
  assertEquals(callError.kind, "error");
  assertEquals(callError.reason, "error");
  assertEquals(callError.reread, false);
  assertEquals(callError.emitCommittedEvent, false);

  const transport = interpretHostPurchaseInvoiceSubmit(
    "erpnext_doc_submit",
    { doctype: "Purchase Invoice", name: "PINV-001" },
    { transportFailure: new Error("Tool call timed out after 10000ms") },
  );
  assertEquals(transport.applies, true);
  if (!transport.applies) return;
  assertEquals(transport.reason, "transport");
  assertEquals(transport.claimSubmitted, false);
  assertEquals(transport.emitCommittedEvent, false);
  assertEquals(transport.reread, true);
  assertEquals(transport.message.toLowerCase().includes("timeout"), false);

  assertEquals(
    interpretHostPurchaseInvoiceSubmit(
      "erpnext_doc_cancel",
      { doctype: "Purchase Invoice", name: "PINV-001" },
      { result: { structuredContent: { data: { docstatus: 2 } } } },
    ).applies,
    false,
  );
  assertEquals(
    interpretHostPurchaseInvoiceSubmit(
      "erpnext_doc_submit",
      { doctype: "Sales Invoice", name: "SINV-001" },
      {
        result: {
          structuredContent: {
            data: {
              name: "SINV-001",
              doctype: "Sales Invoice",
              docstatus: 1,
            },
          },
        },
      },
    ).applies,
    false,
  );
  assertEquals(
    interpretHostPurchaseInvoiceSubmit(
      "erpnext_sales_invoice_submit",
      { name: "SINV-001" },
      { result: {} },
    ).applies,
    false,
  );
});

Deno.test("purchaseInvoiceRoundingAria - signed copy without a visible rounding badge", () => {
  assertEquals(
    purchaseInvoiceRoundingAria(0.4, 4, "EUR"),
    {
      key: "document.purchase_invoice.aria.adds",
      params: { amount: "0.4 EUR" },
    },
  );
  assertEquals(
    purchaseInvoiceRoundingAria(-0.4, 4, "EUR"),
    {
      key: "document.purchase_invoice.aria.reduces",
      params: { amount: "0.4 EUR" },
    },
  );
  assertEquals(
    purchaseInvoiceRoundingAria(-0.4, -4, "EUR"),
    {
      key: "document.purchase_invoice.aria.adjustment",
      params: { signed: "-0.4 EUR" },
    },
  );
});

Deno.test("clampAnchoredPopover - stays inside a 390px frame and a wide panel", () => {
  const narrow = clampAnchoredPopover(
    { top: 80, left: 350, right: 374, bottom: 104 },
    { width: 390, height: 640 },
    { width: 280, height: 160 },
  );
  assertEquals(narrow.left >= 8, true);
  assertEquals(narrow.left + 280 <= 390 - 8, true);
  assertEquals(narrow.top >= 8, true);
  assertEquals(narrow.top + 160 <= 640 - 8, true);

  const flipUp = clampAnchoredPopover(
    { top: 500, left: 100, right: 124, bottom: 530 },
    { width: 390, height: 560 },
    { width: 240, height: 180 },
  );
  assertEquals(flipUp.top + 180 <= 530, true);

  const wide = clampAnchoredPopover(
    { top: 40, left: 900, right: 924, bottom: 64 },
    { width: 1100, height: 800 },
    { width: 280, height: 140 },
  );
  assertEquals(wide.left, 924 - 280);
  assertEquals(wide.top, 64 + 6);
});

Deno.test("purchaseInvoiceConfirmAmount - known PI total only, exact precision", () => {
  assertEquals(
    purchaseInvoiceConfirmAmount(
      PURCHASE_INVOICE_DOCTYPE,
      pi({ grand_total: 3.123 }),
    ),
    "3.123 EUR",
  );
  assertEquals(
    purchaseInvoiceConfirmAmount("Sales Invoice", pi()),
    null,
  );
  assertEquals(
    purchaseInvoiceConfirmAmount(
      PURCHASE_INVOICE_DOCTYPE,
      pi({ disable_rounded_total: undefined }),
    ),
    null,
  );
});

Deno.test("i18n - exact ERP label Disable Rounded Total is kept in EN and FR hints", () => {
  assertEquals(
    en["document.purchase_invoice.disable_rounded_total"],
    "Disable Rounded Total",
  );
  assertEquals(
    fr["document.purchase_invoice.disable_rounded_total"],
    "Disable Rounded Total",
  );
  assertEquals(
    en["document.purchase_invoice.hint.draft"].includes("{label}"),
    true,
  );
  assertEquals(
    fr["document.purchase_invoice.hint.draft"].includes("{label}"),
    true,
  );
  assertEquals(
    en["document.purchase_invoice.hint.submitted"].includes("{label}"),
    true,
  );
  assertEquals(
    fr["document.purchase_invoice.hint.submitted"].includes("{label}"),
    true,
  );
});
