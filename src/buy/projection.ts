/**
 * Closed commercial projection of ERPNext documents admitted by Buy capture.
 *
 * Only allowlisted fields are copied. Unsupported doctypes cannot masquerade
 * as a price. Sensitive credentials and PII (email, phone, API keys) are
 * never copied. Absence is omitted, never filled with zero.
 */

import type { FrappeDoc } from "../api/types.ts";
import {
  BUY_CAPTURE_DOCTYPE,
  BUY_CAPTURE_MAX_CHILD_ROWS,
  BUY_CAPTURE_MAX_NAME_LENGTH,
  BUY_DOCTYPE_SOURCE_CATEGORY,
  type BuyCaptureDoctype,
  type BuyDocumentSourceCategory,
} from "./identities.ts";
import { BuyCaptureError } from "./errors.ts";
import {
  calendarDate,
  canonicalJson,
  frappeDatetime,
  sha256FingerprintOfUtf8,
} from "./json.ts";

const DECIMAL = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
const CURRENCY = /^[A-Z]{3}$/;

const SENSITIVE_FIELDS = new Set([
  "api_key",
  "api_secret",
  "password",
  "email_id",
  "email",
  "mobile_no",
  "phone",
  "cell_number",
]);

export interface BuyCapturedChildRow {
  readonly name: string;
  readonly idx?: number;
  readonly fields: Readonly<Record<string, BuyProjectedValue>>;
}

export interface BuyCapturedChildTable {
  readonly table: string;
  readonly rows: readonly BuyCapturedChildRow[];
}

export type BuyProjectedValue = string | number | boolean;

export interface BuyCapturedDocument {
  readonly doctype: BuyCaptureDoctype;
  readonly name: string;
  readonly modified: string;
  readonly docstatus?: number;
  readonly status?: string;
  readonly sourceCategory: BuyDocumentSourceCategory;
  readonly fields: Readonly<Record<string, BuyProjectedValue>>;
  readonly children?: readonly BuyCapturedChildTable[];
  readonly fingerprint: string;
}

type FieldKind =
  | "string"
  | "decimal"
  | "boolean"
  | "currency"
  | "date"
  | "integer";

export interface FieldSpec {
  readonly key: string;
  readonly kind: FieldKind;
  readonly required?: boolean;
}

const ITEM_FIELDS: readonly FieldSpec[] = [
  { key: "item_code", kind: "string", required: true },
  { key: "item_name", kind: "string" },
  { key: "item_group", kind: "string" },
  { key: "stock_uom", kind: "string" },
  { key: "is_purchase_item", kind: "boolean" },
  { key: "is_stock_item", kind: "boolean" },
  { key: "disabled", kind: "boolean" },
];

const BOM_FIELDS: readonly FieldSpec[] = [
  { key: "item", kind: "string", required: true },
  { key: "item_name", kind: "string" },
  { key: "quantity", kind: "decimal", required: true },
  { key: "uom", kind: "string", required: true },
  { key: "is_active", kind: "boolean" },
  { key: "is_default", kind: "boolean" },
  { key: "company", kind: "string" },
  { key: "currency", kind: "currency" },
  { key: "with_operations", kind: "boolean" },
];

const BOM_ITEM_FIELDS: readonly FieldSpec[] = [
  { key: "item_code", kind: "string", required: true },
  { key: "item_name", kind: "string" },
  { key: "qty", kind: "decimal", required: true },
  { key: "uom", kind: "string", required: true },
  { key: "rate", kind: "decimal" },
  { key: "amount", kind: "decimal" },
  { key: "sourced_by_supplier", kind: "boolean" },
];

const BOM_OPERATION_FIELDS: readonly FieldSpec[] = [
  { key: "operation", kind: "string", required: true },
  { key: "time_in_mins", kind: "decimal" },
  { key: "hour_rate", kind: "decimal" },
];

