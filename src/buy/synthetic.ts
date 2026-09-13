/**
 * Synthetic labelled Buy contract fixtures.
 *
 * Every commercial amount is a test input. None of these values is a real
 * catalogue price, supplier quotation, invoice, or purchase.
 */

import {
  BUY_BUNDLE_ARTIFACT_KIND,
  BUY_BUNDLE_URI_PREFIX,
  BUY_CAPTURE_URI_PREFIX,
  BUY_RECORDED_RESULT_KIND,
  BUY_RECORDED_RESULT_SCHEMA,
  BUY_RECORDED_RESULT_SCHEMA_V2,
  BUY_RECORDED_SESSION_SCHEMA,
  BUY_SEAL_OPERATION,
  BUY_SOURCE_CAPTURE_SCHEMA,
  BUY_SOURCE_INSTANCE_KIND,
  BUY_VIEWER_SESSION_KIND,
  SYNTHETIC_TEST_NOTICE,
} from "./identities.ts";
import { canonicalJson, sha256FingerprintOfUtf8 } from "../shared/json.ts";
import type { BuySourceCapture } from "./capture.ts";
import type { BuyRecordedResult, BuyRecordedResultV2 } from "./result.ts";
import type { BuyViewerSession } from "./session.ts";
import { withSessionFingerprint } from "./session.ts";

export const SYNTHETIC_SITE_URL = "https://erp.test.example/site-a";
export const SYNTHETIC_CAPTURED_AT = "2026-09-12T10:00:00.000Z";
export const SYNTHETIC_OBSERVED_AT = "2026-09-12T10:00:00.000Z";
export const SYNTHETIC_MODIFIED = "2026-09-01 08:00:00.000000";
export const SYNTHETIC_BUNDLE_DIGEST = "d".repeat(64);
export const SYNTHETIC_SEAL_CAPTURE_DIGEST = "d".repeat(64);

export function syntheticPublishedBundleRef(): {
  readonly uri: string;
  readonly fingerprint: string;
} {
  return {
    uri: `${BUY_BUNDLE_URI_PREFIX}${SYNTHETIC_SEAL_CAPTURE_DIGEST}`,
    fingerprint: `sha256:${SYNTHETIC_SEAL_CAPTURE_DIGEST}`,
  };
}

export function syntheticPublishedBundleAnchor(): {
  readonly kind: typeof BUY_BUNDLE_ARTIFACT_KIND;
  readonly id: string;
  readonly uri: string;
  readonly fingerprint: string;
} {
  return {
    kind: BUY_BUNDLE_ARTIFACT_KIND,
    id: `buy-cost-bundle-${SYNTHETIC_BUNDLE_DIGEST}`,
    ...syntheticPublishedBundleRef(),
  };
}

export async function syntheticSiteId(
  siteUrl = SYNTHETIC_SITE_URL,
): Promise<string> {
  return await sha256FingerprintOfUtf8(siteUrl);
}

