/**
 * Strict parser for io.casys.mcp-erpnext.buy-recorded-result/1.0.
 *
 * The provider owns this projection schema. Digital Thread selects reviewed
 * cost lines and calculates sums; this parser never recomputes a total.
 * Incomplete valid results remain visible with complete/partial/unresolved
 * labels. complete-total is admitted only when coverage.status is complete.
 */

import {
  BUY_COVERAGE_STATUSES,
  BUY_PRICE_SOURCE_CATEGORIES,
  BUY_RECORDED_RESULT_KIND,
  BUY_RECORDED_RESULT_SCHEMA,
  BUY_RESULT_MAX_CAPTURES,
  BUY_RESULT_MAX_GAPS,
  BUY_RESULT_MAX_LINES,
  BUY_SOURCE_INSTANCE_KIND,
  BUY_TOTAL_KINDS,
  type BuyCoverageStatus,
  type BuyPriceSourceCategory,
  type BuyTotalKind,
} from "./identities.ts";
import {
  boundedArray,
  calendarDate,
  canonicalTimestamp,
  currencyCode,
  decimalString,
  exactRecord,
  fingerprint,
  frappeDatetime,
  literal,
  nonEmpty,
  nonNegativeInteger,
  oneOf,
  record,
} from "./json.ts";
import type { BuySourceInstance } from "./site.ts";

export interface BuyArtifactRef {
  readonly uri: string;
  readonly fingerprint: string;
}

export interface BuyResultConfiguration {
  readonly projectId: string;
  readonly subjectId: string;
  readonly configurationRevision: number;
}

export interface BuyResultSourceCapture {
  readonly sourceInstance: BuySourceInstance;
  readonly fingerprint: string;
  readonly capturedAt: string;
  readonly uri: string;
}

export interface BuyPricingContext {
  readonly currency: string;
  readonly observedAt: string;
  readonly priceList?: string;
}

export interface BuyErpDocumentSource {
  readonly kind: "erpnext-document";
  readonly sourceInstance: BuySourceInstance;
  readonly doctype: string;
  readonly name: string;
  readonly modified: string;
  readonly row?: string;
  readonly fingerprint: string;
}

export interface BuyExternalDocumentarySource {
  readonly kind: "external-documentary";
  readonly uri: string;
  readonly fingerprint: string;
}

export type BuyResultLineSource =
  | BuyErpDocumentSource
  | BuyExternalDocumentarySource;

export interface BuyResultLine {
  readonly lineId: string;
  readonly sourceCategory: BuyPriceSourceCategory;
  readonly itemCode?: string;
  readonly description?: string;
  readonly qty: string;
  readonly uom: string;
  readonly unitPrice: string;
  readonly currency: string;
  readonly lineAmount: string;
  readonly priceDate: string;
  readonly validFrom?: string;
  readonly validUpto?: string;
  readonly observedAt: string;
  readonly source: BuyResultLineSource;
}

export interface BuyResultCoverage {
  readonly status: BuyCoverageStatus;
  readonly coveredLineIds: readonly string[];
  readonly excludedLineIds: readonly string[];
  readonly quantityBasis: string;
  readonly currency: string;
}

export interface BuyResultTotal {
  readonly kind: BuyTotalKind;
  readonly currency: string;
  readonly amount: string;
}

export interface BuyResultGap {
  readonly code: string;
  readonly reason: string;
  readonly lineId?: string;
}

export interface BuyResultBasisSlice {
  readonly configurationRevision: number;
  readonly capturedAt: string;
}

export interface BuyResultBasis {
  readonly current: BuyResultBasisSlice;
  readonly old?: BuyResultBasisSlice;
}

export interface BuyRecordedResult {
  readonly schemaVersion: typeof BUY_RECORDED_RESULT_SCHEMA;
  readonly kind: typeof BUY_RECORDED_RESULT_KIND;
  readonly configurationRef: BuyArtifactRef;
  readonly configuration: BuyResultConfiguration;
  readonly sourceCaptures: readonly BuyResultSourceCapture[];
  readonly pricingContext: BuyPricingContext;
  readonly lines: readonly BuyResultLine[];
  readonly coverage: BuyResultCoverage;
  readonly totals: readonly BuyResultTotal[];
  readonly gaps: readonly BuyResultGap[];
  readonly basis: BuyResultBasis;
}