const ITEM_PRICE_FIELDS: readonly FieldSpec[] = [
  { key: "item_code", kind: "string", required: true },
  { key: "item_name", kind: "string" },
  { key: "price_list", kind: "string" },
  { key: "price_list_rate", kind: "decimal", required: true },
  { key: "currency", kind: "currency", required: true },
  { key: "uom", kind: "string" },
  { key: "min_qty", kind: "decimal" },
  { key: "valid_from", kind: "date" },
  { key: "valid_upto", kind: "date" },
  { key: "supplier", kind: "string" },
  { key: "buying", kind: "boolean" },
  { key: "selling", kind: "boolean" },
];

const SUPPLIER_QUOTATION_FIELDS: readonly FieldSpec[] = [
  { key: "supplier", kind: "string", required: true },
  { key: "supplier_name", kind: "string" },
  { key: "transaction_date", kind: "date", required: true },
  { key: "valid_till", kind: "date" },
  { key: "currency", kind: "currency", required: true },
  { key: "conversion_rate", kind: "decimal" },
  { key: "status", kind: "string" },
  { key: "company", kind: "string" },
  { key: "price_list", kind: "string" },
];

const SUPPLIER_QUOTATION_ITEM_FIELDS: readonly FieldSpec[] = [
  { key: "item_code", kind: "string", required: true },
  { key: "item_name", kind: "string" },
  { key: "qty", kind: "decimal", required: true },
  { key: "uom", kind: "string", required: true },
  { key: "rate", kind: "decimal" },
  { key: "amount", kind: "decimal" },
  { key: "price_list_rate", kind: "decimal" },
  { key: "discount_percentage", kind: "decimal" },
  { key: "supplier_part_no", kind: "string" },
];

const SUPPLIER_FIELDS: readonly FieldSpec[] = [
  { key: "supplier_name", kind: "string", required: true },
  { key: "supplier_group", kind: "string" },
  { key: "supplier_type", kind: "string" },
  { key: "country", kind: "string" },
  { key: "default_currency", kind: "currency" },
  { key: "disabled", kind: "boolean" },
];

const PRICE_LIST_FIELDS: readonly FieldSpec[] = [
  { key: "currency", kind: "currency", required: true },
  { key: "enabled", kind: "boolean" },
  { key: "buying", kind: "boolean" },
  { key: "selling", kind: "boolean" },
  { key: "price_not_uom_dependent", kind: "boolean" },
];

const UOM_FIELDS: readonly FieldSpec[] = [
  { key: "uom_name", kind: "string" },
  { key: "must_be_whole_number", kind: "boolean" },
];

const CURRENCY_EXCHANGE_FIELDS: readonly FieldSpec[] = [
  { key: "from_currency", kind: "currency", required: true },
  { key: "to_currency", kind: "currency", required: true },
  { key: "exchange_rate", kind: "decimal", required: true },
  { key: "date", kind: "date", required: true },
];

export const BUY_DOCTYPE_CHILD_TABLES: Partial<
  Record<
    BuyCaptureDoctype,
    readonly { table: string; fields: readonly FieldSpec[] }[]
  >
> = {
  BOM: [
    { table: "items", fields: BOM_ITEM_FIELDS },
    { table: "operations", fields: BOM_OPERATION_FIELDS },
  ],
  "Supplier Quotation": [
    { table: "items", fields: SUPPLIER_QUOTATION_ITEM_FIELDS },
  ],
};

export const BUY_DOCTYPE_FIELD_SPECS: Record<
  BuyCaptureDoctype,
  readonly FieldSpec[]
> = {
  Item: ITEM_FIELDS,
  BOM: BOM_FIELDS,
  "Item Price": ITEM_PRICE_FIELDS,
  "Supplier Quotation": SUPPLIER_QUOTATION_FIELDS,
  Supplier: SUPPLIER_FIELDS,
  "Price List": PRICE_LIST_FIELDS,
  UOM: UOM_FIELDS,
  "Currency Exchange": CURRENCY_EXCHANGE_FIELDS,
};