export async function syntheticCapture(
  options: { expiredPrice?: boolean } = {},
): Promise<BuySourceCapture> {
  const siteId = await syntheticSiteId();
  const item = {
    doctype: "Item" as const,
    name: "ITEM-SYNTHETIC-001",
    modified: SYNTHETIC_MODIFIED,
    docstatus: 0,
    sourceCategory: "item" as const,
    fields: {
      item_code: "ITEM-SYNTHETIC-001",
      item_name: "Synthetic bracket",
      stock_uom: "Nos",
      is_purchase_item: true,
      disabled: false,
    },
  };
  const bom = {
    doctype: "BOM" as const,
    name: "BOM-SYNTHETIC-001",
    modified: SYNTHETIC_MODIFIED,
    docstatus: 1,
    status: "Submitted",
    sourceCategory: "bom" as const,
    fields: {
      item: "ITEM-SYNTHETIC-001",
      item_name: "Synthetic bracket",
      quantity: "1",
      uom: "Nos",
      is_active: true,
      is_default: true,
      currency: "EUR",
    },
    children: [{
      table: "items",
      rows: [{
        name: "row-synthetic-bom-item-001",
        idx: 1,
        fields: {
          item_code: "ITEM-SYNTHETIC-FASTENER",
          item_name: "Synthetic fastener",
          qty: "4",
          uom: "Nos",
          rate: "1.25",
          amount: "5.00",
        },
      }],
    }],
  };
  const itemPrice = {
    doctype: "Item Price" as const,
    name: "ITEM-PRICE-SYNTHETIC-001",
    modified: SYNTHETIC_MODIFIED,
    docstatus: 0,
    sourceCategory: "catalogue-price" as const,
    fields: {
      item_code: "ITEM-SYNTHETIC-FASTENER",
      item_name: "Synthetic fastener",
      price_list: "SYNTHETIC-BUYING",
      price_list_rate: "1.25",
      currency: "EUR",
      uom: "Nos",
      min_qty: "1",
      valid_from: "2026-01-01",
      valid_upto: options.expiredPrice ? "2026-06-01" : "2026-12-31",
      buying: true,
      selling: false,
    },
  };
  const quotation = {
    doctype: "Supplier Quotation" as const,
    name: "SQ-SYNTHETIC-001",
    modified: SYNTHETIC_MODIFIED,
    docstatus: 1,
    status: "Submitted",
    sourceCategory: "supplier-quotation" as const,
    fields: {
      supplier: "SUP-SYNTHETIC-001",
      supplier_name: "Synthetic Metals",
      transaction_date: "2026-08-01",
      valid_till: "2026-12-31",
      currency: "EUR",
      conversion_rate: "1",
      company: "SYNTHETIC-CO",
    },
    children: [{
      table: "items",
      rows: [{
        name: "row-synthetic-sq-item-001",
        idx: 1,
        fields: {
          item_code: "ITEM-SYNTHETIC-FASTENER",
          item_name: "Synthetic fastener",
          qty: "4",
          uom: "Nos",
          rate: "1.10",
          amount: "4.40",
        },
      }],
    }],
  };
  const documents = [];
  for (const document of [item, bom, itemPrice, quotation]) {
    documents.push({
      ...document,
      fingerprint: await sha256FingerprintOfUtf8(
        canonicalJson(document, "synthetic document"),
      ),
    });
  }
  return {
    schemaVersion: BUY_SOURCE_CAPTURE_SCHEMA,
    sourceInstance: { kind: BUY_SOURCE_INSTANCE_KIND, siteId },
    capturedAt: SYNTHETIC_CAPTURED_AT,
    documents,
    consistency: { kind: "repeated-read", reads: 2, consistent: true },
  };
}

export async function syntheticCompleteResult(
  captureFingerprint: string,
  siteId: string,
): Promise<BuyRecordedResult> {
  const captureUri = `${BUY_CAPTURE_URI_PREFIX}${
    captureFingerprint.slice("sha256:".length)
  }`;
  return {
    schemaVersion: BUY_RECORDED_RESULT_SCHEMA,
    kind: BUY_RECORDED_RESULT_KIND,
    configurationRef: {
      uri: "casys://digital-thread/buy-configuration/sha256/" + "a".repeat(64),
      fingerprint: `sha256:${"a".repeat(64)}`,
    },
    configuration: {
      projectId: "proj-synthetic-buy",
      subjectId: "subj-synthetic-bracket",
      configurationRevision: 3,
    },
    sourceCaptures: [{
      sourceInstance: { kind: BUY_SOURCE_INSTANCE_KIND, siteId },
      fingerprint: captureFingerprint,
      capturedAt: SYNTHETIC_CAPTURED_AT,
      uri: captureUri,
    }],
    pricingContext: {
      currency: "EUR",
      observedAt: SYNTHETIC_OBSERVED_AT,
      priceList: "SYNTHETIC-BUYING",
    },
    lines: [{
      lineId: "line-fastener",
      sourceCategory: "catalogue-price",
      itemCode: "ITEM-SYNTHETIC-FASTENER",
      description: SYNTHETIC_TEST_NOTICE,
      qty: "4",
      uom: "Nos",
      unitPrice: "1.25",
      currency: "EUR",
      lineAmount: "5.00",
      priceDate: "2026-01-01",
      validFrom: "2026-01-01",
      validUpto: "2026-12-31",
      observedAt: SYNTHETIC_OBSERVED_AT,
      source: {
        kind: "erpnext-document",
        sourceInstance: { kind: BUY_SOURCE_INSTANCE_KIND, siteId },
        doctype: "Item Price",
        name: "ITEM-PRICE-SYNTHETIC-001",
        modified: SYNTHETIC_MODIFIED,
        fingerprint: `sha256:${"b".repeat(64)}`,
      },
    }],
    coverage: {
      status: "complete",
      coveredLineIds: ["line-fastener"],
      excludedLineIds: [],
      quantityBasis: "BOM-SYNTHETIC-001 items qty",
      currency: "EUR",
    },
    totals: [
      { kind: "covered-subtotal", currency: "EUR", amount: "5.00" },
      { kind: "complete-total", currency: "EUR", amount: "5.00" },
    ],
    gaps: [],
    basis: {
      current: { configurationRevision: 3, capturedAt: SYNTHETIC_CAPTURED_AT },
    },
  };
}