export function parseBuyRecordedResult(value: unknown): BuyRecordedResult {
  const root = exactRecord(value, [
    "schemaVersion",
    "kind",
    "configurationRef",
    "configuration",
    "sourceCaptures",
    "pricingContext",
    "lines",
    "coverage",
    "totals",
    "gaps",
    "basis",
  ], "buy recorded result");
  literal(
    root.schemaVersion,
    BUY_RECORDED_RESULT_SCHEMA,
    "buy recorded result.schemaVersion",
  );
  literal(root.kind, BUY_RECORDED_RESULT_KIND, "buy recorded result.kind");
  const configurationRef = parseArtifactRef(
    root.configurationRef,
    "buy recorded result.configurationRef",
  );
  const configuration = parseConfiguration(root.configuration);
  const sourceCaptures = boundedArray(
    root.sourceCaptures,
    BUY_RESULT_MAX_CAPTURES,
    "buy recorded result.sourceCaptures",
  ).map((item, index) =>
    parseSourceCapture(item, `buy recorded result.sourceCaptures[${index}]`)
  );
  if (sourceCaptures.length === 0) {
    throw new TypeError(
      "buy recorded result.sourceCaptures must not be empty.",
    );
  }
  assertSingleSite(sourceCaptures);
  const pricingContext = parsePricingContext(root.pricingContext);
  const lines = boundedArray(
    root.lines,
    BUY_RESULT_MAX_LINES,
    "buy recorded result.lines",
  ).map((item, index) =>
    parseLine(item, `buy recorded result.lines[${index}]`, sourceCaptures)
  );
  const lineIds = new Set<string>();
  for (const line of lines) {
    if (lineIds.has(line.lineId)) {
      throw new TypeError(
        "buy recorded result.lines lineId values must be unique.",
      );
    }
    lineIds.add(line.lineId);
  }
  const coverage = parseCoverage(root.coverage, lineIds);
  const totals = boundedArray(
    root.totals,
    8,
    "buy recorded result.totals",
  ).map((item, index) =>
    parseTotal(
      item,
      `buy recorded result.totals[${index}]`,
      coverage,
      pricingContext,
    )
  );
  assertTotals(totals, coverage);
  const gaps = boundedArray(
    root.gaps,
    BUY_RESULT_MAX_GAPS,
    "buy recorded result.gaps",
  ).map((item, index) =>
    parseGap(item, `buy recorded result.gaps[${index}]`, lineIds)
  );
  assertCoverageIncompleteness(coverage, gaps);
  const basis = parseBasis(root.basis);
  return {
    schemaVersion: BUY_RECORDED_RESULT_SCHEMA,
    kind: BUY_RECORDED_RESULT_KIND,
    configurationRef,
    configuration,
    sourceCaptures,
    pricingContext,
    lines,
    coverage,
    totals,
    gaps,
    basis,
  };
}

function parseArtifactRef(value: unknown, name: string): BuyArtifactRef {
  const root = exactRecord(value, ["uri", "fingerprint"], name);
  return {
    uri: nonEmpty(root.uri, `${name}.uri`),
    fingerprint: fingerprint(root.fingerprint, `${name}.fingerprint`),
  };
}

function parseConfiguration(value: unknown): BuyResultConfiguration {
  const root = exactRecord(value, [
    "projectId",
    "subjectId",
    "configurationRevision",
  ], "buy recorded result.configuration");
  return {
    projectId: nonEmpty(
      root.projectId,
      "buy recorded result.configuration.projectId",
    ),
    subjectId: nonEmpty(
      root.subjectId,
      "buy recorded result.configuration.subjectId",
    ),
    configurationRevision: nonNegativeInteger(
      root.configurationRevision,
      "buy recorded result.configuration.configurationRevision",
    ),
  };
}

function parseSourceCapture(
  value: unknown,
  name: string,
): BuyResultSourceCapture {
  const root = exactRecord(value, [
    "sourceInstance",
    "fingerprint",
    "capturedAt",
    "uri",
  ], name);
  return {
    sourceInstance: parseSourceInstance(
      root.sourceInstance,
      `${name}.sourceInstance`,
    ),
    fingerprint: fingerprint(root.fingerprint, `${name}.fingerprint`),
    capturedAt: canonicalTimestamp(root.capturedAt, `${name}.capturedAt`),
    uri: nonEmpty(root.uri, `${name}.uri`),
  };
}

function parseSourceInstance(value: unknown, name: string): BuySourceInstance {
  const root = exactRecord(value, ["kind", "siteId"], name);
  literal(root.kind, BUY_SOURCE_INSTANCE_KIND, `${name}.kind`);
  return {
    kind: BUY_SOURCE_INSTANCE_KIND,
    siteId: fingerprint(root.siteId, `${name}.siteId`),
  };
}