export function isBuyCaptureDoctype(value: string): value is BuyCaptureDoctype {
  return (BUY_CAPTURE_DOCTYPE as readonly string[]).includes(value);
}

export async function projectBuyDocument(
  doctype: BuyCaptureDoctype,
  raw: FrappeDoc,
): Promise<BuyCapturedDocument> {
  const name = requiredName(raw.name, `${doctype}.name`);
  const modified = requiredModified(raw.modified, `${doctype}.modified`);
  const fields = projectFields(
    raw,
    BUY_DOCTYPE_FIELD_SPECS[doctype],
    `${doctype}`,
  );
  const children = projectChildren(doctype, raw);
  const docstatus = optionalDocstatus(raw.docstatus, `${doctype}.docstatus`);
  const status = optionalStatus(raw.status, `${doctype}.status`);
  const identity: Omit<BuyCapturedDocument, "fingerprint"> = {
    doctype,
    name,
    modified,
    ...(docstatus !== undefined ? { docstatus } : {}),
    ...(status !== undefined ? { status } : {}),
    sourceCategory: BUY_DOCTYPE_SOURCE_CATEGORY[doctype],
    fields,
    ...(children !== undefined ? { children } : {}),
  };
  const fingerprint = await sha256FingerprintOfUtf8(
    canonicalJson(identity, `${doctype}:${name} projection`),
  );
  return { ...identity, fingerprint };
}

function projectChildren(
  doctype: BuyCaptureDoctype,
  raw: FrappeDoc,
): readonly BuyCapturedChildTable[] | undefined {
  const specs = BUY_DOCTYPE_CHILD_TABLES[doctype];
  if (!specs) return undefined;
  const tables: BuyCapturedChildTable[] = [];
  for (const spec of specs) {
    const value = raw[spec.table];
    if (value === undefined || value === null) continue;
    if (!Array.isArray(value)) {
      throw new BuyCaptureError(
        "BUY_CAPTURE_INVALID_PROJECTION",
        `${doctype}.${spec.table} must be a child table array.`,
        {
          recovery:
            "Capture only closed child tables with exact row identities.",
          context: { doctype, table: spec.table },
        },
      );
    }
    if (value.length > BUY_CAPTURE_MAX_CHILD_ROWS) {
      throw new BuyCaptureError(
        "BUY_CAPTURE_BOUNDS_EXCEEDED",
        `${doctype}.${spec.table} exceeds the ${BUY_CAPTURE_MAX_CHILD_ROWS}-row bound.`,
        {
          recovery: "Narrow the capture to fewer child rows.",
          context: {
            doctype,
            table: spec.table,
            limit: BUY_CAPTURE_MAX_CHILD_ROWS,
            actual: value.length,
          },
        },
      );
    }
    if (value.length === 0) continue;
    const rows = value.map((row, index) =>
      projectChildRow(
        row,
        spec.fields,
        `${doctype}.${spec.table}[${index}]`,
      )
    );
    tables.push({ table: spec.table, rows });
  }
  return tables.length > 0 ? tables : undefined;
}

function projectChildRow(
  row: unknown,
  specs: readonly FieldSpec[],
  path: string,
): BuyCapturedChildRow {
  if (typeof row !== "object" || row === null || Array.isArray(row)) {
    throw new BuyCaptureError(
      "BUY_CAPTURE_INVALID_PROJECTION",
      `${path} must be a child row object.`,
      {
        recovery: "Child rows must keep their exact Frappe name identity.",
        context: { path },
      },
    );
  }
  const record = row as Record<string, unknown>;
  const name = requiredName(record.name, `${path}.name`);
  const idx = optionalIdx(record.idx, `${path}.idx`);
  return {
    name,
    ...(idx !== undefined ? { idx } : {}),
    fields: projectFields(record, specs, path),
  };
}

