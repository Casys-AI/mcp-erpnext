import { assertEquals } from "@std/assert";
import {
  activeContextChipEntries,
  activeContextChipItem,
  activeContextChipNotices,
  activeContextRemovalFocus,
} from "./active-context-chip.ts";
import type { ContextSelectionItem } from "./active-context.ts";
import {
  addSelectionSingle,
  DEFAULT_SELECTION_POLICY,
  emptySelectionState,
  projectedSelectionEntries,
  removeSelectionGroup,
  removeSelectionItem,
  setSelectionGroupMembers,
} from "./selection-projection.ts";

function invoiceSelection(count: number, queryAvailable = true) {
  return setSelectionGroupMembers(
    emptySelectionState(),
    {
      scopeKey: "root",
      reconcileKey: "invoices",
      doctype: "Sales Invoice",
      view: "Sales invoices",
      fields: ["name", "grand_total"],
      queryAvailable,
    },
    Array.from({ length: count }, (_, index) => ({
      name: `INV-${index + 1}`,
      label: `INV-${index + 1}`,
      fields: [{ label: "Total", value: `${100 + index} EUR` }],
      fieldsSource: "row" as const,
      amount: 100 + index,
      currency: "EUR",
    })),
  );
}

Deno.test("puce : une référence conserve son libellé", () => {
  assertEquals(
    activeContextChipItem({
      id: "record:Sales Invoice:INV-1",
      view: "Sales invoices",
      label: "INV-1",
    }),
    { label: "INV-1" },
  );
});

Deno.test("puce : deux membres dépliés et un single donnent une puce par sélection", () => {
  const selection = addSelectionSingle(invoiceSelection(2), "root", {
    id: "record:Customer:CUST-1",
    label: "Customer 1",
    view: "Customers",
  });
  const projected = projectedSelectionEntries(selection);
  assertEquals(projected.length, 3);
  assertEquals(
    activeContextChipEntries(projected, selection).map((entry) => ({
      kind: entry.kind,
      label: entry.label,
      summary: entry.summary,
    })),
    [
      {
        kind: "group",
        label: "2 rows · Sales Invoice",
        summary: "2 Sales Invoice · 100–101 EUR",
      },
      { kind: "single", label: "Customer 1", summary: undefined },
    ],
  );
});

Deno.test("puce : le groupe reste unique en requête ou en références partielles", () => {
  for (const queryAvailable of [true, false]) {
    const selection = invoiceSelection(30, queryAvailable);
    const entries = activeContextChipEntries(
      projectedSelectionEntries(selection),
      selection,
    );
    assertEquals(entries.length, 1);
    assertEquals(entries[0].kind, "group");
    assertEquals(entries[0].label, "30 rows · Sales Invoice");
    assertEquals(entries[0].summary, "30 Sales Invoice · 100–129 EUR");
  }
});

Deno.test("puce : retrait ciblé du groupe conserve les singles et les autres portées", () => {
  const selection = setSelectionGroupMembers(
    addSelectionSingle(invoiceSelection(2), "root", {
      id: "record:Customer:CUST-1",
      label: "Customer 1",
      view: "Customers",
    }),
    {
      ...invoiceSelection(1).groups[0],
      scopeKey: "another-root",
    },
    [{ name: "OTHER-1", label: "OTHER-1", fieldsSource: "row" }],
  );
  const entries = activeContextChipEntries(
    projectedSelectionEntries(selection),
    selection,
  );
  const target = entries[0];
  assertEquals(target.kind, "group");
  if (target.kind !== "group") throw new Error("Expected group chip");
  const remaining = removeSelectionGroup(
    selection,
    target.group.scopeKey,
    target.group.reconcileKey,
  );
  const remainingEntries = activeContextChipEntries(
    projectedSelectionEntries(remaining),
    remaining,
  );
  assertEquals(remaining.singles, selection.singles);
  assertEquals(remaining.groups.map((group) => group.scopeKey), [
    "another-root",
  ]);
  assertEquals(remainingEntries.map((entry) => entry.kind), [
    "single",
    "group",
  ]);
  assertEquals(activeContextRemovalFocus(remainingEntries, 0), {
    kind: "item",
    selection: remainingEntries[0],
  });
  assertEquals(activeContextRemovalFocus(remainingEntries, 2), {
    kind: "item",
    selection: remainingEntries[1],
  });
  const finalSelection = removeSelectionGroup(
    remaining,
    "another-root",
    "invoices",
  );
  assertEquals(
    activeContextRemovalFocus(
      activeContextChipEntries(
        projectedSelectionEntries(finalSelection),
        finalSelection,
      ),
      1,
    ),
    { kind: "single" },
  );
});

Deno.test("puce : le résumé du groupe couvre les membres au-delà de la requête", () => {
  const selection = invoiceSelection(130);
  const entries = activeContextChipEntries(
    projectedSelectionEntries(selection),
    selection,
  );
  assertEquals(entries[0].summary, "130 Sales Invoice · 100–229 EUR");
});

Deno.test("puce : une requête distingue le nombre de lignes et son résumé", () => {
  const [entry] = projectedSelectionEntries(invoiceSelection(30));
  assertEquals(activeContextChipItem(entry.item), {
    label: "30 rows · Sales Invoice",
    summary: "30 Sales Invoice · 100–129 EUR",
  });
});

Deno.test("puce : une requête tronquée affiche toutes les lignes sélectionnées", () => {
  const [entry] = projectedSelectionEntries(invoiceSelection(130));
  assertEquals(activeContextChipItem(entry.item), {
    label: "130 rows · Sales Invoice",
    summary: "first 100 of 130 selected Sales Invoice · 100–229 EUR",
  });
});