function parsePricingContext(value: unknown): BuyPricingContext {
  const root = record(value, "buy recorded result.pricingContext");
  const keys = Object.keys(root).toSorted();
  const allowed = root.priceList === undefined
    ? ["currency", "observedAt"]
    : ["currency", "observedAt", "priceList"];
  if (
    keys.length !== allowed.length ||
    keys.some((key, index) => key !== allowed.toSorted()[index])
  ) {
    throw new TypeError(
      "buy recorded result.pricingContext contains missing or unsupported fields.",
    );
  }
  return {
    currency: currencyCode(
      root.currency,
      "buy recorded result.pricingContext.currency",
    ),
    observedAt: canonicalTimestamp(
      root.observedAt,
      "buy recorded result.pricingContext.observedAt",
    ),
    ...(root.priceList === undefined ? {} : {
      priceList: nonEmpty(
        root.priceList,
        "buy recorded result.pricingContext.priceList",
      ),
    }),
  };
}

function parseLine(
  value: unknown,
  name: string,
  captures: readonly BuyResultSourceCapture[],
): BuyResultLine {
  const root = record(value, name);
  const optional = new Set([
    "itemCode",
    "description",
    "validFrom",
    "validUpto",
  ]);
  const required = [
    "currency",
    "lineAmount",
    "lineId",
    "observedAt",
    "priceDate",
    "qty",
    "source",
    "sourceCategory",
    "unitPrice",
    "uom",
  ];
  const keys = Object.keys(root).toSorted();
  const actualRequired = keys.filter((key) => !optional.has(key)).toSorted();
  if (
    actualRequired.length !== required.length ||
    actualRequired.some((key, index) => key !== required[index])
  ) {
    throw new TypeError(`${name} contains missing or unsupported fields.`);
  }
  const sourceCategory = oneOf(
    root.sourceCategory,
    BUY_PRICE_SOURCE_CATEGORIES,
    `${name}.sourceCategory`,
  );
  const source = parseLineSource(
    root.source,
    `${name}.source`,
    sourceCategory,
    captures,
  );
  return {
    lineId: nonEmpty(root.lineId, `${name}.lineId`),
    sourceCategory,
    ...(root.itemCode === undefined
      ? {}
      : { itemCode: nonEmpty(root.itemCode, `${name}.itemCode`) }),
    ...(root.description === undefined
      ? {}
      : { description: nonEmpty(root.description, `${name}.description`) }),
    qty: decimalString(root.qty, `${name}.qty`),
    uom: nonEmpty(root.uom, `${name}.uom`),
    unitPrice: decimalString(root.unitPrice, `${name}.unitPrice`),
    currency: currencyCode(root.currency, `${name}.currency`),
    lineAmount: decimalString(root.lineAmount, `${name}.lineAmount`),
    priceDate: calendarDate(root.priceDate, `${name}.priceDate`),
    ...(root.validFrom === undefined
      ? {}
      : { validFrom: calendarDate(root.validFrom, `${name}.validFrom`) }),
    ...(root.validUpto === undefined
      ? {}
      : { validUpto: calendarDate(root.validUpto, `${name}.validUpto`) }),
    observedAt: canonicalTimestamp(root.observedAt, `${name}.observedAt`),
    source,
  };
}

