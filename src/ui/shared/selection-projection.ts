import {
  type ActiveContextSelection,
  boundActiveContextItem,
  type ContextSelectionField,
  type ContextSelectionItem,
  fresherSelectionItem,
  validateActiveContextId,
} from "./active-context.ts";

export { fresherSelectionItem } from "./active-context.ts";

export interface SelectionSingle extends ActiveContextSelection {
  order: number;
}

export interface SelectionGroupMemberInput {
  name: string;
  label: string;
  value?: string;
  fields?: ContextSelectionField[];
  fieldsSource: "record" | "row";
  modified?: string;
  date?: string;
  amount?: number;
  currency?: string;
}

export interface SelectionGroupMember extends SelectionGroupMemberInput {
  order: number;
}

export interface SelectionGroupConfig {
  scopeKey: string;
  reconcileKey: string;
  doctype: string;
  view: string;
  doctypeLabel?: string;
  fields: string[];
  queryAvailable?: boolean;
}

export interface SelectionGroup extends SelectionGroupConfig {
  members: SelectionGroupMember[];
}

export interface SelectionState {
  singles: SelectionSingle[];
  groups: SelectionGroup[];
  nextOrder: number;
}

export interface SelectionPolicy {
  compactUpTo: number;
  groupCollapseAbove: number;
  maxEntries: number;
  budgetBytes: number;
}

export const DEFAULT_SELECTION_POLICY: SelectionPolicy = {
  compactUpTo: 3,
  groupCollapseAbove: 8,
  maxEntries: 8,
  budgetBytes: 8192,
};

export function emptySelectionState(): SelectionState {
  return { singles: [], groups: [], nextOrder: 0 };
}

export function addSelectionSingle(
  state: SelectionState,
  scopeKey: string,
  item: ContextSelectionItem,
): SelectionState {
  boundActiveContextItem(item);
  const previous = state.singles.find((single) =>
    single.scopeKey === scopeKey && single.item.id === item.id
  );
  const retainedResource = !("resource" in item)
    ? previous?.item.resource
    : undefined;
  return {
    ...state,
    nextOrder: state.nextOrder + 1,
    singles: [
      ...state.singles.filter((single) =>
        single.scopeKey !== scopeKey || single.item.id !== item.id
      ),
      {
        scopeKey,
        order: state.nextOrder,
        item: retainedResource ? { ...item, resource: retainedResource } : item,
      },
    ],
    groups: state.groups.map((group) =>
      group.scopeKey !== scopeKey ? group : {
        ...group,
        members: group.members.filter((member) =>
          memberItem(group, member).id !== item.id
        ),
      }
    ).filter((group) => group.members.length > 0),
  };
}

export function setSelectionGroupMembers(
  state: SelectionState,
  config: SelectionGroupConfig,
  members: readonly SelectionGroupMemberInput[],
): SelectionState {
  const previous = state.groups.find((group) =>
    group.scopeKey === config.scopeKey &&
    group.reconcileKey === config.reconcileKey
  );
  const byName = new Map(
    previous?.members.map((member) => [member.name, member]),
  );
  const unique = new Map<string, SelectionGroupMember>();
  let nextOrder = state.nextOrder;
  for (const member of members) {
    validateActiveContextId(`record:${config.doctype}:${member.name}`);
    if (unique.has(member.name)) continue;
    const old = byName.get(member.name);
    unique.set(member.name, {
      ...(old ? fresherMember(old, member) : member),
      order: old?.order ?? nextOrder++,
    });
  }
  const memberIds = new Set(
    [...unique.keys()].map((name) => `record:${config.doctype}:${name}`),
  );
  const groups = state.groups.filter((group) =>
    group.scopeKey !== config.scopeKey ||
    group.reconcileKey !== config.reconcileKey
  ).map((group) =>
    group.scopeKey !== config.scopeKey ? group : {
      ...group,
      members: group.members.filter((member) =>
        !memberIds.has(memberItem(group, member).id)
      ),
    }
  ).filter((group) => group.members.length > 0);
  if (unique.size > 0) {
    groups.push({
      ...config,
      members: [...unique.values()].sort((a, b) => a.order - b.order),
    });
  }
  return {
    ...state,
    singles: state.singles.filter((single) =>
      single.scopeKey !== config.scopeKey || !memberIds.has(single.item.id)
    ),
    groups,
    nextOrder,
  };
}

