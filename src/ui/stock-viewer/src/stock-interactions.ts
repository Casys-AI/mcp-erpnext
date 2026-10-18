import {
  ACTIVE_CONTEXT_LIMITS,
  type ContextSelectionItem,
} from "../../shared/active-context.ts";
import { fnv1a64 } from "../../shared/selection-projection.ts";
import type { StockEntry } from "./types.ts";

export const STOCK_CONTEXT_RECONCILE_KEY = "stock-rows";

/** Identite stable d'une ligne, distincte de son etat d'ouverture. */
export function stockRowContextId(row: StockEntry): string {
  const escape = (part: string) =>
    part.replaceAll("%", "%25").replaceAll(":", "%3A");
  const id = `stock:${escape(row.item_code)}:${escape(row.warehouse)}`;
  return Array.from(id).length <= ACTIVE_CONTEXT_LIMITS.id
    ? id
    : `stock:#${fnv1a64(JSON.stringify([row.item_code, row.warehouse]))}`;
}

/** Cible compacte partagee avec le modele lors d'un clic simple. */
export function stockRowContextItem(
  row: StockEntry,
  view: string,
  actualLabel: string,
  formattedActual: string,
): ContextSelectionItem {
  const value = [
    row.warehouse.trim() || null,
    `${actualLabel} ${formattedActual}`.trim(),
  ].filter((part): part is string => Boolean(part));
  return {
    id: stockRowContextId(row),
    reconcileKey: STOCK_CONTEXT_RECONCILE_KEY,
    view,
    label: row.item_code,
    ...(value.length > 0 ? { value: value.join(" · ") } : {}),
    fields: [
      { label: "Item code", value: row.item_code },
      { label: "Warehouse", value: row.warehouse },
      { label: actualLabel, value: formattedActual },
    ],
    fieldsSource: "row",
    ...(row.modified ? { modified: row.modified } : {}),
  };
}

/** Cible ARIA sans espace pour le detail inline de la ligne. */
export function stockRowDetailId(row: StockEntry): string {
  return `stock-row-detail-${encodeURIComponent(row.item_code)}--${
    encodeURIComponent(row.warehouse)
  }`;
}
