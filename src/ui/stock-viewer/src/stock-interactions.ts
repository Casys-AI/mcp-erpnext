import type { ContextSelectionItem } from "../../shared/active-context.ts";
import type { StockEntry } from "./types.ts";

/** Identite stable d'une ligne, distincte de son etat d'ouverture. */
export function stockRowContextId(row: StockEntry): string {
  return `stock:${encodeURIComponent(row.item_code)}:${
    encodeURIComponent(row.warehouse)
  }`;
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
    view,
    label: row.item_code,
    ...(value.length > 0 ? { value: value.join(" · ") } : {}),
  };
}

/** Cible ARIA sans espace pour le detail inline de la ligne. */
export function stockRowDetailId(row: StockEntry): string {
  return `stock-row-detail-${encodeURIComponent(row.item_code)}--${
    encodeURIComponent(row.warehouse)
  }`;
}