function projectFields(
  raw: Record<string, unknown>,
  specs: readonly FieldSpec[],
  path: string,
): Readonly<Record<string, BuyProjectedValue>> {
  for (const key of Object.keys(raw)) {
    if (SENSITIVE_FIELDS.has(key)) {
      // Presence on the ERP document is ignored; it is never copied.
      continue;
    }
  }
  const fields: Record<string, BuyProjectedValue> = {};
  for (const spec of specs) {
    const value = projectField(raw[spec.key], spec, `${path}.${spec.key}`);
    if (value !== undefined) fields[spec.key] = value;
  }
  return fields;
}

function projectField(
  value: unknown,
  spec: FieldSpec,
  path: string,
): BuyProjectedValue | undefined {
  if (value === undefined || value === null || value === "") {
    if (spec.required) {
      throw new BuyCaptureError(
        "BUY_CAPTURE_INVALID_PROJECTION",
        `${path} is required on the closed commercial projection.`,
        {
          recovery:
            "The ERP document is missing a field later consumed as cost evidence.",
          context: { path, field: spec.key },
        },
      );
    }
    return undefined;
  }
  switch (spec.kind) {
    case "string":
      return requiredString(value, path);
    case "decimal":
      return requiredDecimal(value, path);
    case "boolean":
      return requiredBoolean(value, path);
    case "currency":
      return requiredCurrency(value, path);
    case "date":
      return requiredDate(value, path);
    case "integer":
      return requiredInteger(value, path);
  }
}

function requiredName(value: unknown, path: string): string {
  const name = requiredString(value, path);
  if (name.length > BUY_CAPTURE_MAX_NAME_LENGTH) {
    throw new BuyCaptureError(
      "BUY_CAPTURE_BOUNDS_EXCEEDED",
      `${path} exceeds the ${BUY_CAPTURE_MAX_NAME_LENGTH}-character bound.`,
      {
        recovery: "Use the exact ERP document name; do not pass a description.",
        context: {
          path,
          limit: BUY_CAPTURE_MAX_NAME_LENGTH,
          actual: name.length,
        },
      },
    );
  }
  return name;
}

function requiredModified(value: unknown, path: string): string {
  try {
    return frappeDatetime(value, path);
  } catch {
    throw new BuyCaptureError(
      "BUY_CAPTURE_INVALID_PROJECTION",
      `${path} is not a Frappe datetime.`,
      {
        recovery: "Capture the document's exact modified timestamp.",
        context: { path },
      },
    );
  }
}

function requiredString(value: unknown, path: string): string {
  if (
    typeof value !== "string" || value.trim() === "" || value.trim() !== value
  ) {
    throw new BuyCaptureError(
      "BUY_CAPTURE_INVALID_PROJECTION",
      `${path} must be a non-empty unpadded string.`,
      {
        recovery: "Use the exact ERP string; do not invent a label.",
        context: { path },
      },
    );
  }
  return value;
}

function requiredDecimal(value: unknown, path: string): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new BuyCaptureError(
        "BUY_CAPTURE_INVALID_PROJECTION",
        `${path} must be a finite decimal.`,
        {
          recovery:
            "Refuse non-finite commercial amounts rather than coerce them.",
          context: { path },
        },
      );
    }
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    if (!DECIMAL.test(value)) {
      throw new BuyCaptureError(
        "BUY_CAPTURE_INVALID_PROJECTION",
        `${path} must be a canonical decimal string.`,
        {
          recovery: "Keep the ERP decimal; do not fill absence with zero.",
          context: { path },
        },
      );
    }
    return value;
  }
  throw new BuyCaptureError(
    "BUY_CAPTURE_INVALID_PROJECTION",
    `${path} must be a decimal.`,
    {
      recovery: "Keep the ERP decimal; do not fill absence with zero.",
      context: { path },
    },
  );
}