export async function syntheticUnpricedResult(
  captureFingerprint: string,
  siteId: string,
): Promise<BuyRecordedResultV2> {
  const complete = await syntheticCompleteResult(captureFingerprint, siteId);
  return {
    ...complete,
    schemaVersion: BUY_RECORDED_RESULT_SCHEMA_V2,
    coverage: {
      status: "partial",
      coveredLineIds: ["line-fastener"],
      excludedLineIds: ["line-unpriced"],
      quantityBasis: "BOM-SYNTHETIC-001 items qty",
      currency: "EUR",
    },
    totals: [{ kind: "covered-subtotal", currency: "EUR", amount: "5.00" }],
    gaps: [{
      code: "price-unavailable",
      reason: "No admitted price source for the selected configuration line",
      lineId: "line-unpriced",
    }],
    excludedLines: [{
      lineId: "line-unpriced",
      qty: "1",
      uom: "Nos",
      reason: "No admitted price source",
    }],
  };
}

export async function syntheticPartialResult(
  captureFingerprint: string,
  siteId: string,
): Promise<BuyRecordedResult> {
  const complete = await syntheticCompleteResult(captureFingerprint, siteId);
  return {
    ...complete,
    lines: [
      complete.lines[0],
      {
        lineId: "line-estimate",
        sourceCategory: "documentary-estimate",
        itemCode: "ITEM-SYNTHETIC-001",
        description: SYNTHETIC_TEST_NOTICE,
        qty: "1",
        uom: "Nos",
        unitPrice: "20.00",
        currency: "EUR",
        lineAmount: "20.00",
        priceDate: "2026-08-15",
        observedAt: SYNTHETIC_OBSERVED_AT,
        source: {
          kind: "external-documentary",
          uri: "casys://digital-thread/documentary-estimate/sha256/" +
            "c".repeat(64),
          fingerprint: `sha256:${"c".repeat(64)}`,
        },
      },
    ],
    coverage: {
      status: "partial",
      coveredLineIds: ["line-fastener"],
      excludedLineIds: ["line-estimate"],
      quantityBasis: "BOM-SYNTHETIC-001 items qty",
      currency: "EUR",
    },
    totals: [
      { kind: "covered-subtotal", currency: "EUR", amount: "5.00" },
    ],
    gaps: [{
      code: "documentary",
      reason: "documentary estimate is not a priced ERP source",
      lineId: "line-estimate",
    }],
  };
}

