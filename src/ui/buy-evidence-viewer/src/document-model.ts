/**
 * Map a sealed Buy recorded result onto the shared document surface model.
 *
 * Totals are copied from the sealed result. This module does not sum lines
 * and does not attach refresh, tools, or attachment capabilities.
 */

import type {
  ChildTableModel,
  DocumentFieldModel,
  DocumentModel,
} from "../../shared/document/types.ts";
import { t as defaultTranslate } from "../../shared/i18n.ts";
import type { BuyRecordedResult, BuyResultLine } from "../../../buy/result.ts";

export function buyResultToDocumentModel(
  result: BuyRecordedResult,
  t: typeof defaultTranslate = defaultTranslate,
): DocumentModel {
  const name = result.configuration.subjectId;
  const descriptions = result.lines
    .map((line) => line.description)
    .filter((value): value is string => typeof value === "string");
  const priceDates = [...new Set(result.lines.map((line) => line.priceDate))];
  const fields: DocumentFieldModel[] = [
    {
      key: "coverage",
      label: t("buy.field.coverage"),
      value: result.coverage.status,
      kind: "status",
    },
    {
      key: "quantityBasis",
      label: t("buy.field.quantity_basis"),
      value: result.coverage.quantityBasis,
      kind: "text",
    },
    {
      key: "currency",
      label: t("buy.field.currency"),
      value: result.coverage.currency,
      kind: "text",
    },
    {
      key: "projectId",
      label: t("buy.field.project"),
      value: result.configuration.projectId,
      kind: "text",
    },
    {
      key: "configurationRevision",
      label: t("buy.field.configuration_revision"),
      value: result.configuration.configurationRevision,
      kind: "number",
    },
    {
      key: "observedAt",
      label: t("buy.field.observed_at"),
      value: result.pricingContext.observedAt,
      kind: "datetime",
    },
    {
      key: "priceDate",
      label: t("buy.field.price_date"),
      value: priceDates.join(", "),
      kind: "date",
    },
    ...result.totals.map((total) => ({
      key: total.kind,
      label: total.kind === "covered-subtotal"
        ? t("buy.field.covered_subtotal")
        : t("buy.field.complete_total"),
      value: `${total.amount} ${total.currency}`,
      kind: "text" as const,
    })),
  ];
  return {
    envelope: {
      document: { doctype: "BuyRecordedResult", name },
      doctype: "BuyRecordedResult",
      name,
    },
    title: t("buy.title"),
    status: result.coverage.status,
    fields,
    longFields: descriptions.map((description, index) => ({
      key: `description-${index}`,
      label: t("buy.field.description"),
      value: description,
      kind: "text" as const,
    })),
    progressFields: [],
    collections: [],
    childTables: [
      linesTable(result, t),
      excludedLinesTable(result, t),
      gapsTable(result, t),
      capturesTable(result, t),
    ].filter((table) => table.rows.length > 0),
    systemFields: [],
  };
}

function excludedLinesTable(
  result: BuyRecordedResult,
  t: typeof defaultTranslate,
): ChildTableModel {
  return {
    key: "excluded-lines",
    label: t("buy.table.excluded_lines"),
    columns: [
      { key: "lineId", label: t("buy.col.line"), numeric: false },
      { key: "qty", label: t("buy.col.quantity"), numeric: false },
      { key: "uom", label: t("buy.col.unit"), numeric: false },
      { key: "reason", label: t("buy.col.reason"), numeric: false },
    ],
    rows: (result.excludedLines ?? []).map((line) => ({
      lineId: line.lineId,
      qty: line.qty,
      uom: line.uom,
      reason: line.reason,
    })),
  };
}