function requiredBoolean(value: unknown, path: string): boolean {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  throw new BuyCaptureError(
    "BUY_CAPTURE_INVALID_PROJECTION",
    `${path} must be a boolean or Frappe 0/1.`,
    {
      recovery: "Do not coerce missing flags to false.",
      context: { path },
    },
  );
}

function requiredCurrency(value: unknown, path: string): string {
  const code = requiredString(value, path);
  if (!CURRENCY.test(code)) {
    throw new BuyCaptureError(
      "BUY_CAPTURE_INVALID_PROJECTION",
      `${path} must be a 3-letter currency code.`,
      {
        recovery: "Capture the document currency; do not guess a conversion.",
        context: { path },
      },
    );
  }
  return code;
}

function requiredDate(value: unknown, path: string): string {
  try {
    return calendarDate(value, path);
  } catch {
    throw new BuyCaptureError(
      "BUY_CAPTURE_INVALID_PROJECTION",
      `${path} must be a real YYYY-MM-DD date.`,
      {
        recovery: "Keep the ERP calendar date; do not localize it.",
        context: { path },
      },
    );
  }
}

function requiredInteger(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new BuyCaptureError(
      "BUY_CAPTURE_INVALID_PROJECTION",
      `${path} must be a safe integer.`,
      { recovery: "Keep the ERP integer identity.", context: { path } },
    );
  }
  return value as number;
}

function optionalDocstatus(value: unknown, path: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (value !== 0 && value !== 1 && value !== 2) {
    throw new BuyCaptureError(
      "BUY_CAPTURE_INVALID_PROJECTION",
      `${path} must be 0, 1, or 2.`,
      { recovery: "Keep the ERP docstatus.", context: { path } },
    );
  }
  return value;
}

function optionalStatus(value: unknown, path: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requiredString(value, path);
}

function optionalIdx(value: unknown, path: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requiredInteger(value, path);
}

/**
 * Validate a constructed capture projection against the same DocType
 * allowlists used to pick fields from a raw Frappe document.
 */
