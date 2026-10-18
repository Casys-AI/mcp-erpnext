import { assertEquals, assertNotEquals } from "@std/assert";
import { boundActiveContextItem } from "./active-context.ts";
import {
  addSelectionSingle,
  emptySelectionState,
  normalizeSelectionAddition,
  projectedSelectionEntries,
  projectSelection,
  reconcileSelectionGroup,
  removeSelectionGroup,
  removeSelectionItem,
  type SelectionGroupConfig,
  type SelectionGroupMemberInput,
  type SelectionState,
  setSelectionGroupMembers,
} from "./selection-projection.ts";

const CONFIG: SelectionGroupConfig = {
  scopeKey: "root",
  reconcileKey: "list",
  doctype: "Sales Invoice",
  view: "Invoices",
  fields: ["name", "posting_date", "grand_total"],
};
const fields = [{ label: "Customer", value: "Alice" }];
function members(count: number): SelectionGroupMemberInput[] {
  return Array.from({ length: count }, (_, index) => ({
    name: `INV-${index + 1}`,
    label: `Invoice ${index + 1}`,
    fields,
    fieldsSource: "row" as const,
  }));
}
function group(count: number): SelectionState {
  return setSelectionGroupMembers(
    emptySelectionState(),
    CONFIG,
    members(count),
  );
}
function single(state: SelectionState, index: number) {
  return addSelectionSingle(state, "root", {
    id: `record:Customer:C-${index}`,
    view: "Customer",
    label: `Customer ${index}`,
    fields,
    fieldsSource: "record",
  });
}
Deno.test("projectSelection : paliers 1, 2, 3, 4 et 8, groupe 8 puis 9", () => {
  for (const count of [1, 2, 3, 4, 8]) {
    const projected = projectSelection(group(count));
    assertEquals(projected.length, count);
    assertEquals(
      projected.every((item) =>
        count <= 3 ? Boolean(item.fields) : !("fields" in item)
      ),
      true,
    );
    assertEquals(projected.every((item) => !item.query), true);
  }
  const query = projectSelection(group(9));
  assertEquals(query.length, 1);
  assertEquals(query[0].query?.selectedCount, 9);
});
Deno.test("projectSelection : FIFO sur entrées et membres retirés atomiquement", () => {
  let state = group(9);
  for (let index = 0; index < 8; index++) state = single(state, index);
  const result = normalizeSelectionAddition(state);
  assertEquals(result.state.groups.length, 0);
  assertEquals(result.state.singles.length, 8);
  assertEquals(result.evicted[0].item.query?.selectedCount, 9);
  assertEquals(projectSelection(result.state).length, 8);
});
Deno.test("projectSelection : retrait 9 + 7 conserve les sept singles et le repli", () => {
  let state = group(9);
  for (let index = 0; index < 7; index++) state = single(state, index);
  state = normalizeSelectionAddition(state).state;
  state = setSelectionGroupMembers(state, CONFIG, members(8));
  const projection = projectSelection(state);
  assertEquals(state.singles.length, 7);
  assertEquals(projection.length, 8);
  assertEquals(projection[0].query?.selectedCount, 8);
});
Deno.test("projectSelection : budget UTF-8 retire les fields récents avant les anciens", () => {
  let state = emptySelectionState();
  for (let index = 0; index < 3; index++) {
    state = addSelectionSingle(state, "root", {
      id: `record:客户:${index}`,
      view: "客户",
      label: "客户",
      fields: [{ label: "名称", value: "界".repeat(80) }],
    });
  }
  const full = projectSelection(state).map(boundActiveContextItem);
  const withoutNewest = full.map((item, index) => {
    const { fields: _fields, ...rest } = item;
    return index === 2 ? rest : item;
  });
  const bytes = new TextEncoder().encode(JSON.stringify(withoutNewest)).length;
  const projected = projectSelection(state, {
    compactUpTo: 3,
    groupCollapseAbove: 8,
    maxEntries: 8,
    budgetBytes: bytes,
  });
  assertEquals(projected.map((item) => Boolean(item.fields)), [
    true,
    true,
    false,
  ]);
  assertEquals(
    new TextEncoder().encode(
      JSON.stringify(projected.map(boundActiveContextItem)),
    ).length,
    bytes,
  );
  assertEquals(
    bytes > JSON.stringify(projected.map(boundActiveContextItem)).length,
    true,
  );
});
Deno.test("projectSelection : budget sans fields évince les plus anciens", () => {
  let state = emptySelectionState();
  for (let index = 0; index < 3; index++) state = single(state, index);
  const projected = projectSelection(state, {
    compactUpTo: 0,
    groupCollapseAbove: 8,
    maxEntries: 8,
    budgetBytes: 100,
  });
  assertEquals(projected.length, 1);
  assertEquals(projected[0].id, "record:Customer:C-2");
});
Deno.test("projectSelection : pure, déterministe et hash stable indépendamment de l'ordre", () => {
  const state = group(9);
  const before = structuredClone(state);
  assertEquals(projectSelection(state), projectSelection(state));
  assertEquals(state, before);
  const reversed = setSelectionGroupMembers(
    emptySelectionState(),
    CONFIG,
    members(9).reverse(),
  );
  assertEquals(projectSelection(state)[0].id, projectSelection(reversed)[0].id);
  assertNotEquals(
    projectSelection(state)[0].id,
    projectSelection(group(10))[0].id,
  );
});
Deno.test("projectSelection : plafond 100 explicite, identités exactes et résumé", () => {
  const rows = members(230).map((row, index) => ({
    ...row,
    name: ` ${row.name} `,
    date: index === 0 ? "2026-01-01" : "2026-03-31",
    amount: index === 0 ? 1000 : 5000,
    currency: "EUR",
  }));
  const projected = projectSelection(
    setSelectionGroupMembers(emptySelectionState(), CONFIG, rows),
  )[0];
  assertEquals(projected.query?.selectedCount, 230);
  assertEquals(projected.query?.includedCount, 100);
  assertEquals(projected.query?.truncated, true);
  assertEquals(projected.query?.args.limit, 100);
  assertEquals(
    projected.query?.args.filters[0][2],
    rows.slice(0, 100).map((row) => row.name),
  );
  assertEquals(projected.label.includes("first 100 of 230 selected"), true);
  assertEquals(projected.label.includes("2026-01-01–2026-03-31"), true);
  assertEquals(projected.label.includes("1000–5000 EUR"), true);
});
Deno.test("projectSelection : outil absent partage les derniers membres sans les évincer", () => {
  const state = setSelectionGroupMembers(emptySelectionState(), {
    ...CONFIG,
    queryAvailable: false,
  }, members(12));
  const result = normalizeSelectionAddition(state);
  assertEquals(result.state.groups[0].members.length, 12);
  assertEquals(result.evicted.length, 0);
  assertEquals(
    projectSelection(result.state).map((item) => item.id),
    members(12).slice(-8).map((row) => `record:Sales Invoice:${row.name}`),
  );
  assertEquals(
    projectedSelectionEntries(result.state).every((entry) =>
      entry.scopeKey === "root"
    ),
    true,
  );
});
Deno.test("réconciliation groupe : absence confirmée uniquement, fraîcheur modified puis source", () => {
  let state = setSelectionGroupMembers(emptySelectionState(), CONFIG, [
    {
      ...members(1)[0],
      fieldsSource: "record",
      modified: "2026-10-18 12:00:00",
      fields: [{ label: "Status", value: "Paid" }],
    },
    members(2)[1],
  ]);
  state = reconcileSelectionGroup(state, "root", "list", [
    {
      ...members(1)[0],
      modified: "2026-10-18 12:00:00",
      fields: [{ label: "Status", value: "Draft" }],
    },
  ]);
  assertEquals(state.groups[0].members.length, 2);
  assertEquals(state.groups[0].members[0].fields?.[0].value, "Paid");
  state = reconcileSelectionGroup(state, "root", "list", [
    {
      ...members(1)[0],
      modified: "2026-10-18 13:00:00",
      fields: [{ label: "Status", value: "Cancelled" }],
    },
  ], true);
  assertEquals(state.groups[0].members.length, 1);
  assertEquals(state.groups[0].members[0].fields?.[0].value, "Cancelled");
  state = reconcileSelectionGroup(state, "root", "list", [
    {
      ...members(1)[0],
      fieldsSource: "record",
      modified: "2026-10-18 11:00:00",
      fields,
    },
  ]);
  assertEquals(state.groups[0].members[0].fields?.[0].value, "Cancelled");
  assertEquals(removeSelectionGroup(state, "root", "list").groups, []);
});