function parseLineSource(
  value: unknown,
  name: string,
  category: BuyPriceSourceCategory,
  captures: readonly BuyResultSourceCapture[],
): BuyResultLineSource {
  const root = record(value, name);
  if (root.kind === "erpnext-document") {
    if (category !== "catalogue-price" && category !== "supplier-quotation") {
      throw new TypeError(
        `${name} erpnext-document cannot carry ${category}; historical-invoice and documentary-estimate are external-documentary.`,
      );
    }
    const keys = Object.keys(root).toSorted();
    const allowed = root.row === undefined
      ? ["doctype", "fingerprint", "kind", "modified", "name", "sourceInstance"]
      : [
        "doctype",
        "fingerprint",
        "kind",
        "modified",
        "name",
        "row",
        "sourceInstance",
      ];
    if (
      keys.length !== allowed.length ||
      keys.some((key, index) => key !== allowed[index])
    ) {
      throw new TypeError(`${name} contains missing or unsupported fields.`);
    }
    const expectedDoctype = category === "catalogue-price"
      ? "Item Price"
      : "Supplier Quotation";
    const doctype = nonEmpty(root.doctype, `${name}.doctype`);
    if (doctype !== expectedDoctype) {
      throw new TypeError(
        `${name}.doctype must be ${expectedDoctype} for ${category}.`,
      );
    }
    const sourceInstance = parseSourceInstance(
      root.sourceInstance,
      `${name}.sourceInstance`,
    );
    if (
      !captures.some((capture) =>
        capture.sourceInstance.siteId === sourceInstance.siteId
      )
    ) {
      throw new TypeError(
        `${name}.sourceInstance must match a recorded sourceCapture site.`,
      );
    }
    return {
      kind: "erpnext-document",
      sourceInstance,
      doctype,
      name: nonEmpty(root.name, `${name}.name`),
      modified: frappeDatetime(root.modified, `${name}.modified`),
      ...(root.row === undefined
        ? {}
        : { row: nonEmpty(root.row, `${name}.row`) }),
      fingerprint: fingerprint(root.fingerprint, `${name}.fingerprint`),
    };
  }
  if (root.kind === "external-documentary") {
    if (
      category !== "historical-invoice" && category !== "documentary-estimate"
    ) {
      throw new TypeError(
        `${name} external-documentary cannot masquerade as ${category}.`,
      );
    }
    const source = exactRecord(root, ["kind", "uri", "fingerprint"], name);
    return {
      kind: "external-documentary",
      uri: nonEmpty(source.uri, `${name}.uri`),
      fingerprint: fingerprint(source.fingerprint, `${name}.fingerprint`),
    };
  }
  throw new TypeError(
    `${name}.kind must be erpnext-document or external-documentary.`,
  );
}

function parseCoverage(
  value: unknown,
  lineIds: ReadonlySet<string>,
): BuyResultCoverage {
  const root = exactRecord(value, [
    "status",
    "coveredLineIds",
    "excludedLineIds",
    "quantityBasis",
    "currency",
  ], "buy recorded result.coverage");
  const coveredLineIds = parseIdList(
    root.coveredLineIds,
    "buy recorded result.coverage.coveredLineIds",
    lineIds,
  );
  const excludedLineIds = parseIdList(
    root.excludedLineIds,
    "buy recorded result.coverage.excludedLineIds",
    lineIds,
  );
  const overlap = coveredLineIds.filter((id) => excludedLineIds.includes(id));
  if (overlap.length > 0) {
    throw new TypeError(
      "buy recorded result.coverage covered and excluded line ids must be disjoint.",
    );
  }
  const union = new Set([...coveredLineIds, ...excludedLineIds]);
  if (union.size !== lineIds.size) {
    throw new TypeError(
      "buy recorded result.coverage must classify every selected line.",
    );
  }
  const status = oneOf(
    root.status,
    BUY_COVERAGE_STATUSES,
    "buy recorded result.coverage.status",
  );
  if (status === "complete" && excludedLineIds.length > 0) {
    throw new TypeError(
      "buy recorded result.coverage.status complete cannot exclude lines.",
    );
  }
  if (status === "complete" && coveredLineIds.length !== lineIds.size) {
    throw new TypeError(
      "buy recorded result.coverage.status complete requires every line covered.",
    );
  }
  if (status === "unresolved" && coveredLineIds.length > 0) {
    throw new TypeError(
      "buy recorded result.coverage.status unresolved cannot cover lines.",
    );
  }
  return {
    status,
    coveredLineIds,
    excludedLineIds,
    quantityBasis: nonEmpty(
      root.quantityBasis,
      "buy recorded result.coverage.quantityBasis",
    ),
    currency: currencyCode(
      root.currency,
      "buy recorded result.coverage.currency",
    ),
  };
}

function parseIdList(
  value: unknown,
  name: string,
  lineIds: ReadonlySet<string>,
): readonly string[] {
  const items = boundedArray(value, BUY_RESULT_MAX_LINES, name).map((
    item,
    index,
  ) => nonEmpty(item, `${name}[${index}]`));
  const seen = new Set<string>();
  for (const id of items) {
    if (seen.has(id)) {
      throw new TypeError(`${name} must not contain duplicates.`);
    }
    if (!lineIds.has(id)) {
      throw new TypeError(`${name} references unknown lineId ${id}.`);
    }
    seen.add(id);
  }
  return items;
}