export function toggleSelectionGroupMember(
  state: SelectionState,
  config: SelectionGroupConfig,
  member: SelectionGroupMemberInput,
): SelectionState {
  const group = state.groups.find((group) =>
    group.scopeKey === config.scopeKey &&
    group.reconcileKey === config.reconcileKey
  );
  const members = group?.members ?? [];
  const selected = members.some((current) => current.name === member.name);
  return setSelectionGroupMembers(
    state,
    config,
    selected
      ? members.filter((current) => current.name !== member.name)
      : [...members, member],
  );
}

export function removeSelectionGroup(
  state: SelectionState,
  scopeKey: string,
  reconcileKey: string,
): SelectionState {
  return {
    ...state,
    groups: state.groups.filter((group) =>
      group.scopeKey !== scopeKey || group.reconcileKey !== reconcileKey
    ),
  };
}

export function removeSelectionItem(
  state: SelectionState,
  target: {
    scopeKey: string;
    item: Pick<ContextSelectionItem, "id" | "reconcileKey">;
  },
): SelectionState {
  const { scopeKey, item } = target;
  if (item.id.startsWith("query:")) {
    const group = state.groups.find((group) =>
      group.scopeKey === scopeKey &&
      (item.reconcileKey
        ? group.reconcileKey === item.reconcileKey
        : queryItem(group).id === item.id)
    );
    if (group) return removeSelectionGroup(state, scopeKey, group.reconcileKey);
  }
  return {
    ...state,
    singles: state.singles.filter((single) =>
      single.scopeKey !== scopeKey || single.item.id !== item.id
    ),
    groups: state.groups.map((group) =>
      group.scopeKey !== scopeKey ? group : {
        ...group,
        members: group.members.filter((member) =>
          memberItem(group, member).id !== item.id
        ),
      }
    ).filter((group) => group.members.length > 0),
  };
}

function fresherMember(
  current: SelectionGroupMember,
  candidate: SelectionGroupMemberInput,
): SelectionGroupMemberInput {
  const identity = { id: current.name, view: "", label: current.label };
  const merged = fresherSelectionItem(
    { ...identity, ...current },
    { ...identity, ...candidate },
  );
  if (
    merged.modified === current.modified && current.modified &&
    candidate.modified &&
    candidate.modified < current.modified
  ) return current;
  return {
    ...current,
    ...candidate,
    fields: merged.fields,
    fieldsSource: merged.fieldsSource ?? candidate.fieldsSource,
    modified: merged.modified,
  };
}

export function reconcileSelectionGroup(
  state: SelectionState,
  scopeKey: string,
  reconcileKey: string,
  candidates: readonly SelectionGroupMemberInput[],
  complete = false,
): SelectionState {
  const byName = new Map(
    candidates.map((candidate) => [candidate.name, candidate]),
  );
  return {
    ...state,
    groups: state.groups.map((group) => {
      if (group.scopeKey !== scopeKey || group.reconcileKey !== reconcileKey) {
        return group;
      }
      const members = group.members.flatMap((member) => {
        const candidate = byName.get(member.name);
        if (!candidate) return complete ? [] : [member];
        return [{ ...fresherMember(member, candidate), order: member.order }];
      });
      return { ...group, members };
    }).filter((group) => group.members.length > 0),
  };
}

export function reconcileSelectionDocumentFields(
  state: SelectionState,
  scopeKey: string,
  documentId: string,
  candidate: ContextSelectionItem,
): SelectionState {
  return {
    ...state,
    groups: state.groups.map((group) =>
      group.scopeKey !== scopeKey ? group : {
        ...group,
        members: group.members.map((member) => {
          if (memberItem(group, member).id !== documentId) return member;
          return {
            ...fresherMember(member, {
              ...member,
              label: candidate.label,
              value: candidate.value,
              fields: candidate.fields,
              fieldsSource: candidate.fieldsSource ?? "record",
              modified: candidate.modified,
            }),
            order: member.order,
          };
        }),
      }
    ),
  };
}

