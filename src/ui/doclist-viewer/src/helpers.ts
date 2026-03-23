/** Doclist Viewer helpers */

import { formatNumber } from "~/shared/theme";

export const STATUS_FIELDS = new Set(["status", "docstatus", "workflow_state"]);
export const HIDDEN_FIELDS = new Set(["doctype", "owner", "modified_by", "creation", "modified", "idx", "_rowAction", "_sendMessageHints"]);
export const FILTERABLE_COLUMNS = new Set(["status", "workflow_state", "company", "territory", "customer_group", "item_group", "supplier_group", "priority", "type"]);

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