function linesTable(
  result: BuyRecordedResult,
  t: typeof defaultTranslate,
): ChildTableModel {
  const columns = [
    { key: "itemCode", label: t("buy.col.item"), numeric: false },
    { key: "sourceName", label: t("buy.col.source"), numeric: false },
    { key: "unitPrice", label: t("buy.col.unit_price"), numeric: false },
    { key: "currency", label: t("buy.col.currency"), numeric: false },
    { key: "sourceCategory", label: t("buy.col.category"), numeric: false },
    { key: "sourceKind", label: t("buy.col.kind"), numeric: false },
    { key: "sourceDoctype", label: t("buy.col.document_type"), numeric: false },
    { key: "sourceModified", label: t("buy.col.modified"), numeric: false },
    { key: "sourceSite", label: t("buy.col.site"), numeric: false },
    {
      key: "sourceFingerprint",
      label: t("buy.col.fingerprint"),
      numeric: false,
    },
    { key: "sourceRow", label: t("buy.col.row"), numeric: false },
    { key: "description", label: t("buy.col.description"), numeric: false },
    { key: "qty", label: t("buy.col.quantity"), numeric: false },
    { key: "uom", label: t("buy.col.unit"), numeric: false },
    { key: "lineAmount", label: t("buy.col.amount"), numeric: false },
    { key: "priceDate", label: t("buy.col.price_date"), numeric: false },
    { key: "validFrom", label: t("buy.col.valid_from"), numeric: false },
    { key: "validUpto", label: t("buy.col.valid_until"), numeric: false },
  ];
  return {
    key: "selected-lines",
    label: t("buy.table.selected_lines"),
    columns,
    rows: result.lines.map((line) => lineRow(line)),
  };
}

function lineRow(line: BuyResultLine): ChildTableModel["rows"][number] {
  const source = line.source;
  if (source.kind === "erpnext-document") {
    return {
      itemCode: line.itemCode ?? null,
      sourceName: source.name,
      unitPrice: line.unitPrice,
      currency: line.currency,
      sourceCategory: line.sourceCategory,
      sourceKind: source.kind,
      sourceDoctype: source.doctype,
      sourceModified: source.modified,
      sourceSite: source.sourceInstance.siteId,
      sourceFingerprint: source.fingerprint,
      sourceRow: source.row ?? null,
      description: line.description ?? null,
      qty: line.qty,
      uom: line.uom,
      lineAmount: line.lineAmount,
      priceDate: line.priceDate,
      validFrom: line.validFrom ?? null,
      validUpto: line.validUpto ?? null,
    };
  }
  return {
    itemCode: line.itemCode ?? null,
    sourceName: source.uri,
    unitPrice: line.unitPrice,
    currency: line.currency,
    sourceCategory: line.sourceCategory,
    sourceKind: source.kind,
    sourceDoctype: null,
    sourceModified: null,
    sourceSite: null,
    sourceFingerprint: source.fingerprint,
    sourceRow: null,
    description: line.description ?? null,
    qty: line.qty,
    uom: line.uom,
    lineAmount: line.lineAmount,
    priceDate: line.priceDate,
    validFrom: line.validFrom ?? null,
    validUpto: line.validUpto ?? null,
  };
}

function gapsTable(
  result: BuyRecordedResult,
  t: typeof defaultTranslate,
): ChildTableModel {
  return {
    key: "gaps",
    label: t("buy.table.gaps"),
    columns: [
      { key: "code", label: t("buy.col.code"), numeric: false },
      { key: "reason", label: t("buy.col.reason"), numeric: false },
      { key: "lineId", label: t("buy.col.line"), numeric: false },
    ],
    rows: result.gaps.map((gap) => ({
      code: gap.code,
      reason: gap.reason,
      lineId: gap.lineId ?? null,
    })),
  };
}

function capturesTable(
  result: BuyRecordedResult,
  t: typeof defaultTranslate,
): ChildTableModel {
  return {
    key: "source-captures",
    label: t("buy.table.source_captures"),
    columns: [
      { key: "siteId", label: t("buy.col.site"), numeric: false },
      { key: "fingerprint", label: t("buy.col.fingerprint"), numeric: false },
      { key: "capturedAt", label: t("buy.col.captured_at"), numeric: false },
    ],
    rows: result.sourceCaptures.map((capture) => ({
      siteId: capture.sourceInstance.siteId,
      fingerprint: capture.fingerprint,
      capturedAt: capture.capturedAt,
    })),
  };
}
