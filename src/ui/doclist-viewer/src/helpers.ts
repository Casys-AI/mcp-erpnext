/** Doclist Viewer helpers */

import { formatNumber } from "~/shared/theme";

export const STATUS_FIELDS = new Set(["status", "docstatus", "workflow_state"]);
export const HIDDEN_FIELDS = new Set(["doctype", "owner", "modified_by", "creation", "modified", "idx", "_rowAction", "_sendMessageHints"]);
export const FILTERABLE_COLUMNS = new Set(["status", "workflow_state", "company", "territory", "customer_group", "item_group", "supplier_group", "priority", "type"]);

/** Max columns shown in the table — extra columns go to the detail panel */
export const MAX_VISIBLE_COLUMNS = 6;

/** Columns to prioritize (shown first). Order matters. */
const PRIORITY_COLUMNS = ["name", "status", "customer", "customer_name", "supplier", "supplier_name", "item_code", "item_name", "employee_name", "project", "subject", "grand_total", "outstanding_amount", "posting_date", "transaction_date", "delivery_date"];

/** Sort columns by priority: priority columns first (in order), then alphabetical, capped at MAX_VISIBLE_COLUMNS */
export function selectVisibleColumns(allKeys: string[]): string[] {
  const prioritized: string[] = [];
  const rest: string[] = [];

  // First pass: pick priority columns in order
  for (const col of PRIORITY_COLUMNS) {
    if (allKeys.includes(col)) prioritized.push(col);
  }

  // Second pass: remaining columns alphabetically
  for (const col of allKeys.sort()) {
    if (!prioritized.includes(col)) rest.push(col);
  }

  return [...prioritized, ...rest].slice(0, MAX_VISIBLE_COLUMNS);
}

export function isStatusField(key: string): boolean {
  return STATUS_FIELDS.has(key.toLowerCase());
}

export function formatCell(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "number") return formatNumber(value, value % 1 === 0 ? 0 : 2);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function exportCsv(columns: string[], rows: Record<string, unknown>[], doctype?: string) {
  const header = columns.join(",");
  const body = rows.map((row) =>
    columns.map((col) => {
      const v = formatCell(row[col]);
      return v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(",")
  ).join("\n");

  const csv = `${header}\n${body}`;
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${doctype ?? "export"}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Resolve a dot-path like "metadata.invoiceId" on an object */
export function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  let current: unknown = obj;
  for (const key of path.split(".")) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}
