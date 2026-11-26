import {
  ACTIVE_CONTEXT_LIMITS,
  type ContextSelectionItem,
} from "../../shared/active-context.ts";
import {
  addSelectionGroupMembers,
  fnv1a64,
  projectSelection,
  type SelectionGroupConfig,
  type SelectionGroupMemberInput,
  type SelectionState,
} from "../../shared/selection-projection.ts";
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

/** Cible compacte partagée par une épingle. */
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

export function stockBinMember(
  row: StockEntry,
  item: ContextSelectionItem,
): SelectionGroupMemberInput | undefined {
  if (
    typeof row.name !== "string" || !row.name.trim() || !item.label.trim() ||
    Array.from(`record:Bin:${row.name}`).length > ACTIVE_CONTEXT_LIMITS.id
  ) return;
  return {
    name: row.name,
    label: item.label,
    value: item.value,
    fields: item.fields,
    fieldsSource: "row",
    modified: item.modified,
  };
}

/** Offer a bulk pin only if the context projection can represent every matching Bin. */
export function stockBulkPinState(
  state: SelectionState,
  config: SelectionGroupConfig,
  filtered: readonly SelectionGroupMemberInput[],
): boolean | "mixed" | undefined {
  // A query projection can serialize at most 100 exact ERP record names.
  if (!filtered.length || filtered.length > 100) return;
  const existing = state.groups.find((group) =>
    group.scopeKey === config.scopeKey &&
    group.reconcileKey === config.reconcileKey
  );
  const pinned = new Set(existing?.members.map((row) => row.name));
  const count = filtered.filter((row) => pinned.has(row.name)).length;
  const allPinned = count === filtered.length;
  const projected = projectSelection(
    allPinned ? state : addSelectionGroupMembers(state, config, filtered),
  );
  const included = new Set<string>();
  for (const item of projected) {
    if (item.reconcileKey !== config.reconcileKey) continue;
    if (item.query) {
      if (item.query.truncated) return;
      for (const name of item.query.args.filters[0][2]) included.add(name);
    } else if (item.id.startsWith("record:Bin:")) {
      included.add(item.id.slice("record:Bin:".length));
    }
  }
  if (!filtered.every((row) => included.has(row.name))) return;
  return allPinned || (count ? "mixed" : false);
}

/** Cible ARIA sans espace pour le detail inline de la ligne. */
export function stockRowDetailId(row: StockEntry): string {
  return `stock-row-detail-${encodeURIComponent(row.item_code)}--${
    encodeURIComponent(row.warehouse)
  }`;
}