export function parseClosedWireFields(
  value: unknown,
  specs: readonly FieldSpec[],
  path: string,
): Readonly<Record<string, BuyProjectedValue>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object.`);
  }
  const root = value as Record<string, unknown>;
  const allowed = new Map(specs.map((spec) => [spec.key, spec]));
  for (const key of Object.keys(root)) {
    if (!allowed.has(key)) {
      throw new TypeError(`${path}.${key} is not a closed commercial field.`);
    }
  }
  const fields: Record<string, BuyProjectedValue> = {};
  for (const spec of specs) {
    const raw = root[spec.key];
    if (raw === undefined || raw === null || raw === "") {
      if (spec.required) {
        throw new TypeError(`${path}.${spec.key} is required.`);
      }
      continue;
    }
    fields[spec.key] = parseWireValue(raw, spec, `${path}.${spec.key}`);
  }
  return fields;
}

export function parseClosedWireChildren(
  doctype: BuyCaptureDoctype,
  value: unknown,
  path: string,
): readonly BuyCapturedChildTable[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new TypeError(`${path} must be an array.`);
  }
  const specs = BUY_DOCTYPE_CHILD_TABLES[doctype] ?? [];
  if (specs.length === 0) {
    throw new TypeError(`${path} is not admitted for ${doctype}.`);
  }
  if (value.length === 0) {
    throw new TypeError(`${path} must be omitted when empty.`);
  }
  const known = new Map(specs.map((spec) => [spec.table, spec]));
  const seenTables = new Set<string>();
  return value.map((item, index) => {
    const tablePath = `${path}[${index}]`;
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new TypeError(`${tablePath} must be an object.`);
    }
    const table = item as Record<string, unknown>;
    const keys = Object.keys(table).toSorted();
    if (
      keys.length !== 2 || keys[0] !== "rows" || keys[1] !== "table"
    ) {
      throw new TypeError(
        `${tablePath} contains missing or unsupported fields.`,
      );
    }
    if (typeof table.table !== "string" || !known.has(table.table)) {
      throw new TypeError(
        `${tablePath}.table is not a closed child table for ${doctype}.`,
      );
    }
    if (seenTables.has(table.table)) {
      throw new TypeError(`${tablePath}.table duplicates ${table.table}.`);
    }
    seenTables.add(table.table);
    const spec = known.get(table.table)!;
    if (!Array.isArray(table.rows)) {
      throw new TypeError(`${tablePath}.rows must be an array.`);
    }
    if (table.rows.length > BUY_CAPTURE_MAX_CHILD_ROWS) {
      throw new TypeError(
        `${tablePath}.rows exceeds the ${BUY_CAPTURE_MAX_CHILD_ROWS}-row bound.`,
      );
    }
    const seenRows = new Set<string>();
    const rows = table.rows.map((row, rowIndex) => {
      const rowPath = `${tablePath}.rows[${rowIndex}]`;
      const parsed = parseClosedWireRow(row, spec.fields, rowPath);
      if (seenRows.has(parsed.name)) {
        throw new TypeError(`${rowPath} duplicates child row ${parsed.name}.`);
      }
      seenRows.add(parsed.name);
      return parsed;
    });
    return { table: spec.table, rows };
  });
}

function parseClosedWireRow(
  value: unknown,
  specs: readonly FieldSpec[],
  path: string,
): BuyCapturedChildRow {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object.`);
  }
  const root = value as Record<string, unknown>;
  const keys = Object.keys(root).toSorted();
  const allowed = root.idx === undefined
    ? ["fields", "name"]
    : ["fields", "idx", "name"];
  if (
    keys.length !== allowed.length ||
    keys.some((key, index) => key !== allowed[index])
  ) {
    throw new TypeError(`${path} contains missing or unsupported fields.`);
  }
  const name = requiredWireName(root.name, `${path}.name`);
  return {
    name,
    ...(root.idx === undefined ? {} : {
      idx: requiredWireIdx(root.idx, `${path}.idx`),
    }),
    fields: parseClosedWireFields(root.fields, specs, `${path}.fields`),
  };
}

function parseWireValue(
  value: unknown,
  spec: FieldSpec,
  path: string,
): BuyProjectedValue {
  switch (spec.kind) {
    case "string":
      if (
        typeof value !== "string" || value.trim() === "" ||
        value.trim() !== value
      ) {
        throw new TypeError(`${path} must be a non-empty unpadded string.`);
      }
      return value;
    case "decimal":
      if (typeof value !== "string" || !DECIMAL.test(value)) {
        throw new TypeError(`${path} must be a canonical decimal string.`);
      }
      return value;
    case "boolean":
      if (value !== true && value !== false) {
        throw new TypeError(`${path} must be a boolean.`);
      }
      return value;
    case "currency":
      if (typeof value !== "string" || !CURRENCY.test(value)) {
        throw new TypeError(`${path} must be a 3-letter currency code.`);
      }
      return value;
    case "date":
      return calendarDate(value, path);
    case "integer":
      if (!Number.isSafeInteger(value)) {
        throw new TypeError(`${path} must be a safe integer.`);
      }
      return value as number;
  }
}

function requiredWireName(value: unknown, path: string): string {
  if (
    typeof value !== "string" || value.trim() === "" || value.trim() !== value
  ) {
    throw new TypeError(`${path} must be a non-empty unpadded string.`);
  }
  if (value.length > BUY_CAPTURE_MAX_NAME_LENGTH) {
    throw new TypeError(
      `${path} exceeds the ${BUY_CAPTURE_MAX_NAME_LENGTH}-character bound.`,
    );
  }
  return value;
}

function requiredWireIdx(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new TypeError(`${path} must be a non-negative integer.`);
  }
  return value as number;
}