export async function syntheticPartialGlobalGapResult(
  captureFingerprint: string,
  siteId: string,
): Promise<BuyRecordedResult> {
  const complete = await syntheticCompleteResult(captureFingerprint, siteId);
  return {
    ...complete,
    coverage: {
      ...complete.coverage,
      status: "partial",
    },
    totals: [
      { kind: "covered-subtotal", currency: "EUR", amount: "5.00" },
    ],
    gaps: [{
      code: "transport-unknown",
      reason: "Synthetic missing transport source",
    }],
  };
}

export async function syntheticExpiredGapResult(
  captureFingerprint: string,
  siteId: string,
): Promise<BuyRecordedResult> {
  const complete = await syntheticCompleteResult(captureFingerprint, siteId);
  const line = {
    ...complete.lines[0],
    validUpto: "2026-06-01",
  };
  return {
    ...complete,
    lines: [line],
    coverage: {
      status: "unresolved",
      coveredLineIds: [],
      excludedLineIds: ["line-fastener"],
      quantityBasis: "BOM-SYNTHETIC-001 items qty",
      currency: "EUR",
    },
    totals: [
      { kind: "covered-subtotal", currency: "EUR", amount: "0" },
    ],
    gaps: [{
      code: "expired",
      reason: "catalogue price valid_upto 2026-06-01 is before observedAt",
      lineId: "line-fastener",
    }],
  };
}

export async function syntheticAvailableSession(
  result: BuyRecordedResult,
): Promise<BuyViewerSession> {
  const bundle = syntheticPublishedBundleAnchor();
  return await withSessionFingerprint({
    schemaVersion: BUY_RECORDED_SESSION_SCHEMA,
    kind: BUY_VIEWER_SESSION_KIND,
    basis: {
      projectId: result.configuration.projectId,
      projectRevision: 7,
      subjectId: result.configuration.subjectId,
      thread: { id: "thread-synthetic-buy", revision: 4 },
    },
    anchor: bundle,
    provenance: {
      kind: "digital-thread-operation",
      operation: BUY_SEAL_OPERATION,
      runId: "run-synthetic-buy-001",
      configurationRef: result.configurationRef,
      bundleRef: syntheticPublishedBundleRef(),
      captureRefs: result.sourceCaptures.map((capture) => ({
        uri: capture.uri,
        fingerprint: capture.fingerprint,
      })),
    },
    projection: { status: "available", result },
  });
}

export async function syntheticUnavailableSession(
  captureFingerprint: string,
): Promise<BuyViewerSession> {
  const bundle = syntheticPublishedBundleAnchor();
  return await withSessionFingerprint({
    schemaVersion: BUY_RECORDED_SESSION_SCHEMA,
    kind: BUY_VIEWER_SESSION_KIND,
    basis: {
      projectId: "proj-synthetic-buy",
      projectRevision: 7,
      subjectId: "subj-synthetic-bracket",
      thread: { id: "thread-synthetic-buy", revision: 4 },
    },
    anchor: bundle,
    provenance: {
      kind: "digital-thread-operation",
      operation: BUY_SEAL_OPERATION,
      runId: "run-synthetic-buy-001",
      configurationRef: {
        uri: "casys://digital-thread/buy-configuration/sha256/" +
          "a".repeat(64),
        fingerprint: `sha256:${"a".repeat(64)}`,
      },
      bundleRef: syntheticPublishedBundleRef(),
      captureRefs: [{
        uri: `${BUY_CAPTURE_URI_PREFIX}${
          captureFingerprint.slice("sha256:".length)
        }`,
        fingerprint: captureFingerprint,
      }],
    },
    projection: {
      status: "unavailable",
      reason: "unavailable recorded bundle bytes",
    },
  });
}

export async function syntheticUnresolvedSession(
  captureFingerprint: string,
): Promise<BuyViewerSession> {
  const session = await syntheticUnavailableSession(
    captureFingerprint,
  );
  return await withSessionFingerprint({
    ...session,
    basis: {
      projectId: session.basis.projectId,
      projectRevision: session.basis.projectRevision,
      subjectId: session.basis.subjectId,
      thread: session.basis.thread,
    },
    projection: {
      status: "unresolved",
      reason: "unresolved configuration to item binding",
    },
  });
}
