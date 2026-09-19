/**
 * App, capture, result, and recorded-session identities owned by mcp-erpnext.
 *
 * Package and App versions are the same published prerelease (3.1.0-beta.11).
 * Presentation of sealed Buy evidence is not a live ERP qualification.
 *
 * `sourceInstance.siteId` is SHA-256 of the configured FrappeClient
 * normalized site URL (origin + site path). It is not an ERP database UUID.
 */

export const BUY_SOURCE_CAPTURE_SCHEMA =
  "io.casys.mcp-erpnext.buy-source-capture/1.0" as const;
export const BUY_RECORDED_RESULT_SCHEMA =
  "io.casys.mcp-erpnext.buy-recorded-result/1.0" as const;
export const BUY_RECORDED_RESULT_SCHEMA_V2 =
  "io.casys.mcp-erpnext.buy-recorded-result/2.0" as const;
export const BUY_RECORDED_RESULT_SCHEMAS = [
  BUY_RECORDED_RESULT_SCHEMA,
  BUY_RECORDED_RESULT_SCHEMA_V2,
] as const;
export const BUY_RECORDED_SESSION_SCHEMA =
  "io.casys.mcp-erpnext.buy-recorded-session/1.0" as const;

export const BUY_VIEWER_SESSION_KIND = "buy.configuration-cost" as const;
export const BUY_RECORDED_RESULT_KIND = "buy.configuration-cost" as const;

export const BUY_EVIDENCE_VIEWER_URI =
  "ui://mcp-erpnext/buy-evidence-viewer" as const;
export const BUY_VIEW_APP_MANIFEST_URI =
  "ui://mcp-erpnext/buy-evidence-manifest" as const;

export const BUY_VIEW_APP_ID = "io.casys.mcp-erpnext.buy-evidence" as const;
export const BUY_VIEW_APP_TITLE = "ERPNext Buy Evidence" as const;
export const BUY_VIEW_APP_VERSION = "3.1.0-beta.11" as const;

export const BUY_SEAL_OPERATION = "buy.seal-configuration-cost@1" as const;
export const BUY_CAPTURE_OPERATION =
  "buy.capture-configuration-cost@1" as const;

export const BUY_SOURCE_INSTANCE_KIND = "erpnext-site" as const;

export const BUY_CAPTURE_URI_PREFIX =
  "casys://mcp-erpnext/buy-source-capture/sha256/" as const;
export const BUY_CAPTURE_URI_PATTERN =
  /^casys:\/\/mcp-erpnext\/buy-source-capture\/sha256\/([a-f0-9]{64})$/;

export const BUY_RESULT_URI_PREFIX =
  "casys://mcp-erpnext/buy-recorded-result/sha256/" as const;
export const BUY_RESULT_URI_PATTERN =
  /^casys:\/\/mcp-erpnext\/buy-recorded-result\/sha256\/([a-f0-9]{64})$/;

/** Published DT seal-capture URI. Not a provider result artifact. */
export const BUY_BUNDLE_URI_PREFIX =
  "casys://buy-configuration-cost-seal-capture/sha256/" as const;
export const BUY_BUNDLE_URI_PATTERN =
  /^casys:\/\/buy-configuration-cost-seal-capture\/sha256\/([a-f0-9]{64})$/;
export const BUY_BUNDLE_ARTIFACT_KIND = "document" as const;
export const BUY_BUNDLE_ARTIFACT_ID_PATTERN = /^buy-cost-bundle-[a-f0-9]{64}$/;

export const BUY_CAPTURE_DOCTYPE = [
  "Item",
  "BOM",
  "Item Price",
  "Supplier Quotation",
  "Supplier",
  "Price List",
  "UOM",
  "Currency Exchange",
] as const;

export type BuyCaptureDoctype = typeof BUY_CAPTURE_DOCTYPE[number];

export const BUY_CAPTURE_MAX_DOCUMENTS = 32;
export const BUY_CAPTURE_MAX_CHILD_ROWS = 200;
export const BUY_CAPTURE_MAX_CANONICAL_BYTES = 262144;
export const BUY_CAPTURE_MAX_NAME_LENGTH = 140;
export const BUY_RESULT_MAX_LINES = 200;
export const BUY_RESULT_MAX_GAPS = 200;
export const BUY_RESULT_MAX_CAPTURES = 32;

export const BUY_PRICE_SOURCE_CATEGORIES = [
  "catalogue-price",
  "supplier-quotation",
  "historical-invoice",
  "documentary-estimate",
] as const;

export type BuyPriceSourceCategory = typeof BUY_PRICE_SOURCE_CATEGORIES[number];

export const BUY_DOCUMENT_SOURCE_CATEGORIES = [
  "item",
  "bom",
  "catalogue-price",
  "supplier-quotation",
  "supplier",
  "price-list",
  "uom",
  "currency-exchange",
] as const;

export type BuyDocumentSourceCategory =
  typeof BUY_DOCUMENT_SOURCE_CATEGORIES[number];

export const BUY_DOCTYPE_SOURCE_CATEGORY = {
  Item: "item",
  BOM: "bom",
  "Item Price": "catalogue-price",
  "Supplier Quotation": "supplier-quotation",
  Supplier: "supplier",
  "Price List": "price-list",
  UOM: "uom",
  "Currency Exchange": "currency-exchange",
} as const satisfies Record<BuyCaptureDoctype, BuyDocumentSourceCategory>;

export const BUY_COVERAGE_STATUSES = [
  "complete",
  "partial",
  "unresolved",
] as const;

export type BuyCoverageStatus = typeof BUY_COVERAGE_STATUSES[number];

export const BUY_TOTAL_KINDS = [
  "covered-subtotal",
  "complete-total",
] as const;

export type BuyTotalKind = typeof BUY_TOTAL_KINDS[number];

export const BUY_PROJECTION_STATUSES = [
  "available",
  "unresolved",
  "unavailable",
] as const;

export type BuyProjectionStatus = typeof BUY_PROJECTION_STATUSES[number];

export const BUY_CONSISTENCY_KIND = "repeated-read" as const;
export const BUY_CONSISTENCY_READS = 2;

export const SYNTHETIC_TEST_NOTICE =
  "synthetic test input — not a commercial amount, quote, invoice, or purchase";