Deno.test("puce : details shared exige des champs effectivement projetés", () => {
  const compact = invoiceSelection(3);
  assertEquals(
    activeContextChipNotices(projectedSelectionEntries(compact), compact),
    ["details shared"],
  );
  const references = invoiceSelection(4);
  assertEquals(
    activeContextChipNotices(projectedSelectionEntries(references), references),
    [],
  );
  const item: ContextSelectionItem = {
    id: "empty",
    label: "Empty fields",
    view: "Test",
    fields: [],
  };
  assertEquals(activeContextChipNotices([{ scopeKey: "root", item }]), []);
});

Deno.test("puce : le repli sans outil de liste annonce la part projetée", () => {
  const selection = invoiceSelection(30, false);
  assertEquals(
    activeContextChipNotices(projectedSelectionEntries(selection), selection),
    ["partly shared (8 of 30)"],
  );
  assertEquals(selection.groups[0].members.length, 30);
});

Deno.test("puce : les autres entrées réduisent la part partagée du groupe", () => {
  let selection = invoiceSelection(30, false);
  for (let index = 0; index < 3; index++) {
    selection = addSelectionSingle(selection, "root", {
      id: `other-${index}`,
      label: `Other ${index}`,
      view: "Other",
    });
  }
  assertEquals(
    activeContextChipNotices(projectedSelectionEntries(selection), selection),
    ["partly shared (5 of 30)"],
  );
});

Deno.test("puce : les lignes d'une autre portée ne comptent pas dans le groupe", () => {
  const selection = invoiceSelection(30, false);
  const entries = projectedSelectionEntries(selection);
  assertEquals(
    activeContextChipNotices(
      entries.map((entry) => ({
        ...entry,
        scopeKey: "another-root",
      })),
      selection,
    ),
    ["partly shared (0 of 30)"],
  );
  assertEquals(
    activeContextChipNotices(
      entries.map((entry) => ({
        ...entry,
        item: { ...entry.item, reconcileKey: "another-list" },
      })),
      selection,
    ),
    ["partly shared (0 of 30)"],
  );
});

Deno.test("puce : une requête représente son groupe entier sans avis de repli", () => {
  const selection = invoiceSelection(30);
  assertEquals(
    activeContextChipNotices(projectedSelectionEntries(selection), selection),
    [],
  );
});

Deno.test("puce : une requête bornée annonce les seuls membres réellement projetés", () => {
  const selection = invoiceSelection(130);
  const entries = projectedSelectionEntries(selection);
  assertEquals(entries[0].item.query?.includedCount, 100);
  assertEquals(activeContextChipNotices(entries, selection), [
    "partly shared (100 of 130)",
  ]);
  const complete = invoiceSelection(9);
  assertEquals(
    activeContextChipNotices(projectedSelectionEntries(complete), complete),
    [],
  );
});

Deno.test("puce : l'avis compte l'union des noms de requête et des références", () => {
  const selection = invoiceSelection(130);
  const entries = projectedSelectionEntries(selection);
  const reference = (name: string) => ({
    scopeKey: "root",
    item: {
      id: `record:Sales Invoice:${name}`,
      reconcileKey: "invoices",
      label: name,
      view: "Sales invoices",
    },
  });
  assertEquals(
    activeContextChipNotices([
      ...entries,
      reference("INV-1"),
      reference("INV-101"),
      { ...reference("INV-102"), scopeKey: "another-root" },
    ], selection),
    ["partly shared (101 of 130)"],
  );
});

Deno.test("puce : aucun avis partiel lorsque toutes les références tiennent", () => {
  const selection = invoiceSelection(8, false);
  assertEquals(
    activeContextChipNotices(projectedSelectionEntries(selection), selection),
    [],
  );
});

Deno.test("puce : les détails projetés et le repli partiel restent tous deux visibles", () => {
  const selection = invoiceSelection(30, false);
  const entries = projectedSelectionEntries(selection, {
    ...DEFAULT_SELECTION_POLICY,
    maxEntries: 3,
  });
  assertEquals(activeContextChipNotices(entries, selection), [
    "details shared",
    "partly shared (3 of 30)",
  ]);
});

Deno.test("puce : le retrait d'une requête cible les lignes réellement dépliées", () => {
  const selection = setSelectionGroupMembers(
    invoiceSelection(9),
    {
      scopeKey: "root",
      reconcileKey: "other-invoices",
      doctype: "Sales Invoice",
      view: "Other invoices",
      fields: ["name"],
      queryAvailable: true,
    },
    Array.from({ length: 8 }, (_, index) => ({
      name: `OTHER-${index}`,
      label: `OTHER-${index}`,
      fieldsSource: "row" as const,
    })),
  );
  const before = projectedSelectionEntries(selection);
  assertEquals(before.length, 2);
  const after = projectedSelectionEntries(
    removeSelectionItem(selection, before[0]),
  );
  assertEquals(after.length, 8);
  assertEquals(activeContextRemovalFocus(after, 0), {
    kind: "item",
    selection: after[0],
  });
  assertEquals(after[0].item.id, "record:Sales Invoice:OTHER-0");
});

Deno.test("puce : le focus après retrait suit le dernier rendu disponible", () => {
  assertEquals(activeContextRemovalFocus([], 0), { kind: "outside" });
  const single = projectedSelectionEntries(invoiceSelection(1));
  assertEquals(activeContextRemovalFocus(single, 1), { kind: "single" });
  const entries = projectedSelectionEntries(invoiceSelection(3));
  assertEquals(activeContextRemovalFocus(entries, 1), {
    kind: "item",
    selection: entries[1],
  });
  assertEquals(activeContextRemovalFocus(entries, 3), {
    kind: "item",
    selection: entries[2],
  });
});