function memberItem(
  group: SelectionGroup,
  member: SelectionGroupMember,
): ContextSelectionItem {
  return {
    id: `record:${group.doctype}:${member.name}`,
    view: group.view,
    reconcileKey: group.reconcileKey,
    label: member.label,
    ...(member.value === undefined ? {} : { value: member.value }),
    ...(member.fields ? { fields: member.fields } : {}),
    fieldsSource: member.fieldsSource,
    ...(member.modified ? { modified: member.modified } : {}),
  };
}

/** FNV-1a 64 bits sur les octets UTF-8, sans dépendre d'une API asynchrone. */
export function fnv1a64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let hash = 0xcbf29ce484222325n;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

export function selectionNamesHash(names: readonly string[]): string {
  return fnv1a64(JSON.stringify([...names].sort()));
}

function queryItem(group: SelectionGroup): ContextSelectionItem {
  const names = group.members.map((member) => member.name);
  const included = names.slice(0, 100);
  const truncated = names.length > included.length;
  const label = group.doctypeLabel ?? group.doctype;
  const summary = [
    truncated
      ? `first ${included.length} of ${names.length} selected ${label}`
      : `${names.length} ${label}`,
  ];
  const dates = group.members.flatMap((member) =>
    member.date ? [member.date] : []
  ).sort();
  if (dates.length) {
    summary.push(
      dates[0] === dates[dates.length - 1]
        ? dates[0]
        : `${dates[0]}–${dates[dates.length - 1]}`,
    );
  }
  let low = Infinity;
  let high = -Infinity;
  for (const { amount } of group.members) {
    if (typeof amount !== "number" || !Number.isFinite(amount)) continue;
    low = Math.min(low, amount);
    high = Math.max(high, amount);
  }
  const currencies = new Set(
    group.members.flatMap((member) => member.currency ? [member.currency] : []),
  );
  if (low !== Infinity && currencies.size <= 1) {
    summary.push(
      `${low === high ? low : `${low}–${high}`}${
        currencies.size ? ` ${[...currencies][0]}` : ""
      }`,
    );
  }
  return {
    id: `query:${group.doctype}:${selectionNamesHash(names)}`,
    view: group.view,
    reconcileKey: group.reconcileKey,
    label: summary.join(" · "),
    query: {
      tool: "erpnext_doc_list",
      args: {
        doctype: group.doctype,
        filters: [["name", "in", included]],
        fields: group.fields.slice(),
        limit: included.length,
      },
      selectedCount: names.length,
      includedCount: included.length,
      truncated,
    },
  };
}

interface ProjectionEntry extends ActiveContextSelection {
  order: number;
  group?: SelectionGroup;
  memberName?: string;
}

function rawEntries(
  state: SelectionState,
  policy: SelectionPolicy,
): ProjectionEntry[] {
  const groups = state.groups.filter((group) => group.members.length > 0)
    .slice().sort((left, right) =>
      left.members[0].order - right.members[0].order
    );
  const collapsible = groups.filter((group) => group.queryAvailable !== false);
  const widths = new Map(collapsible.map((group) => [group, 1]));
  let used = state.singles.length + collapsible.length;
  for (const group of collapsible) {
    const width = group.members.length;
    if (
      width <= policy.groupCollapseAbove &&
      used + width - 1 <= policy.maxEntries
    ) {
      widths.set(group, width);
      used += width - 1;
    }
  }
  const entries: ProjectionEntry[] = state.singles.map((single) => ({
    ...single,
  }));
  for (const group of collapsible) {
    if (widths.get(group) === group.members.length) {
      entries.push(...group.members.map((member) => ({
        scopeKey: group.scopeKey,
        order: member.order,
        item: memberItem(group, member),
        group,
        memberName: member.name,
      })));
    } else {
      entries.push({
        scopeKey: group.scopeKey,
        order: group.members[0].order,
        item: queryItem(group),
        group,
      });
    }
  }
  // Sans outil de requête, seuls les membres les plus récents occupent la place
  // restante. Les autres restent sélectionnés et ne participent pas à l'éviction.
  const fallback = groups.filter((group) => group.queryAvailable === false)
    .flatMap((group) =>
      group.members.map((member) => ({
        scopeKey: group.scopeKey,
        order: member.order,
        item: memberItem(group, member),
        group,
        memberName: member.name,
      }))
    ).sort((left, right) => left.order - right.order);
  const available = Math.max(0, policy.maxEntries - entries.length);
  if (available) entries.push(...fallback.slice(-available));
  return entries.sort((left, right) => left.order - right.order);
}

