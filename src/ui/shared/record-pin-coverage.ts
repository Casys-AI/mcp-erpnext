import type { ActiveContextSelection } from "./active-context.ts";
import type { SelectionState } from "./selection-projection.ts";

export interface RecordPinNames {
  selected: ReadonlySet<string>;
  shared: ReadonlySet<string>;
}

/** Record identities represented by acknowledged singles or the filters of a bounded query. */
export function projectedRecordNames(
  selections: readonly ActiveContextSelection[],
  scope: string,
  doctype: string,
  reconcileKey?: string,
): Set<string> {
  const names = new Set<string>();
  const prefix = `record:${doctype}:`;
  for (const { scopeKey, item } of selections) {
    if (
      scopeKey !== scope ||
      (reconcileKey !== undefined && item.reconcileKey !== reconcileKey)
    ) continue;
    if (item.id.startsWith(prefix)) names.add(item.id.slice(prefix.length));
    if (item.query?.args.doctype !== doctype) continue;
    for (const [field, operator, values] of item.query.args.filters) {
      if (field === "name" && operator === "in") {
        for (const name of values) names.add(name);
      }
    }
  }
  return names;
}

/** Logical membership and acknowledged projection can differ under a host context budget. */
export function recordPinNames(
  selection: SelectionState,
  acknowledged: readonly ActiveContextSelection[],
  scope: string,
  doctype: string,
): RecordPinNames {
  const selected = new Set<string>();
  const prefix = `record:${doctype}:`;
  for (const { scopeKey, item } of selection.singles) {
    if (scopeKey === scope && item.id.startsWith(prefix)) {
      selected.add(item.id.slice(prefix.length));
    }
  }
  for (const group of selection.groups) {
    if (group.scopeKey !== scope || group.doctype !== doctype) continue;
    for (const member of group.members) selected.add(member.name);
  }
  return {
    selected,
    shared: projectedRecordNames(acknowledged, scope, doctype),
  };
}

/** A full pin means every matching row is both selected and present in the host context. */
export function recordPinCoverage<T>(
  rows: readonly T[],
  idOf: (row: T) => string,
  isSelected: (row: T) => boolean,
  sharedNames: ReadonlySet<string>,
) {
  let selected = 0;
  let shared = 0;
  for (const row of rows) {
    if (!isSelected(row)) continue;
    selected++;
    if (sharedNames.has(idOf(row))) shared++;
  }
  const allSelected = selected > 0 && selected === rows.length;
  const pressed: boolean | "mixed" = allSelected && shared === selected
    ? true
    : selected > 0
    ? "mixed"
    : false;
  return { pressed, allSelected, selected, shared };
}