function parseTotal(
  value: unknown,
  name: string,
  coverage: BuyResultCoverage,
  pricing: BuyPricingContext,
): BuyResultTotal {
  const root = exactRecord(value, ["kind", "currency", "amount"], name);
  const kind = oneOf(root.kind, BUY_TOTAL_KINDS, `${name}.kind`);
  const currency = currencyCode(root.currency, `${name}.currency`);
  if (currency !== coverage.currency || currency !== pricing.currency) {
    throw new TypeError(
      `${name}.currency must match coverage and pricingContext; mixed currencies require a sourced exchange.`,
    );
  }
  if (kind === "complete-total" && coverage.status !== "complete") {
    throw new TypeError(
      `${name} complete-total is only admitted when coverage.status is complete.`,
    );
  }
  return {
    kind,
    currency,
    amount: decimalString(root.amount, `${name}.amount`),
  };
}

function assertTotals(
  totals: readonly BuyResultTotal[],
  coverage: BuyResultCoverage,
): void {
  const kinds = totals.map((total) => total.kind);
  if (new Set(kinds).size !== kinds.length) {
    throw new TypeError("buy recorded result.totals kinds must be unique.");
  }
  if (!kinds.includes("covered-subtotal")) {
    throw new TypeError(
      "buy recorded result.totals must include covered-subtotal.",
    );
  }
  if (coverage.status === "complete" && !kinds.includes("complete-total")) {
    throw new TypeError(
      "buy recorded result.totals must include complete-total when coverage is complete.",
    );
  }
}

function assertCoverageIncompleteness(
  coverage: BuyResultCoverage,
  gaps: readonly BuyResultGap[],
): void {
  if (coverage.status === "complete" && gaps.length > 0) {
    throw new TypeError(
      "buy recorded result.coverage.status complete cannot include unresolved gaps.",
    );
  }
  if (coverage.status !== "partial") return;
  const excludedIncompleteness = coverage.excludedLineIds.length > 0 &&
    coverage.coveredLineIds.length > 0;
  const globalGapIncompleteness = coverage.excludedLineIds.length === 0 &&
    coverage.coveredLineIds.length > 0 &&
    gaps.some((gap) => gap.lineId === undefined);
  if (!excludedIncompleteness && !globalGapIncompleteness) {
    throw new TypeError(
      "buy recorded result.coverage.status partial requires excluded lines or an explicit global gap.",
    );
  }
}

function parseGap(
  value: unknown,
  name: string,
  lineIds: ReadonlySet<string>,
): BuyResultGap {
  const root = record(value, name);
  const keys = Object.keys(root).toSorted();
  const allowed = root.lineId === undefined
    ? ["code", "reason"]
    : ["code", "lineId", "reason"];
  if (
    keys.length !== allowed.length ||
    keys.some((key, index) => key !== allowed[index])
  ) {
    throw new TypeError(`${name} contains missing or unsupported fields.`);
  }
  const lineId = root.lineId === undefined
    ? undefined
    : nonEmpty(root.lineId, `${name}.lineId`);
  if (lineId !== undefined && !lineIds.has(lineId)) {
    throw new TypeError(`${name}.lineId must reference a selected line.`);
  }
  return {
    code: nonEmpty(root.code, `${name}.code`),
    reason: nonEmpty(root.reason, `${name}.reason`),
    ...(lineId === undefined ? {} : { lineId }),
  };
}

function parseBasis(value: unknown): BuyResultBasis {
  const root = record(value, "buy recorded result.basis");
  const keys = Object.keys(root).toSorted();
  const allowed = root.old === undefined ? ["current"] : ["current", "old"];
  if (
    keys.length !== allowed.length ||
    keys.some((key, index) => key !== allowed[index])
  ) {
    throw new TypeError(
      "buy recorded result.basis contains missing or unsupported fields.",
    );
  }
  return {
    current: parseBasisSlice(root.current, "buy recorded result.basis.current"),
    ...(root.old === undefined ? {} : {
      old: parseBasisSlice(root.old, "buy recorded result.basis.old"),
    }),
  };
}

function parseBasisSlice(value: unknown, name: string): BuyResultBasisSlice {
  const root = exactRecord(
    value,
    ["configurationRevision", "capturedAt"],
    name,
  );
  return {
    configurationRevision: nonNegativeInteger(
      root.configurationRevision,
      `${name}.configurationRevision`,
    ),
    capturedAt: canonicalTimestamp(root.capturedAt, `${name}.capturedAt`),
  };
}

function assertSingleSite(captures: readonly BuyResultSourceCapture[]): void {
  const sites = new Set(
    captures.map((capture) => capture.sourceInstance.siteId),
  );
  if (sites.size !== 1) {
    throw new TypeError(
      "buy recorded result.sourceCaptures must share one sourceInstance siteId.",
    );
  }
}