Deno.test("normalisation : éviction puis dépliage respecte encore le budget et retire les membres", () => {
  let state = setSelectionGroupMembers(
    emptySelectionState(),
    CONFIG,
    members(9).map((member) => ({
      ...member,
      name: `${member.name}${"x".repeat(130)}`,
    })),
  );
  state = setSelectionGroupMembers(
    state,
    { ...CONFIG, reconcileKey: "other" },
    members(8).map((member, index) => ({
      ...member,
      name: `B${index}`,
      label: "B".repeat(240),
    })),
  );
  const policy = {
    compactUpTo: 3,
    groupCollapseAbove: 8,
    maxEntries: 8,
    budgetBytes: 800,
  };
  const result = normalizeSelectionAddition(state, policy);
  assertEquals(result.state.groups[0].members.map((member) => member.name), [
    "B6",
    "B7",
  ]);
  assertEquals(result.evicted.length, 7);
  assertEquals(normalizeSelectionAddition(result.state, policy).evicted, []);
});

Deno.test("réconciliation : conserve les métadonnées de résumé absentes du refresh générique", () => {
  const initial = members(9).map((member, index) => ({
    ...member,
    date: index === 0 ? "2026-01-01" : "2026-03-31",
    amount: index === 0 ? 1000 : 5000,
    currency: "EUR",
  }));
  const state = setSelectionGroupMembers(
    emptySelectionState(),
    CONFIG,
    initial,
  );
  const refreshed = reconcileSelectionGroup(state, "root", "list", members(9));
  assertEquals(
    projectSelection(refreshed)[0].label,
    projectSelection(state)[0].label,
  );
});

