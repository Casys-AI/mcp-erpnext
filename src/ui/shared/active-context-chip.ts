import type {
  ActiveContextSelection,
  ContextSelectionItem,
} from "./active-context.ts";
import { t } from "./i18n.ts";
import {
  type SelectionGroup,
  selectionGroupSummary,
  type SelectionState,
} from "./selection-projection.ts";

export type ActiveContextChipEntry =
  & {
    key: string;
    label: string;
    summary?: string;
    view: string;
    value?: string;
  }
  & (
    | { kind: "single"; selection: ActiveContextSelection }
    | { kind: "group"; group: SelectionGroup }
  );

function rowSelectionLabel(count: number, doctype: string): string {
  return `${count} ${count === 1 ? "row" : "rows"} · ${doctype}`;
}

export function activeContextChipEntries(
  selections: readonly ActiveContextSelection[],
  selection?: SelectionState,
): ActiveContextChipEntry[] {
  function singleEntry(single: ActiveContextSelection): ActiveContextChipEntry {
    return {
      kind: "single",
      key: JSON.stringify(["single", single.scopeKey, single.item.id]),
      ...activeContextChipItem(single.item),
      view: single.item.view,
      value: single.item.value,
      selection: single,
    };
  }
  if (!selection) return selections.map(singleEntry);
  const entries = selection.singles.map((single) => ({
    order: single.order,
    entry: singleEntry(single),
  }));
  for (const group of selection.groups) {
    if (group.members.length === 0) continue;
    entries.push({
      order: group.members[0].order,
      entry: {
        kind: "group",
        key: JSON.stringify(["group", group.scopeKey, group.reconcileKey]),
        label: rowSelectionLabel(group.members.length, group.doctype),
        summary: selectionGroupSummary(group),
        view: group.view,
        group,
      },
    });
  }
  return entries.sort((left, right) => left.order - right.order)
    .map(({ entry }) => entry);
}

export function activeContextChipItem(
  item: ContextSelectionItem,
): { label: string; summary?: string } {
  if (!item.query) return { label: item.label };
  return {
    label: rowSelectionLabel(item.query.selectedCount, item.query.args.doctype),
    summary: item.label,
  };
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

export function activeContextChipNotices(
  selections: readonly ActiveContextSelection[],
  selection?: SelectionState,
): string[] {
  const notices: string[] = [];
  if (selections.some(({ item }) => (item.fields?.length ?? 0) > 0)) {
    notices.push("details shared");
  }
  for (const group of selection?.groups ?? []) {
    if (group.members.length === 0) continue;
    const names = projectedRecordNames(
      selections,
      group.scopeKey,
      group.doctype,
      group.reconcileKey,
    );
    const sharedCount = group.members.filter((member) =>
      names.has(member.name)
    ).length;
    if (sharedCount < group.members.length) {
      notices.push(t("context.active.partly_shared", {
        shared: sharedCount,
        total: group.members.length,
      }));
    }
  }
  return notices;
}

type RemovalFocus<T> =
  | { kind: "outside" }
  | { kind: "single" }
  | { kind: "item"; selection: T };

export function activeContextRemovalFocus<T>(
  renderedSelections: readonly T[],
  removedIndex: number,
): RemovalFocus<T> {
  if (renderedSelections.length === 0) return { kind: "outside" };
  if (renderedSelections.length === 1) return { kind: "single" };
  return {
    kind: "item",
    selection: renderedSelections[
      Math.min(removedIndex, renderedSelections.length - 1)
    ],
  };
}
