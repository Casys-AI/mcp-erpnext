import type {
  ChildTableColumn,
  ChildTableModel,
  ChildTableRow,
  ChildTableTotal,
  DocumentDisplayValue,
  DocumentFieldKind,
  DocumentFieldModel,
  DocumentTableLayout,
} from "./types.ts";

const CHILD_SYSTEM_FIELDS = new Set([
  "idx",
  "parent",
  "parenttype",
  "parentfield",
  "doctype",
  "owner",
  "creation",
  "modified",
  "modified_by",
  "docstatus",
]);

const COLUMN_PRIORITY = [
  "item_code",
  "operation",
  "activity_type",
  "title",
  "subject",
  "description",
  "qty",
  "quantity",
  "amount",
  "operating_cost",
  "rate",
  "price",
  "uom",
  "item_name",
  "warehouse",
  "account",
  "employee",
  "name",
  "id",
  "base_amount",
] as const;

const ADDITIVE_FIELD_PRIORITY = [
  "amount",
  "base_amount",
  "net_amount",
  "base_net_amount",
  "operating_cost",
  "base_operating_cost",
  "stock_value_difference",
] as const;

const NUMERIC_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

export function documentDisplayValue(value: unknown): DocumentDisplayValue {
  if (
    value === null || typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : String(value);
  }
  return safeJson(value);
}

export function humanizeDocumentKey(key: string): string {
  const words = key
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return words.length === 0
    ? key
    : words.charAt(0).toUpperCase() + words.slice(1);
}

function numericValue(value: DocumentDisplayValue): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return NUMERIC_PATTERN.test(trimmed) ? Number(trimmed) : null;
}

function fieldKind(
  key: string,
  value: DocumentDisplayValue,
): DocumentFieldKind {
  if (value === null || value === "") return "empty";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (/(^|_)(workflow_)?status($|_)/i.test(key)) return "status";
  if (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)
  ) {
    return "datetime";
  }
  if (
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return "date";
  }
  if (
    typeof value === "string" &&
    (value.startsWith("{") || value.startsWith("["))
  ) {
    return "json";
  }
  return "text";
}

function isNumericColumn(
  rows: readonly ChildTableRow[],
  key: string,
): boolean {
  const present = rows
    .map((row) => row[key])
    .filter((value) => value !== undefined && value !== null && value !== "");
  return present.length > 0 &&
    present.every((value) => numericValue(value) !== null);
}

function tableTotal(
  rows: readonly ChildTableRow[],
  columns: readonly ChildTableColumn[],
): ChildTableTotal | undefined {
  for (const key of ADDITIVE_FIELD_PRIORITY) {
    if (!columns.some((column) => column.key === key)) continue;
    const values = rows
      .map((row) => row[key])
      .filter((value) => value !== undefined && value !== null && value !== "");
    if (values.length === 0) continue;
    const numbers = values.map(numericValue);
    if (numbers.some((value) => value === null)) continue;
    return {
      key,
      label: humanizeDocumentKey(key),
      value: numbers.reduce<number>(
        (sum, value) => sum + (value ?? 0),
        0,
      ),
    };
  }
  return undefined;
}

function isFrappeChildRow(rows: readonly Record<string, unknown>[]): boolean {
  return rows.some((row) =>
    "parent" in row || "parenttype" in row || "parentfield" in row ||
    "idx" in row
  );
}

function businessKeys(
  rows: readonly Record<string, unknown>[],
): readonly string[] {
  const seen = new Map<string, number>();
  const hideChildName = isFrappeChildRow(rows);
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (
        key.startsWith("_") || CHILD_SYSTEM_FIELDS.has(key) ||
        (hideChildName && key === "name")
      ) {
        continue;
      }
      if (!seen.has(key)) seen.set(key, seen.size);
    }
  }

  const priority = new Map<string, number>(
    COLUMN_PRIORITY.map((key, index) => [key, index]),
  );
  return [...seen.keys()].sort((left, right) => {
    const leftPriority = priority.get(left) ?? Number.MAX_SAFE_INTEGER;
    const rightPriority = priority.get(right) ?? Number.MAX_SAFE_INTEGER;
    return leftPriority - rightPriority ||
      (seen.get(left) ?? 0) - (seen.get(right) ?? 0);
  });
}

export function childTableModelOf(
  key: string,
  inputRows: readonly Record<string, unknown>[],
): ChildTableModel {
  const keys = businessKeys(inputRows);
  const rows: ChildTableRow[] = inputRows.map((inputRow) =>
    Object.fromEntries(
      keys
        .filter((field) =>
          Object.prototype.hasOwnProperty.call(inputRow, field)
        )
        .map((field) => [field, documentDisplayValue(inputRow[field])]),
    )
  );
  const columns: ChildTableColumn[] = keys.map((field) => ({
    key: field,
    label: humanizeDocumentKey(field),
    numeric: isNumericColumn(rows, field),
  }));
  const total = tableTotal(rows, columns);

  return {
    key,
    label: humanizeDocumentKey(key),
    rows,
    columns,
    ...(total ? { total } : {}),
  };
}

export function childTableColumnsForLayout(
  table: ChildTableModel,
  layout: DocumentTableLayout,
): readonly ChildTableColumn[] {
  return table.columns.slice(0, layout === "wide" ? 4 : 3);
}

export function childTableHiddenEntries(
  table: ChildTableModel,
  rowIndex: number,
  layout: DocumentTableLayout,
): readonly DocumentFieldModel[] {
  const row = table.rows[rowIndex];
  if (!row) return [];
  const visible = new Set(
    childTableColumnsForLayout(table, layout).map((column) => column.key),
  );
  return table.columns
    .filter((column) => !visible.has(column.key))
    .map((column) => ({
      key: column.key,
      label: column.label,
      value: row[column.key] ?? null,
      kind: fieldKind(column.key, row[column.key] ?? null),
    }));
}

export function isChildTableValue(
  value: unknown,
): value is readonly Record<string, unknown>[] {
  return Array.isArray(value) && value.length > 0 && value.every(isRecord);
}