Deno.test("projectSelection : identifiants exacts à tous les paliers", () => {
  for (const count of [1, 2, 3, 4, 8, 9]) {
    const rows = members(count).map((member) => ({
      ...member,
      name: ` ${member.name}\n `,
    }));
    const state = setSelectionGroupMembers(emptySelectionState(), CONFIG, rows);
    const projected = projectSelection(state);
    if (count <= 8) {
      assertEquals(
        projected.map((item) => item.id),
        rows.map((row) => `record:${CONFIG.doctype}:${row.name}`),
      );
    } else {
      assertEquals(
        projected[0].query?.args.filters[0][2],
        rows.map((row) => row.name),
      );
    }
  }
});

Deno.test("projectSelection : paliers des singles et fraîcheur sans modified", () => {
  let state = emptySelectionState();
  for (let count = 1; count <= 8; count++) {
    state = single(state, count);
    assertEquals(
      projectSelection(state).every((item) =>
        count <= 3 ? Boolean(item.fields) : !("fields" in item)
      ),
      true,
    );
  }
  let selected = group(1);
  selected = reconcileSelectionGroup(selected, "root", "list", [{
    ...members(1)[0],
    fieldsSource: "record",
    fields: [{ label: "Source", value: "Fiche" }],
  }]);
  selected = reconcileSelectionGroup(selected, "root", "list", members(1));
  assertEquals(selected.groups[0].members[0].fields?.[0].value, "Fiche");
});

Deno.test("identité : single ancien puis groupe et ajout ne doublonnent ni n'évincent un voisin", () => {
  let state = addSelectionSingle(emptySelectionState(), "root", {
    id: "record:Sales Invoice:INV-1",
    view: "Invoices",
    label: "Invoice 1",
  });
  for (let index = 0; index < 6; index++) state = single(state, index);
  state = setSelectionGroupMembers(state, CONFIG, members(1));
  const expected = [
    ...Array.from({ length: 6 }, (_, index) => `record:Customer:C-${index}`),
    "record:Sales Invoice:INV-1",
  ];
  assertEquals(projectSelection(state).map((item) => item.id), expected);
  const result = normalizeSelectionAddition(single(state, 6));
  assertEquals(result.evicted, []);
  assertEquals(projectSelection(result.state).map((item) => item.id), [
    ...expected,
    "record:Customer:C-6",
  ]);
  assertEquals(result.state.groups[0].members.map((member) => member.name), [
    "INV-1",
  ]);
});

Deno.test("identité : ajout single retire seulement le membre de même portée", () => {
  let state = setSelectionGroupMembers(group(2), {
    ...CONFIG,
    scopeKey: "other",
  }, members(2));
  state = addSelectionSingle(state, "root", {
    id: "record:Sales Invoice:INV-1",
    view: "Invoices",
    label: "Invoice 1",
  });
  assertEquals(
    state.groups.map((group) => group.members.map((member) => member.name)),
    [
      ["INV-2"],
      ["INV-1", "INV-2"],
    ],
  );
  assertEquals(
    projectedSelectionEntries(state).map((
      { scopeKey, item },
    ) => [scopeKey, item.id]),
    [
      ["root", "record:Sales Invoice:INV-2"],
      ["other", "record:Sales Invoice:INV-1"],
      ["other", "record:Sales Invoice:INV-2"],
      ["root", "record:Sales Invoice:INV-1"],
    ],
  );
});