function withoutFields(item: ContextSelectionItem): ContextSelectionItem {
  const { fields: _fields, ...rest } = item;
  return rest;
}

function projection(state: SelectionState, policy: SelectionPolicy) {
  const source = rawEntries(state, policy);
  let entries = source.slice(Math.max(0, source.length - policy.maxEntries))
    .map((entry) => ({
      ...entry,
      item: { ...entry.item, ...boundActiveContextItem(entry.item) },
    }));
  if (entries.length > policy.compactUpTo) {
    entries = entries.map((entry) => ({
      ...entry,
      item: withoutFields(entry.item),
    }));
  }
  const size = () =>
    new TextEncoder().encode(JSON.stringify(
      entries.map((entry) => boundActiveContextItem(entry.item)),
    )).byteLength;
  for (
    let index = entries.length - 1;
    index >= 0 && size() > policy.budgetBytes;
    index--
  ) {
    entries[index] = {
      ...entries[index],
      item: withoutFields(entries[index].item),
    };
  }
  while (entries.length && size() > policy.budgetBytes) entries.shift();
  let resourceIndex = entries.length === 1 ? 0 : -1;
  for (let index = entries.length - 1; index >= 0; index--) {
    const resource = entries[index].item.resource;
    if (resource && resource.kind !== "derived") {
      resourceIndex = index;
      break;
    }
  }
  entries = entries.map((entry, index) => {
    if (index === resourceIndex) return entry;
    const { resource: _resource, ...item } = entry.item;
    return { ...entry, item };
  });
  const kept = new Set(entries.map((entry) => entry.order));
  return { entries, evicted: source.filter((entry) => !kept.has(entry.order)) };
}

export function projectSelection(
  state: SelectionState,
  policy: SelectionPolicy = DEFAULT_SELECTION_POLICY,
): ContextSelectionItem[] {
  return projection(state, policy).entries.map((entry) => entry.item);
}

export function projectedSelectionEntries(
  state: SelectionState,
  policy: SelectionPolicy = DEFAULT_SELECTION_POLICY,
): ActiveContextSelection[] {
  return projection(state, policy).entries.map(({ scopeKey, item }) => ({
    scopeKey,
    item,
  }));
}

/** À appeler seulement pour un ajout : un retrait conserve toujours les membres. */
export function normalizeSelectionAddition(
  state: SelectionState,
  policy: SelectionPolicy = DEFAULT_SELECTION_POLICY,
): { state: SelectionState; evicted: ActiveContextSelection[] } {
  const evicted: ActiveContextSelection[] = [];
  let next = state;
  // Une éviction peut libérer le dépliage d'un autre groupe : ses références
  // doivent à leur tour respecter le budget avant de confirmer les membres.
  while (true) {
    const dropped = projection(next, policy).evicted.filter((entry) =>
      entry.group?.queryAvailable !== false
    );
    if (!dropped.length) break;
    for (const entry of dropped) {
      if (!entry.group) {
        next = {
          ...next,
          singles: next.singles.filter((single) =>
            single.scopeKey !== entry.scopeKey || single.order !== entry.order
          ),
        };
      } else if (entry.memberName === undefined) {
        next = removeSelectionGroup(
          next,
          entry.scopeKey,
          entry.group.reconcileKey,
        );
      } else {
        next = {
          ...next,
          groups: next.groups.map((group) =>
            group.scopeKey !== entry.scopeKey ||
              group.reconcileKey !== entry.group!.reconcileKey
              ? group
              : {
                ...group,
                members: group.members.filter((member) =>
                  member.name !== entry.memberName
                ),
              }
          ).filter((group) => group.members.length > 0),
        };
      }
      evicted.push({ scopeKey: entry.scopeKey, item: entry.item });
    }
  }
  return { state: next, evicted };
}
