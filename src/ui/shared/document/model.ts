import type { NavHint } from "../jumps.ts";
import type { UiRefreshRequestData } from "../refresh.ts";
import {
  childTableModelOf,
  documentDisplayValue,
  humanizeDocumentKey,
  isChildTableValue,
} from "./child-table-model.ts";
import type {
  DocumentCollectionModel,
  DocumentDisplayValue,
  DocumentEnvelope,
  DocumentFieldKind,
  DocumentFieldModel,
  DocumentModel,
} from "./types.ts";

const ENVELOPE_FIELDS = new Set([
  "_availableTools",
  "_sendMessageHints",
  "refreshRequest",
]);

const SYSTEM_FIELDS = new Set([
  "name",
  "doctype",
  "owner",
  "creation",
  "modified",
  "modified_by",
  "docstatus",
  "idx",
  "_user_tags",
  "_comments",
  "_assign",
  "_liked_by",
  "__islocal",
  "__unsaved",
]);

const TITLE_FIELDS = [
  "title",
  "subject",
  "item_name",
  "customer_name",
  "supplier_name",
  "project_name",
  "employee_name",
] as const;

const LONG_FIELD_PATTERN =
  /(^|_)(description|notes?|remarks?|terms|instructions?|content|message|details?)($|_)/i;
const NUMERIC_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function stringArray(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return [
    ...new Set(
      value.filter((item): item is string =>
        typeof item === "string" && item.length > 0
      ),
    ),
  ];
}

function refreshRequestOf(value: unknown): UiRefreshRequestData | undefined {
  if (!isRecord(value)) return undefined;
  const toolName = nonEmptyString(value.toolName);
  if (!toolName || !isRecord(value.arguments)) return undefined;
  return { toolName, arguments: { ...value.arguments } };
}

function sendMessageHintsOf(value: unknown): readonly NavHint[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((entry): NavHint[] => {
    if (!isRecord(entry)) return [];
    const label = nonEmptyString(entry.label);
    if (!label) return [];
    const kind = entry.kind === "list" || entry.kind === "record" ||
        entry.kind === "chart"
      ? entry.kind
      : undefined;
    return [{
      label,
      ...(nonEmptyString(entry.key) ? { key: nonEmptyString(entry.key)! } : {}),
      ...(nonEmptyString(entry.message)
        ? { message: nonEmptyString(entry.message)! }
        : {}),
      ...(nonEmptyString(entry.tool)
        ? { tool: nonEmptyString(entry.tool)! }
        : {}),
      ...(isRecord(entry.args) ? { args: { ...entry.args } } : {}),
      ...(kind ? { kind } : {}),
    }];
  });
}

function normalizedEnvelope(value: unknown): DocumentEnvelope | null {
  if (!isRecord(value) || !isRecord(value.document)) return null;
  const doctype = nonEmptyString(value.document.doctype) ??
    nonEmptyString(value.doctype);
  const name = nonEmptyString(value.document.name) ??
    nonEmptyString(value.name);
  if (!doctype || !name) return null;
  return {
    ...(value as unknown as DocumentEnvelope),
    document: value.document,
    doctype,
    name,
  };
}

/**
 * Reads both the normal `{ data: document }` tool result and a legacy direct
 * record. UI-only envelope fields never leak into the rendered ERP document.
 */
export function documentEnvelopeOf(payload: unknown): DocumentEnvelope | null {
  if (!isRecord(payload)) return null;

  const nestedCandidate = isRecord(payload.data) ? payload.data : null;
  // `data` can itself be a business field on a direct Frappe document. Only
  // the explicit document identity makes it an envelope payload.
  const nestedDocument = nestedCandidate &&
      nonEmptyString(nestedCandidate.doctype) &&
      nonEmptyString(nestedCandidate.name)
    ? nestedCandidate
    : null;
  const source = nestedDocument ?? payload;
  const document = Object.fromEntries(
    Object.entries(source).filter(([key]) => !ENVELOPE_FIELDS.has(key)),
  );
  const doctype = nonEmptyString(document.doctype) ??
    nonEmptyString(payload.doctype);
  const name = nonEmptyString(document.name) ?? nonEmptyString(payload.name);
  if (!doctype || !name) return null;

  const availableTools = stringArray(payload._availableTools);
  const refreshRequest = refreshRequestOf(payload.refreshRequest);
  const sendMessageHints = sendMessageHintsOf(payload._sendMessageHints);
  return {
    document,
    doctype,
    name,
    ...(availableTools !== undefined ? { availableTools } : {}),
    ...(refreshRequest ? { refreshRequest } : {}),
    ...(sendMessageHints !== undefined ? { sendMessageHints } : {}),
  };
}

function numericValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return NUMERIC_PATTERN.test(trimmed) ? Number(trimmed) : null;
}

function isProgressField(key: string, value: unknown): boolean {
  return numericValue(value) !== null &&
    (key === "progress" || key.endsWith("_progress") ||
      key === "percent_complete" || key === "percentage_complete" ||
      key === "completion_percentage");
}

function fieldKind(key: string, value: unknown): DocumentFieldKind {
  if (isProgressField(key, value)) return "progress";
  if (value === null || value === undefined || value === "") return "empty";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (
    key === "status" || key === "workflow_state" || key.endsWith("_status")
  ) {
    return "status";
  }
  if (isRecord(value) || Array.isArray(value)) return "json";
  if (
    typeof value === "string" &&
    (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) ||
      key.endsWith("_datetime") || key.endsWith("_timestamp"))
  ) {
    return "datetime";
  }
  if (
    typeof value === "string" &&
    (/^\d{4}-\d{2}-\d{2}$/.test(value) || key.endsWith("_date"))
  ) {
    return "date";
  }
  return "text";
}

function safePrettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

export function documentFieldOf(
  key: string,
  value: unknown,
): DocumentFieldModel {
  const kind = fieldKind(key, value);
  let displayValue: DocumentDisplayValue = kind === "json"
    ? safePrettyJson(value)
    : documentDisplayValue(value);
  if (kind === "progress") displayValue = numericValue(value);
  return {
    key,
    label: humanizeDocumentKey(key),
    value: displayValue,
    kind,
  };
}

function isSystemField(key: string): boolean {
  return key.startsWith("_") || SYSTEM_FIELDS.has(key);
}

function isLongField(field: DocumentFieldModel): boolean {
  return field.kind === "json" ||
    (typeof field.value === "string" &&
      (field.value.includes("\n") || field.value.length >= 120 ||
        LONG_FIELD_PATTERN.test(field.key)));
}

function titleOf(envelope: DocumentEnvelope): string {
  for (const key of TITLE_FIELDS) {
    const value = envelope.document[key];
    if (
      (typeof value === "string" || typeof value === "number") &&
      String(value).trim().length > 0
    ) {
      return String(value).trim();
    }
  }
  return envelope.name;
}

function statusOf(document: Record<string, unknown>): string | undefined {
  for (const key of ["workflow_state", "status"] as const) {
    const value = document[key];
    if (
      (typeof value === "string" || typeof value === "number" ||
        typeof value === "boolean") && String(value).trim().length > 0
    ) {
      return String(value).trim();
    }
  }
  return undefined;
}

function collectionOf(
  key: string,
  values: readonly unknown[],
): DocumentCollectionModel {
  return {
    key,
    label: humanizeDocumentKey(key),
    values: values.map(documentDisplayValue),
  };
}

export function documentModelOf(envelope: DocumentEnvelope): DocumentModel;
export function documentModelOf(payload: unknown): DocumentModel | null;
export function documentModelOf(payload: unknown): DocumentModel | null {
  const envelope = normalizedEnvelope(payload) ?? documentEnvelopeOf(payload);
  if (!envelope) return null;

  const fields: DocumentFieldModel[] = [];
  const longFields: DocumentFieldModel[] = [];
  const progressFields: DocumentFieldModel[] = [];
  const collections: DocumentCollectionModel[] = [];
  const childTables = [];
  const systemFields: DocumentFieldModel[] = [];

  for (const [key, value] of Object.entries(envelope.document)) {
    if (isSystemField(key)) {
      systemFields.push(documentFieldOf(key, value));
      continue;
    }
    if (key === "status" || key === "workflow_state") continue;
    if (isChildTableValue(value)) {
      childTables.push(childTableModelOf(key, value));
      continue;
    }
    if (Array.isArray(value)) {
      collections.push(collectionOf(key, value));
      continue;
    }

    const field = documentFieldOf(key, value);
    if (field.kind === "progress") progressFields.push(field);
    else if (isLongField(field)) longFields.push(field);
    else fields.push(field);
  }

  const docstatus = numericValue(envelope.document.docstatus);
  const status = statusOf(envelope.document);
  return {
    envelope,
    title: titleOf(envelope),
    ...(status ? { status } : {}),
    ...(docstatus !== null ? { docstatus } : {}),
    fields,
    longFields,
    progressFields,
    collections,
    childTables,
    systemFields,
  };
}