Deno.test("identité : groupe retire les singles et autres membres seulement dans sa portée", () => {
  let state = group(2);
  state = addSelectionSingle(state, "other", {
    id: "record:Sales Invoice:INV-1",
    view: "Invoices",
    label: "Other root",
  });
  state = setSelectionGroupMembers(state, {
    ...CONFIG,
    reconcileKey: "second-list",
  }, members(1));
  assertEquals(state.singles.map((single) => single.scopeKey), ["other"]);
  assertEquals(
    state.groups.map((
      group,
    ) => [group.reconcileKey, group.members.map((member) => member.name)]),
    [
      ["list", ["INV-2"]],
      ["second-list", ["INV-1"]],
    ],
  );
});

Deno.test("éviction ciblée : un ancien single ne retire pas un membre homonyme", () => {
  // Défense de la normalisation face à un état antérieur à l'unicité.
  const state = group(1);
  state.groups[0].members[0].order = 1;
  state.singles = [{
    scopeKey: "root",
    order: 0,
    item: {
      id: "record:Sales Invoice:INV-1",
      view: "Invoices",
      label: "Old single",
    },
  }];
  state.nextOrder = 2;
  const result = normalizeSelectionAddition(state, {
    compactUpTo: 3,
    groupCollapseAbove: 8,
    maxEntries: 1,
    budgetBytes: 8192,
  });
  assertEquals(result.state.singles, []);
  assertEquals(result.state.groups[0]?.members.map((member) => member.name), [
    "INV-1",
  ]);
  assertEquals(result.evicted.map((entry) => entry.item.label), ["Old single"]);
});

Deno.test("éviction ciblée : un membre ne retire pas son homonyme d'un autre groupe", () => {
  const state = group(1);
  state.groups.push({
    ...state.groups[0],
    reconcileKey: "other",
    members: [{ ...state.groups[0].members[0], order: 1 }],
  });
  state.nextOrder = 2;
  const result = normalizeSelectionAddition(state, {
    compactUpTo: 3,
    groupCollapseAbove: 8,
    maxEntries: 1,
    budgetBytes: 8192,
  });
  assertEquals(result.state.groups.map((group) => group.reconcileKey), [
    "other",
  ]);
  assertEquals(result.state.groups[0].members.map((member) => member.name), [
    "INV-1",
  ]);
});

Deno.test("queryItem : résumé de montants pour un groupe sans limite de taille", () => {
  const rows = Array.from({ length: 150_000 }, (_, index) => ({
    name: `INV-${index}`,
    label: `INV-${index}`,
    fieldsSource: "row" as const,
    order: index,
    amount: index - 100,
    currency: "EUR",
  }));
  const state: SelectionState = {
    singles: [],
    groups: [{ ...CONFIG, members: rows }],
    nextOrder: rows.length,
  };
  const [projected] = projectSelection(state);
  assertEquals(projected.query?.selectedCount, 150_000);
  assertEquals(projected.label.includes("-100–149899 EUR"), true);
});

Deno.test("ressources : seule la pièce jointe explicite la plus récente est projetée", () => {
  const resource = (name: string, kind: "attachment" | "derived") => ({
    uri: `ui://test/${name}`,
    mimeType: "application/json",
    bytes: new Uint8Array([123, 125]),
    kind,
  });
  const items = [
    {
      id: "old",
      view: "Files",
      label: "Old",
      resource: resource("old", "attachment"),
    },
    {
      id: "new",
      view: "Files",
      label: "New",
      resource: resource("new", "attachment"),
    },
    {
      id: "chart",
      view: "Chart",
      label: "Chart",
      resource: resource("chart", "derived"),
    },
  ];
  const state = items.reduce(
    (state, item) => addSelectionSingle(state, "root", item),
    emptySelectionState(),
  );
  const before = structuredClone(state);
  assertEquals(projectSelection(state).map((item) => "resource" in item), [
    false,
    true,
    false,
  ]);
  assertEquals(
    projectedSelectionEntries(state).map(({ item }) => item.resource),
    [undefined, items[1].resource, undefined],
  );
  assertEquals(state, before);
  const removed = removeSelectionItem(state, {
    scopeKey: "root",
    item: items[1],
  });
  assertEquals(projectSelection(removed).map((item) => item.resource), [
    items[0].resource,
    undefined,
  ]);
});
