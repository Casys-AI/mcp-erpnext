import type { ContextSelectionItem } from "../active-context.ts";
import type {
  ChildTableModel,
  ChildTableRow,
  DocumentEnvelope,
  DocumentModel,
} from "./types.ts";

function text(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

/** Référence compacte vers une fiche : aucun JSON métier n'entre au contexte. */
export function documentContextItem(
  model: DocumentModel,
  view: string,
  reconcileKey?: string,
): ContextSelectionItem {
  const detail = [
    model.envelope.doctype,
    model.title !== model.envelope.name ? model.title : null,
    model.status,
  ].filter((value): value is string => Boolean(value));
  return {
    id: `record:${model.envelope.doctype}:${model.envelope.name}`,
    view,
    ...(reconcileKey ? { reconcileKey } : {}),
    label: model.envelope.name,
    ...(detail.length > 0 ? { value: detail.join(" · ") } : {}),
  };
}

/** Isole les lignes d'une fiche de la réconciliation de sa liste parente. */
export function documentChildRowsReconcileKey(
  envelope: Pick<DocumentEnvelope, "doctype" | "name">,
): string {
  return `document-rows:${envelope.doctype}:${envelope.name}`;
}

/** Référence compacte vers une ligne article, stable dans la fiche courante. */
export function childRowContextItem(
  envelope: DocumentEnvelope,
  table: ChildTableModel,
  row: ChildTableRow,
  rowIndex: number,
  reconcileKey?: string,
): ContextSelectionItem | null {
  const itemCode = text(row.item_code);
  if (!itemCode) return null;
  const itemName = text(row.item_name);
  const rawRows = envelope.document[table.key];
  const rawRow = Array.isArray(rawRows) && rawRows[rowIndex] !== null &&
      typeof rawRows[rowIndex] === "object" && !Array.isArray(rawRows[rowIndex])
    ? rawRows[rowIndex] as Record<string, unknown>
    : null;
  const rowIdentity = text(rawRow?.name) ?? text(rawRow?.idx) ??
    `${itemCode}:${rowIndex + 1}`;
  const value = [
    text(row.qty) ? `Qty ${text(row.qty)}` : null,
    text(row.warehouse),
    text(row.amount),
  ].filter((part): part is string => Boolean(part));
  return {
    id:
      `record:${envelope.doctype}:${envelope.name}:row:${table.key}:${rowIdentity}`,
    view: `${envelope.doctype} · ${envelope.name}`,
    ...(reconcileKey ? { reconcileKey } : {}),
    label: itemName ? `${itemCode} · ${itemName}` : itemCode,
    ...(value.length > 0 ? { value: value.join(" · ") } : {}),
  };
}
