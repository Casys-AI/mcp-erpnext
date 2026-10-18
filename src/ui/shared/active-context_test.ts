/** Tests du snapshot et de son remplacement atomique dans le contexte hôte. */

import { assertEquals, assertThrows } from "@std/assert";
import {
  ACTIVE_CONTEXT_LIMITS,
  ACTIVE_CONTEXT_MAX_ITEMS,
  ACTIVE_CONTEXT_MAX_RESOURCE_BYTES,
  ACTIVE_CONTEXT_MAX_TEXT_FALLBACK_BYTES,
  ACTIVE_CONTEXT_SCHEMA,
  ACTIVE_CONTEXT_VERSION,
  type ActiveContextHost,
  type ActiveContextHostCapabilities,
  activeContextJsonResource,
  type ActiveContextLocalResource,
  type ActiveContextMutation,
  type ActiveContextSelection,
  activeContextSelectionsForScope,
  activeContextSnapshot,
  ActiveContextValidationError,
  addActiveContextSelection,
  addActiveContextSelectionWithEviction,
  canReplaceActiveContext,
  canShareActiveContextResource,
  clearActiveContext,
  compactActiveContextMutations,
  type ContextSelectionItem,
  type ContextSelectionQuery,
  createActiveContextQueue,
  reconcileActiveContextDocumentSelections,
  reconcileActiveContextItem,
  reconcileActiveContextSelections,
  reconcileActiveContextViewSelections,
  removeActiveContextSelection,
  replaceActiveContext,
  replayActiveContextMutations,
  sameActiveContextItem,
} from "./active-context.ts";

const ITEM: ContextSelectionItem = {
  id: "kpi:revenue-mtd",
  view: "KPI",
  label: "Revenue MTD",
  value: "21 653,00 €",
};

const RESOURCE: ActiveContextLocalResource = {
  uri: "erpnext-file:///FILE-001/invoice.pdf",
  mimeType: "application/pdf",
  bytes: new TextEncoder().encode("%PDF-1.7"),
};

type Outcome = "ok" | "isError" | "throw";

function fakeHost(
  caps: ActiveContextHostCapabilities | undefined,
  outcome: Outcome = "ok",
) {
  const calls: Array<Parameters<ActiveContextHost["updateModelContext"]>[0]> =
    [];
  const host: ActiveContextHost = {
    getHostCapabilities: () => caps,
    updateModelContext: (params) => {
      calls.push(params);
      if (outcome === "throw") return Promise.reject(new Error("refusé"));
      return Promise.resolve(outcome === "isError" ? { isError: true } : {});
    },
  };
  return { host, calls };
}

Deno.test("activeContextSnapshot : snapshot stable sans prompt ni instruction", () => {
  const snapshot = activeContextSnapshot([ITEM]);
  assertEquals(snapshot, {
    schema: ACTIVE_CONTEXT_SCHEMA,
    version: ACTIVE_CONTEXT_VERSION,
    items: [ITEM],
  });
  assertEquals("suggested" in snapshot.items[0], false);
  assertEquals("prompt" in snapshot.items[0], false);
});

Deno.test("activeContextSnapshot : la ressource locale ne fuit jamais dans le snapshot", () => {
  const snapshot = activeContextSnapshot([{
    ...ITEM,
    reconcileKey: "level:private",
    resource: RESOURCE,
  }]);
  assertEquals(snapshot.items, [ITEM]);
  const serialized = JSON.stringify(snapshot);
  assertEquals(serialized.includes("resource"), false);
  assertEquals(serialized.includes("reconcileKey"), false);
  assertEquals(serialized.includes("level:private"), false);
  assertEquals(serialized.includes("bytes"), false);
  assertEquals(serialized.includes(btoa("%PDF-1.7")), false);
});

Deno.test("activeContextSnapshot : normalise, borne et omet la valeur vide", () => {
  const snapshot = activeContextSnapshot([{
    id: `  ${"i".repeat(100)}  `,
    view: ` ${"v".repeat(ACTIVE_CONTEXT_LIMITS.view + 5)} `,
    label: ` ${"l".repeat(ACTIVE_CONTEXT_LIMITS.label + 5)} `,
    value: "   ",
  }]);
  assertEquals(snapshot.items[0].id, `  ${"i".repeat(100)}  `);
  assertEquals(snapshot.items[0].view.length, ACTIVE_CONTEXT_LIMITS.view);
  assertEquals(snapshot.items[0].label.length, ACTIVE_CONTEXT_LIMITS.label);
  assertEquals(snapshot.items[0].value, undefined);
  assertEquals(JSON.stringify(snapshot).length < 1024, true);
});

Deno.test("activeContextSnapshot : refuse les champs requis vides", () => {
  assertThrows(
    () => activeContextSnapshot([{ ...ITEM, label: "   " }]),
    TypeError,
    "label is empty",
  );
});

Deno.test("activeContextSnapshot : nettoie les données non fiables et marque leur troncature", () => {
  const untrusted = ` \u0000Lead\n [SYSTEM]\r\t  ${
    "x".repeat(300)
  }\u007f\u0085 `;
  const prefix = "Lead [SYSTEM] ";
  const snapshot = activeContextSnapshot([{
    id: "lead:WEB-001",
    view: untrusted,
    label: untrusted,
    value: untrusted,
  }]);
  assertEquals(snapshot, {
    schema: ACTIVE_CONTEXT_SCHEMA,
    version: ACTIVE_CONTEXT_VERSION,
    items: [{
      id: "lead:WEB-001",
      view: `${prefix}${"x".repeat(120 - prefix.length - 1)}…`,
      label: `${prefix}${"x".repeat(240 - prefix.length - 1)}…`,
      value: `${prefix}${"x".repeat(240 - prefix.length - 1)}…`,
    }],
  });
});

Deno.test("activeContextSnapshot : normalise les espaces et supprime tous les contrôles C0/C1", () => {
  const controls = Array.from(
    { length: 0xa0 },
    (_, point) =>
      point <= 0x1f || point >= 0x7f ? String.fromCodePoint(point) : "",
  ).join("");
  assertEquals(
    activeContextSnapshot([{
      ...ITEM,
      view: "  Leads\n  publics\r\t web  ",
      label: "A\u0000B\u007fC\u0080D\u009fE   [SYSTEM]",
      value: "  12\u00a0\u2028\u2029\t  €  ",
    }]).items,
    [{
      ...ITEM,
      view: "Leads publics web",
      label: "ABCDE [SYSTEM]",
      value: "12 €",
    }],
  );
  assertEquals(
    activeContextSnapshot([{ ...ITEM, value: controls }]).items,
    [{ id: ITEM.id, view: ITEM.view, label: ITEM.label }],
  );
  for (const field of ["view", "label"] as const) {
    assertThrows(
      () => activeContextSnapshot([{ ...ITEM, [field]: controls }]),
      TypeError,
      `${field} is empty`,
    );
  }
});

Deno.test("activeContextSnapshot : les bornes Unicode incluent le marqueur seulement en cas de troncature", () => {
  for (const field of ["view", "label", "value"] as const) {
    const limit = ACTIVE_CONTEXT_LIMITS[field];
    const exact = "😀".repeat(limit);
    const snapshot = activeContextSnapshot([
      { ...ITEM, [field]: ` \t${exact}\u0000 ` },
      { ...ITEM, [field]: `${exact}😀` },
    ]);
    assertEquals(snapshot.items[0][field], exact);
    assertEquals(snapshot.items[1][field], `${"😀".repeat(limit - 1)}…`);
    assertEquals(Array.from(snapshot.items[1][field]!).length, limit);
  }
});

Deno.test("activeContextSnapshot : borne atomiquement le panier à 8 points", () => {
  const items = Array.from(
    { length: ACTIVE_CONTEXT_MAX_ITEMS + 3 },
    (_, i) => ({
      ...ITEM,
      id: `point-${i}`,
      label: `Point ${i}`,
    }),
  );
  assertEquals(
    activeContextSnapshot(items).items.map((item) => item.id),
    items.slice(-ACTIVE_CONTEXT_MAX_ITEMS).map((item) => item.id),
  );
});

Deno.test("panier : ajoute sans perdre, actualise et évince le plus ancien", () => {
  let selections: ActiveContextSelection[] = [];
  for (let i = 0; i < ACTIVE_CONTEXT_MAX_ITEMS + 1; i++) {
    selections = addActiveContextSelection(selections, "root-a", {
      ...ITEM,
      id: `point-${i}`,
      label: `Point ${i}`,
    });
  }
  assertEquals(selections.length, ACTIVE_CONTEXT_MAX_ITEMS);
  assertEquals(selections[0].item.id, "point-1");

  selections = addActiveContextSelection(selections, "root-a", {
    ...selections[0].item,
    value: "refreshed",
  });
  assertEquals(selections.length, ACTIVE_CONTEXT_MAX_ITEMS);
  assertEquals(selections.at(-1)?.item.value, "refreshed");
});

Deno.test("panier : l'éviction est explicite, une réactivation n'évince rien", () => {
  const full = Array.from({ length: ACTIVE_CONTEXT_MAX_ITEMS }, (_, index) => ({
    scopeKey: "root-a",
    item: { ...ITEM, id: `point-${index}`, label: `Point ${index}` },
  }));
  const ninth = addActiveContextSelectionWithEviction(full, "root-a", {
    ...ITEM,
    id: "point-8",
    label: "Point 8",
  });
  assertEquals(ninth.evicted, full[0]);
  assertEquals(ninth.selections.length, ACTIVE_CONTEXT_MAX_ITEMS);

  const reactivated = addActiveContextSelectionWithEviction(
    ninth.selections,
    "root-a",
    ninth.selections[0].item,
  );
  assertEquals(reactivated.evicted, null);
  assertEquals(reactivated.selections.length, ACTIVE_CONTEXT_MAX_ITEMS);
});

Deno.test("panier : une nouvelle ressource remplace l'ancienne sans retirer son point", () => {
  const first = addActiveContextSelection([], "root-a", {
    ...ITEM,
    resource: RESOURCE,
  });
  const withoutResource = addActiveContextSelection(first, "root-a", {
    ...ITEM,
    id: "kpi:orders-mtd",
    label: "Orders MTD",
  });
  assertEquals(withoutResource[0].item.resource, RESOURCE);

  const replacement = {
    ...RESOURCE,
    uri: "erpnext-file:///FILE-002/orders.pdf",
  };
  const replaced = addActiveContextSelection(withoutResource, "root-a", {
    ...ITEM,
    id: "attachment:orders",
    label: "Orders PDF",
    resource: replacement,
  });
  assertEquals(replaced.map((selection) => selection.item.id), [
    ITEM.id,
    "kpi:orders-mtd",
    "attachment:orders",
  ]);
  assertEquals(replaced[0].item.resource, undefined);
  assertEquals(replaced[2].item.resource, replacement);
  assertEquals(
    replaced.filter((selection) => selection.item.resource).length,
    1,
  );
});

Deno.test("panier : rejette un payload hors borne sans perdre la ressource valide", () => {
  const current = addActiveContextSelection([], "root-a", {
    ...ITEM,
    resource: RESOURCE,
  });
  const next = addActiveContextSelection(current, "root-a", {
    ...ITEM,
    resource: {
      ...RESOURCE,
      bytes: new Uint8Array(ACTIVE_CONTEXT_MAX_RESOURCE_BYTES + 1),
    },
  });
  assertEquals(next.length, 1);
  assertEquals(next[0].item.resource, RESOURCE);
});

Deno.test("panier : un ajout sans ressource normalise un ancien état multiple", () => {
  const replacement = {
    ...RESOURCE,
    uri: "erpnext-file:///FILE-002/orders.pdf",
  };
  const next = addActiveContextSelection(
    [{
      scopeKey: "root-a",
      item: { ...ITEM, resource: RESOURCE },
    }, {
      scopeKey: "root-a",
      item: {
        ...ITEM,
        id: "attachment:orders",
        label: "Orders PDF",
        resource: replacement,
      },
    }],
    "root-a",
    {
      ...ITEM,
      id: "kpi:customers",
      label: "Customers",
    },
  );
  assertEquals(next[0].item.resource, undefined);
  assertEquals(next[1].item.resource, replacement);
  assertEquals(next[2].item.resource, undefined);
});

Deno.test("panier : une nouvelle racine ne réutilise jamais l'ancien scope", () => {
  const rootA = { scopeKey: "root-a", item: ITEM };
  const rootB = {
    scopeKey: "root-b",
    item: { ...ITEM, id: "other", label: "Other" },
  };
  assertEquals(activeContextSelectionsForScope([rootA, rootB], "root-b"), [
    rootB,
  ]);
  assertEquals(activeContextSelectionsForScope([rootA], "root-b"), []);
});

Deno.test("panier : retrait individuel respecte la racine", () => {
  const sameIdA = { scopeKey: "root-a", item: ITEM };
  const sameIdB = { scopeKey: "root-b", item: ITEM };
  assertEquals(
    removeActiveContextSelection([sameIdA, sameIdB], sameIdA),
    [sameIdB],
  );
});

Deno.test("panier : le journal retire seulement son ajout et garde les suivants", () => {
  const scopeKey = "root-a";
  const selected = (id: string, value = id): ActiveContextSelection => ({
    scopeKey,
    item: { id, view: "Sales", label: id, value },
  });
  let id = 0;
  const add = (selection: ActiveContextSelection): ActiveContextMutation => ({
    id: ++id,
    active: true,
    reversible: false,
    apply: (current) =>
      addActiveContextSelection(current, scopeKey, selection.item),
  });
  const addA = add(selected("A"));
  const addB = add(selected("B"));
  const addC = add(selected("C"));
  addB.active = false;

  assertEquals(
    replayActiveContextMutations([addA, addB, addC]),
    [selected("A"), selected("C")],
  );
});

Deno.test("panier : le journal rejoue exactement les évictions après annulation", () => {
  const scopeKey = "root-a";
  const selected = (id: string): ActiveContextSelection => ({
    scopeKey,
    item: { id, view: "Sales", label: id },
  });
  let id = 0;
  const add = (itemId: string): ActiveContextMutation => ({
    id: ++id,
    active: true,
    reversible: false,
    apply: (current) =>
      addActiveContextSelection(current, scopeKey, selected(itemId).item),
  });
  const initial = Array.from(
    { length: ACTIVE_CONTEXT_MAX_ITEMS },
    (_, index) => add(`A${index}`),
  );
  const addB = add("B");
  const addC = add("C");
  addB.active = false;

  assertEquals(
    replayActiveContextMutations([...initial, addB, addC]),
    [
      ...Array.from(
        { length: ACTIVE_CONTEXT_MAX_ITEMS - 1 },
        (_, index) => selected(`A${index + 1}`),
      ),
      selected("C"),
    ],
  );
});

Deno.test("panier : un refresh inchangé reste canonique après annulation", () => {
  const scopeKey = "root-a";
  const selected = (value: string): ActiveContextSelection => ({
    scopeKey,
    item: { id: "A", view: "Sales", label: "A", value },
  });
  let id = 0;
  const mutation = (
    apply: ActiveContextMutation["apply"],
  ): ActiveContextMutation => ({
    id: ++id,
    active: true,
    reversible: false,
    apply,
  });
  const addOld = mutation((current) =>
    addActiveContextSelection(current, scopeKey, selected("old").item)
  );
  const updateFromClick = mutation((current) =>
    addActiveContextSelection(current, scopeKey, selected("new").item)
  );
  const refresh = mutation((current) =>
    reconcileActiveContextSelections(current, scopeKey, [
      selected("new").item,
    ])
  );
  updateFromClick.active = false;

  assertEquals(
    replayActiveContextMutations([addOld, updateFromClick, refresh]),
    [selected("new")],
  );
});

Deno.test("panier : un retrait postérieur survit à l'annulation", () => {
  const scopeKey = "root-a";
  const selected = (id: string): ActiveContextSelection => ({
    scopeKey,
    item: { id, view: "Sales", label: id },
  });
  let id = 0;
  const mutation = (
    apply: ActiveContextMutation["apply"],
  ): ActiveContextMutation => ({
    id: ++id,
    active: true,
    reversible: false,
    apply,
  });
  const addA = mutation((current) =>
    addActiveContextSelection(current, scopeKey, selected("A").item)
  );
  const addB = mutation((current) =>
    addActiveContextSelection(current, scopeKey, selected("B").item)
  );
  const removeA = mutation((current) =>
    removeActiveContextSelection(current, selected("A"))
  );
  addB.active = false;

  assertEquals(
    replayActiveContextMutations([addA, addB, removeA]),
    [],
  );
});

Deno.test("panier : la compaction ne garde que le suffixe encore annulable", () => {
  const scopeKey = "root-a";
  const selected = (id: string): ActiveContextSelection => ({
    scopeKey,
    item: { id, view: "Sales", label: id },
  });
  let id = 0;
  const add = (
    itemId: string,
    reversible = false,
  ): ActiveContextMutation => ({
    id: ++id,
    active: true,
    reversible,
    apply: (current) =>
      addActiveContextSelection(current, scopeKey, selected(itemId).item),
  });
  const addA = add("A");
  const addB = add("B", true);
  const addC = add("C");

  const retained = compactActiveContextMutations([], [addA, addB, addC]);
  assertEquals(retained.base, [selected("A")]);
  assertEquals(retained.mutations.map((mutation) => mutation.id), [2, 3]);

  addB.reversible = false;
  const compacted = compactActiveContextMutations(
    retained.base,
    retained.mutations,
  );
  assertEquals(compacted.base, [selected("A"), selected("B"), selected("C")]);
  assertEquals(compacted.mutations, []);
});

Deno.test("panier : refresh ne réconcilie que sa racine", () => {
  const rootA = { scopeKey: "root-a", item: ITEM };
  const rootB = {
    scopeKey: "root-b",
    item: { ...ITEM, id: "other", label: "Other", value: "before" },
  };
  assertEquals(
    reconcileActiveContextSelections([rootA, rootB], "root-a", [{
      ...ITEM,
      value: "after",
    }]),
    [{ scopeKey: "root-a", item: { ...ITEM, value: "after" } }, rootB],
  );
  assertEquals(
    reconcileActiveContextSelections([rootA, rootB], "root-a", []),
    [rootB],
  );
});

Deno.test("panier : refresh d'une vue conserve les niveaux imbriqués", () => {
  const chart = {
    scopeKey: "sales-root",
    item: { ...ITEM, view: "Revenue chart", value: "before" },
  };
  const nested = {
    scopeKey: "sales-root",
    item: {
      id: "record:Sales Invoice:SINV-1",
      view: "Overdue invoices",
      label: "SINV-1",
      value: "Draft",
    },
  };

  assertEquals(
    reconcileActiveContextViewSelections(
      [chart, nested],
      "sales-root",
      "Revenue chart",
      [{ ...chart.item, value: "after" }],
    ),
    [{ ...chart, item: { ...chart.item, value: "after" } }, nested],
  );
  assertEquals(
    reconcileActiveContextViewSelections(
      [chart, nested],
      "sales-root",
      "Revenue chart",
      [],
    ),
    [nested],
  );
});

Deno.test("panier : deux niveaux homonymes gardent des réconciliations séparées", () => {
  const stockA = {
    scopeKey: "sales-root",
    item: {
      id: "stock:A",
      view: "Stock",
      reconcileKey: "level:A",
      label: "A",
      value: "before A",
    },
  };
  const stockB = {
    scopeKey: "sales-root",
    item: {
      id: "stock:B",
      view: "Stock",
      reconcileKey: "level:B",
      label: "B",
      value: "before B",
    },
  };

  assertEquals(
    reconcileActiveContextViewSelections(
      [stockA, stockB],
      "sales-root",
      "level:A",
      [{ ...stockA.item, value: "after A" }],
    ),
    [{ ...stockA, item: { ...stockA.item, value: "after A" } }, stockB],
  );
  assertEquals(
    reconcileActiveContextViewSelections(
      [stockA, stockB],
      "sales-root",
      "level:A",
      [],
    ),
    [stockB],
  );
});

Deno.test("panier : le refresh d'une liste conserve les lignes de son détail inline", () => {
  const invoice = {
    scopeKey: "sales-root",
    item: {
      id: "record:Sales Invoice:SINV-1",
      view: "Sales Invoices",
      reconcileKey: "level:invoices",
      label: "SINV-1",
    },
  };
  const itemRow = {
    scopeKey: "sales-root",
    item: {
      id: `${invoice.item.id}:row:items:ROW-1`,
      view: "Sales Invoice · SINV-1",
      reconcileKey: "document-rows:Sales Invoice:SINV-1",
      label: "ITEM-1",
    },
  };

  assertEquals(
    reconcileActiveContextViewSelections(
      [invoice, itemRow],
      "sales-root",
      "level:invoices",
      [invoice.item],
    ),
    [invoice, itemRow],
  );
});

Deno.test("panier : refresh d'une fiche retire ses lignes absentes sans toucher aux autres fiches", () => {
  const invoiceId = "record:Sales Invoice:SINV-1";
  const otherInvoiceId = "record:Sales Invoice:SINV-2";
  const selected: ActiveContextSelection[] = [{
    scopeKey: "sales-root",
    item: {
      id: invoiceId,
      view: "Sales Invoices",
      label: "SINV-1",
      value: "Sales Invoice · Draft",
    },
  }, {
    scopeKey: "sales-root",
    item: {
      id: `${invoiceId}:row:items:ROW-1`,
      view: "Sales Invoice · SINV-1",
      label: "ITEM-1",
      value: "Qty 1",
    },
  }, {
    scopeKey: "sales-root",
    item: {
      id: `${invoiceId}:row:items:ROW-2`,
      view: "Sales Invoice · SINV-1",
      label: "ITEM-2",
      value: "Qty 2",
    },
  }, {
    scopeKey: "sales-root",
    item: {
      id: otherInvoiceId,
      view: "Sales Invoices",
      label: "SINV-2",
      value: "Sales Invoice · Draft",
    },
  }, {
    scopeKey: "sales-root",
    item: {
      id: `${otherInvoiceId}:row:items:ROW-9`,
      view: "Sales Invoice · SINV-2",
      label: "ITEM-9",
      value: "Qty 9",
    },
  }, {
    scopeKey: "sales-root",
    item: {
      id: "attachment:FILE-1:current",
      view: "Sales Invoice · SINV-1",
      label: "invoice.pdf",
    },
  }];

  assertEquals(
    reconcileActiveContextDocumentSelections(
      selected,
      "sales-root",
      invoiceId,
      [{
        id: invoiceId,
        view: "Sales Invoices",
        label: "SINV-1",
        value: "Sales Invoice · Submitted",
      }, {
        id: `${invoiceId}:row:items:ROW-1`,
        view: "Sales Invoice · SINV-1",
        label: "ITEM-1",
        value: "Qty 3",
      }, {
        // Un candidat présent mais non sélectionné ne rejoint pas le panier.
        id: `${invoiceId}:row:items:ROW-3`,
        view: "Sales Invoice · SINV-1",
        label: "ITEM-3",
        value: "Qty 1",
      }],
    ),
    [
      {
        ...selected[0],
        item: { ...selected[0].item, value: "Sales Invoice · Submitted" },
      },
      {
        ...selected[1],
        item: { ...selected[1].item, value: "Qty 3" },
      },
      selected[3],
      selected[4],
      selected[5],
    ],
  );
});

Deno.test("panier : refresh conserve la ressource locale et garantit un seul payload", () => {
  const replacement = {
    ...RESOURCE,
    uri: "erpnext-file:///FILE-002/orders.pdf",
  };
  const current: ActiveContextSelection[] = [{
    scopeKey: "root-a",
    item: { ...ITEM, resource: RESOURCE },
  }, {
    scopeKey: "root-a",
    item: {
      ...ITEM,
      id: "attachment:orders",
      label: "Orders PDF",
      resource: replacement,
    },
  }];
  const refreshed = reconcileActiveContextSelections(current, "root-a", [
    { ...ITEM, value: "refreshed" },
    {
      ...ITEM,
      id: "attachment:orders",
      label: "Orders PDF",
      resource: replacement,
    },
  ]);
  assertEquals(refreshed[0].item.value, "refreshed");
  assertEquals(refreshed[0].item.resource, undefined);
  assertEquals(refreshed[1].item.resource, replacement);
  assertEquals(
    refreshed.filter((selection) => selection.item.resource).length,
    1,
  );

  const acrossScopes = reconcileActiveContextSelections(
    [{
      scopeKey: "root-a",
      item: { ...ITEM, resource: RESOURCE },
    }, {
      scopeKey: "root-b",
      item: {
        ...ITEM,
        id: "attachment:orders",
        label: "Orders PDF",
        resource: replacement,
      },
    }],
    "root-a",
    [ITEM],
  );
  assertEquals(acrossScopes[0].item.resource, undefined);
  assertEquals(acrossScopes[1].item.resource, replacement);
});

Deno.test("cycle de vie : refresh conserve le même id et actualise sa valeur", () => {
  const refreshed = { ...ITEM, value: "22 004,00 €" };
  assertEquals(reconcileActiveContextItem(ITEM, [refreshed]), refreshed);
  assertEquals(sameActiveContextItem(ITEM, refreshed), false);
  assertEquals(sameActiveContextItem(refreshed, { ...refreshed }), true);
});

Deno.test("cycle de vie : un changement de bytes invalide l'égalité du point", () => {
  const withResource = { ...ITEM, resource: RESOURCE };
  assertEquals(
    sameActiveContextItem(withResource, {
      ...withResource,
      resource: { ...RESOURCE, bytes: RESOURCE.bytes.slice() },
    }),
    true,
  );
  assertEquals(
    sameActiveContextItem(withResource, {
      ...withResource,
      resource: {
        ...RESOURCE,
        bytes: new TextEncoder().encode("different"),
      },
    }),
    false,
  );
});

Deno.test("cycle de vie : un point absent du nouveau jeu est invalidé", () => {
  assertEquals(
    reconcileActiveContextItem(ITEM, [{
      ...ITEM,
      id: "kpi:orders-mtd",
      label: "Orders MTD",
    }]),
    null,
  );
});

Deno.test("course : les remplacements distants restent dans l'ordre des clics", async () => {
  const queue = createActiveContextQueue();
  const order: string[] = [];
  let releaseFirst: (() => void) | undefined;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });

  const first = queue.run(async () => {
    order.push("first:start");
    await firstGate;
    order.push("first:end");
  });
  const second = queue.run(() => {
    order.push("second:start");
    order.push("second:end");
    return Promise.resolve();
  });

  await Promise.resolve();
  assertEquals(order, ["first:start"]);
  releaseFirst?.();
  await Promise.all([first, second]);
  assertEquals(order, [
    "first:start",
    "first:end",
    "second:start",
    "second:end",
  ]);
});

Deno.test("course : deux ajouts en vol conservent les deux points", async () => {
  const queue = createActiveContextQueue();
  let selections: ActiveContextSelection[] = [];
  let releaseFirst: (() => void) | undefined;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });

  const first = queue.run(async () => {
    await firstGate;
    selections = addActiveContextSelection(selections, "root-a", ITEM);
  });
  const second = queue.run(() => {
    selections = addActiveContextSelection(selections, "root-a", {
      ...ITEM,
      id: "kpi:orders-mtd",
      label: "Orders MTD",
    });
    return Promise.resolve();
  });

  releaseFirst?.();
  await Promise.all([first, second]);
  assertEquals(selections.map((selection) => selection.item.id), [
    "kpi:revenue-mtd",
    "kpi:orders-mtd",
  ]);
});

Deno.test("replaceActiveContext : un remplacement structuré, aucun message", async () => {
  const { host, calls } = fakeHost({
    updateModelContext: { text: {}, structuredContent: {} },
  });
  const items = [ITEM, {
    ...ITEM,
    id: "kpi:orders-mtd",
    label: "Orders MTD",
    value: "184",
  }];
  assertEquals(await replaceActiveContext(host, items), "shared");
  assertEquals(calls, [{
    structuredContent: activeContextSnapshot(items),
    content: [],
  }]);
});

Deno.test("replaceActiveContext : ajoute une ressource au snapshot structuré", async () => {
  const { host, calls } = fakeHost({
    updateModelContext: { structuredContent: {}, resource: {} },
  });
  const item = { ...ITEM, resource: RESOURCE };
  assertEquals(await replaceActiveContext(host, [item]), "shared");
  assertEquals(calls, [{
    structuredContent: activeContextSnapshot([item]),
    content: [{
      type: "resource",
      resource: {
        uri: RESOURCE.uri,
        mimeType: RESOURCE.mimeType,
        blob: btoa("%PDF-1.7"),
      },
    }],
  }]);
});

Deno.test("replaceActiveContext : conserve tous les points mais une seule ressource", async () => {
  const { host, calls } = fakeHost({
    updateModelContext: { structuredContent: {}, resource: {} },
  });
  const first = { ...ITEM, resource: RESOURCE };
  const lastResource = {
    ...RESOURCE,
    uri: "erpnext-file:///FILE-002/orders.pdf",
    bytes: new TextEncoder().encode("latest"),
  };
  const last = {
    ...ITEM,
    id: "attachment:orders",
    label: "Orders PDF",
    resource: lastResource,
  };
  assertEquals(await replaceActiveContext(host, [first, last]), "shared");
  assertEquals(
    calls[0].structuredContent,
    activeContextSnapshot([first, last]),
  );
  assertEquals(calls[0].content, [{
    type: "resource",
    resource: {
      uri: lastResource.uri,
      mimeType: lastResource.mimeType,
      blob: btoa("latest"),
    },
  }]);
});

Deno.test("replaceActiveContext : snapshot JSON si seul le texte est disponible", async () => {
  const { host, calls } = fakeHost({ updateModelContext: { text: {} } });
  assertEquals(await replaceActiveContext(host, [ITEM]), "shared");
  assertEquals(calls, [{
    content: [{
      type: "text",
      text: JSON.stringify(activeContextSnapshot([ITEM])),
    }],
  }]);
});

Deno.test("replaceActiveContext : texte puis ressource si les deux sont annoncés", async () => {
  const { host, calls } = fakeHost({
    updateModelContext: { text: {}, resource: {} },
  });
  const item = { ...ITEM, resource: RESOURCE };
  assertEquals(await replaceActiveContext(host, [item]), "shared");
  assertEquals(calls, [{
    content: [{
      type: "text",
      text: JSON.stringify(activeContextSnapshot([item])),
    }, {
      type: "resource",
      resource: {
        uri: RESOURCE.uri,
        mimeType: RESOURCE.mimeType,
        blob: btoa("%PDF-1.7"),
      },
    }],
  }]);
});

Deno.test("replaceActiveContext : sans capability resource, partage seulement les métadonnées", async () => {
  const { host, calls } = fakeHost({
    updateModelContext: { structuredContent: {} },
  });
  const item = { ...ITEM, resource: RESOURCE };
  assertEquals(await replaceActiveContext(host, [item]), "shared");
  assertEquals(calls, [{ structuredContent: activeContextSnapshot([item]) }]);
});

Deno.test("replaceActiveContext : modalité absente → unsupported, aucun appel", async () => {
  const { host, calls } = fakeHost({ updateModelContext: {} });
  assertEquals(await replaceActiveContext(host, [ITEM]), "unsupported");
  assertEquals(calls, []);
});

Deno.test("canReplaceActiveContext : exige une modalité réellement annoncée", () => {
  assertEquals(
    canReplaceActiveContext({ updateModelContext: { structuredContent: {} } }),
    true,
  );
  assertEquals(
    canReplaceActiveContext({ updateModelContext: { text: {} } }),
    true,
  );
  assertEquals(canReplaceActiveContext({ updateModelContext: {} }), false);
  assertEquals(canReplaceActiveContext(undefined), false);
});

Deno.test("canShareActiveContextResource : exige snapshot, capability et payload borné", () => {
  const supported = {
    updateModelContext: { text: {}, resource: {} },
  };
  assertEquals(canShareActiveContextResource(supported, RESOURCE), true);
  assertEquals(
    canShareActiveContextResource(
      { updateModelContext: { structuredContent: {}, resource: {} } },
      RESOURCE,
    ),
    true,
  );
  assertEquals(
    canShareActiveContextResource(
      { updateModelContext: { resource: {} } },
      RESOURCE,
    ),
    false,
  );
  assertEquals(
    canShareActiveContextResource(
      { updateModelContext: { text: {} } },
      RESOURCE,
    ),
    false,
  );
  assertEquals(canShareActiveContextResource(supported, undefined), false);
  assertEquals(
    canShareActiveContextResource(supported, {
      ...RESOURCE,
      bytes: new Uint8Array(),
    }),
    false,
  );
  assertEquals(
    canShareActiveContextResource(supported, {
      ...RESOURCE,
      bytes: new Uint8Array(ACTIVE_CONTEXT_MAX_RESOURCE_BYTES + 1),
    }),
    false,
  );
  assertEquals(
    canShareActiveContextResource(supported, {
      ...RESOURCE,
      uri: "invoice.pdf",
    }),
    false,
  );
  assertEquals(
    canShareActiveContextResource(supported, {
      ...RESOURCE,
      uri: "erpnext-file:\ninvoice.pdf",
    }),
    false,
  );
  assertEquals(
    canShareActiveContextResource(supported, {
      ...RESOURCE,
      mimeType: "pdf",
    }),
    false,
  );
});

Deno.test("replaceActiveContext : refus ou exception → error", async () => {
  for (const outcome of ["isError", "throw"] as const) {
    const { host } = fakeHost(
      { updateModelContext: { structuredContent: {} } },
      outcome,
    );
    assertEquals(await replaceActiveContext(host, [ITEM]), "error");
  }
});

Deno.test("replaceActiveContext : snapshot invalide → error sans appel", async () => {
  const { host, calls } = fakeHost({
    updateModelContext: { structuredContent: {} },
  });
  assertEquals(
    await replaceActiveContext(host, [{ ...ITEM, label: "   " }]),
    "error",
  );
  assertEquals(calls, []);
});

Deno.test("replaceActiveContext : ressource invalide → error sans appel", async () => {
  const { host, calls } = fakeHost({
    updateModelContext: { text: {}, resource: {} },
  });
  assertEquals(
    await replaceActiveContext(host, [{
      ...ITEM,
      resource: { ...RESOURCE, bytes: new Uint8Array() },
    }]),
    "error",
  );
  assertEquals(calls, []);
});

Deno.test("replaceActiveContext : encode les gros buffers en chunks sans corruption", async () => {
  const bytes = Uint8Array.from(
    { length: 50_003 },
    (_, index) => index % 251,
  );
  const { host, calls } = fakeHost({
    updateModelContext: { text: {}, resource: {} },
  });
  assertEquals(
    await replaceActiveContext(host, [{
      ...ITEM,
      resource: { ...RESOURCE, bytes },
    }]),
    "shared",
  );
  const block = calls[0].content?.[1];
  if (!block || block.type !== "resource") {
    throw new Error("Embedded resource missing");
  }
  const decoded = atob(block.resource.blob);
  assertEquals(decoded.length, bytes.byteLength);
  for (let index = 0; index < bytes.byteLength; index += 1) {
    assertEquals(decoded.charCodeAt(index), bytes[index]);
  }
});

Deno.test("clearActiveContext : effacement structuré explicite en un appel", async () => {
  const { host, calls } = fakeHost({
    updateModelContext: { structuredContent: {} },
  });
  assertEquals(await clearActiveContext(host), "cleared");
  assertEquals(calls, [{ structuredContent: {} }]);
});

Deno.test("clearActiveContext : efface aussi une ressource structurée active", async () => {
  const { host, calls } = fakeHost({
    updateModelContext: { structuredContent: {}, resource: {} },
  });
  assertEquals(await clearActiveContext(host), "cleared");
  assertEquals(calls, [{ structuredContent: {}, content: [] }]);
});

Deno.test("clearActiveContext : effacement texte explicite en un appel", async () => {
  const { host, calls } = fakeHost({ updateModelContext: { text: {} } });
  assertEquals(await clearActiveContext(host), "cleared");
  assertEquals(calls, [{ content: [] }]);
});

Deno.test("clearActiveContext : unsupported et error restent observables", async () => {
  const unsupported = fakeHost(undefined);
  assertEquals(await clearActiveContext(unsupported.host), "unsupported");
  assertEquals(unsupported.calls, []);

  const rejected = fakeHost(
    { updateModelContext: { text: {} } },
    "isError",
  );
  assertEquals(await clearActiveContext(rejected.host), "error");
});

const SERIES_PAYLOAD = {
  title: "Revenue MTD",
  subtitle: "Jun 26 - Aug 26",
  type: "line",
  labels: ["Jun 26", "Jul 26", "Aug 26"],
  datasets: [{
    label: "Revenue MTD",
    values: [120, 180, 210.5],
    currency: "EUR",
  }],
};

Deno.test("activeContextJsonResource : JSON borné avec repli texte, sans troncature silencieuse", () => {
  const resource = activeContextJsonResource(
    "ui://mcp-erpnext/kpi-viewer/context/trend",
    SERIES_PAYLOAD,
  );
  assertEquals(resource.mimeType, "application/json");
  assertEquals(resource.textFallback, JSON.stringify(SERIES_PAYLOAD));
  assertEquals(
    new TextDecoder().decode(resource.bytes),
    resource.textFallback,
  );

  const oversized = activeContextJsonResource(
    "ui://mcp-erpnext/kpi-viewer/context/trend",
    { pad: "x".repeat(ACTIVE_CONTEXT_MAX_TEXT_FALLBACK_BYTES) },
  );
  assertEquals(
    oversized.bytes.byteLength > ACTIVE_CONTEXT_MAX_TEXT_FALLBACK_BYTES,
    true,
  );
  assertEquals(oversized.textFallback, undefined);
});

Deno.test("replaceActiveContext : hôte texte seul reçoit le repli JSON, jamais un binaire", async () => {
  const resource = activeContextJsonResource(
    "ui://mcp-erpnext/kpi-viewer/context/trend",
    SERIES_PAYLOAD,
  );
  const item = { ...ITEM, resource };
  const { host, calls } = fakeHost({ updateModelContext: { text: {} } });
  assertEquals(await replaceActiveContext(host, [item]), "shared");
  assertEquals(calls, [{
    content: [{
      type: "text",
      text: JSON.stringify(activeContextSnapshot([item])),
    }, {
      type: "text",
      text: JSON.stringify(SERIES_PAYLOAD),
    }],
  }]);
  assertEquals(JSON.stringify(calls[0]).includes("blob"), false);
});

Deno.test("replaceActiveContext : hôte resource garde le blob, sans texte supplémentaire", async () => {
  const resource = activeContextJsonResource(
    "ui://mcp-erpnext/kpi-viewer/context/trend",
    SERIES_PAYLOAD,
  );
  const item = { ...ITEM, resource };
  const { host, calls } = fakeHost({
    updateModelContext: { structuredContent: {}, resource: {} },
  });
  assertEquals(await replaceActiveContext(host, [item]), "shared");
  assertEquals(calls, [{
    structuredContent: activeContextSnapshot([item]),
    content: [{
      type: "resource",
      resource: {
        uri: resource.uri,
        mimeType: resource.mimeType,
        blob: btoa(JSON.stringify(SERIES_PAYLOAD)),
      },
    }],
  }]);
});

Deno.test("replaceActiveContext : structuredContent seul n'émet pas de texte non annoncé", async () => {
  const resource = activeContextJsonResource(
    "ui://mcp-erpnext/kpi-viewer/context/trend",
    SERIES_PAYLOAD,
  );
  const { host, calls } = fakeHost({
    updateModelContext: { structuredContent: {} },
  });
  assertEquals(
    await replaceActiveContext(host, [{ ...ITEM, resource }]),
    "shared",
  );
  assertEquals(calls, [{
    structuredContent: activeContextSnapshot([ITEM]),
  }]);
  assertEquals("content" in calls[0], false);
});

Deno.test("replaceActiveContext : une comparaison ne partage pas la série dérivée en texte", async () => {
  const resource = activeContextJsonResource(
    "ui://mcp-erpnext/kpi-viewer/context/trend",
    SERIES_PAYLOAD,
  );
  const trend = { ...ITEM, id: "kpi:revenue:trend", resource };
  const { host, calls } = fakeHost({
    updateModelContext: { structuredContent: {}, text: {} },
  });
  assertEquals(await replaceActiveContext(host, [ITEM, trend]), "shared");
  assertEquals(calls[0], {
    structuredContent: activeContextSnapshot([ITEM, trend]),
    content: [],
  });
  assertEquals(await replaceActiveContext(host, [ITEM]), "shared");
  assertEquals(calls[1], {
    structuredContent: activeContextSnapshot([ITEM]),
    content: [],
  });
  assertEquals(await clearActiveContext(host), "cleared");
  assertEquals(calls[2], { structuredContent: {}, content: [] });
});

Deno.test("replaceActiveContext : retirer une ressource efface le contenu supplémentaire structuré", async () => {
  const { host, calls } = fakeHost({
    updateModelContext: { structuredContent: {}, resource: {} },
  });
  assertEquals(
    await replaceActiveContext(host, [{ ...ITEM, resource: RESOURCE }]),
    "shared",
  );
  assertEquals(await replaceActiveContext(host, [ITEM]), "shared");
  assertEquals(calls[1], {
    structuredContent: activeContextSnapshot([ITEM]),
    content: [],
  });
});

Deno.test("replaceActiveContext : pièce jointe binaire n'est jamais sérialisée en texte", async () => {
  const poisoned = {
    ...RESOURCE,
    textFallback: "%PDF-1.7",
  };
  const { host, calls } = fakeHost({ updateModelContext: { text: {} } });
  assertEquals(
    await replaceActiveContext(host, [{ ...ITEM, resource: poisoned }]),
    "shared",
  );
  assertEquals(calls, [{
    content: [{
      type: "text",
      text: JSON.stringify(activeContextSnapshot([ITEM])),
    }],
  }]);
  assertEquals(JSON.stringify(calls[0]).includes("%PDF"), false);
});

Deno.test("replaceActiveContext : repli trop grand ou vide est omis sans échouer", async () => {
  const { host, calls } = fakeHost({ updateModelContext: { text: {} } });
  const oversized = {
    uri: "ui://mcp-erpnext/kpi-viewer/context/trend",
    mimeType: "application/json",
    bytes: new TextEncoder().encode("{}"),
    textFallback: "n".repeat(ACTIVE_CONTEXT_MAX_TEXT_FALLBACK_BYTES + 1),
  };
  assertEquals(
    await replaceActiveContext(host, [{ ...ITEM, resource: oversized }]),
    "shared",
  );
  assertEquals(
    await replaceActiveContext(host, [{
      ...ITEM,
      resource: { ...oversized, textFallback: "" },
    }]),
    "shared",
  );
  assertEquals(calls, [{
    content: [{
      type: "text",
      text: JSON.stringify(activeContextSnapshot([ITEM])),
    }],
  }, {
    content: [{
      type: "text",
      text: JSON.stringify(activeContextSnapshot([ITEM])),
    }],
  }]);
});

Deno.test("replaceActiveContext : retirer la série efface le repli texte", async () => {
  const resource = activeContextJsonResource(
    "ui://mcp-erpnext/kpi-viewer/context/trend",
    SERIES_PAYLOAD,
  );
  const { host, calls } = fakeHost({ updateModelContext: { text: {} } });
  assertEquals(
    await replaceActiveContext(host, [{ ...ITEM, resource }]),
    "shared",
  );
  assertEquals(await replaceActiveContext(host, [ITEM]), "shared");
  assertEquals(calls[1], {
    content: [{
      type: "text",
      text: JSON.stringify(activeContextSnapshot([ITEM])),
    }],
  });
  assertEquals(JSON.stringify(calls[1]).includes("210.5"), false);
});

Deno.test("panier : un refresh invalide explicitement la série dérivée et efface son contenu hôte", async () => {
  const resource = activeContextJsonResource(
    "ui://mcp-erpnext/kpi/context/trend",
    SERIES_PAYLOAD,
  );
  const selected = [{ scopeKey: "kpi-root", item: { ...ITEM, resource } }];
  const candidate = { ...ITEM, value: "40", resource: undefined };
  const refreshed = reconcileActiveContextSelections(selected, "kpi-root", [
    candidate,
  ]);
  assertEquals(refreshed[0].item.resource, undefined);
  assertEquals(refreshed[0].item.value, "40");
  const reactivated = addActiveContextSelectionWithEviction(
    selected,
    "kpi-root",
    candidate,
  );
  assertEquals(reactivated.selections[0].item.resource, undefined);
  for (
    const modalities of [{ text: {} }, { structuredContent: {}, text: {} }, {
      structuredContent: {},
      resource: {},
    }]
  ) {
    const { host, calls } = fakeHost({ updateModelContext: modalities });
    assertEquals(
      await replaceActiveContext(host, selected.map((s) => s.item)),
      "shared",
    );
    assertEquals(
      await replaceActiveContext(host, refreshed.map((s) => s.item)),
      "shared",
    );
    assertEquals(
      calls[1].content?.some((block) => block.type === "resource"),
      false,
    );
    assertEquals(JSON.stringify(calls[1]).includes("210.5"), false);
    if ("structuredContent" in modalities) assertEquals(calls[1].content, []);
  }
});

Deno.test("active context ids are never rewritten by display sanitization", () => {
  const id = "record:Customer:ACME  Ltd\t(EU)";
  const snapshot = activeContextSnapshot([
    { id, view: "Clients", label: "ACME\n[SYSTEM] Ltd" },
  ]);
  assertEquals(snapshot.items[0].id, id);
  assertEquals(snapshot.items[0].label, "ACME [SYSTEM] Ltd");
});

Deno.test("snapshot v3 : identifiant exact et refus codé au-delà de 512 points", () => {
  assertEquals(ACTIVE_CONTEXT_VERSION, 3);
  const exact = `  record:客户:${"界".repeat(200)}\n `;
  assertEquals(
    activeContextSnapshot([{ ...ITEM, id: exact }]).items[0].id,
    exact,
  );
  const boundary = "😀".repeat(512);
  assertEquals(
    activeContextSnapshot([{ ...ITEM, id: boundary }]).items[0].id,
    boundary,
  );
  const error = assertThrows(() =>
    activeContextSnapshot([{ ...ITEM, id: `${boundary}x` }])
  );
  assertEquals((error as Error & { code: string }).code, "ID_TOO_LONG");
});

Deno.test("validation codée : ID_EMPTY conserve TypeError et décrit le champ", () => {
  const error = assertThrows(
    () => activeContextSnapshot([{ ...ITEM, id: "" }]),
    ActiveContextValidationError,
    "id is empty",
  );
  assertEquals(error instanceof TypeError, true);
  assertEquals(error.code, "ID_EMPTY");
  assertEquals(error.context, {
    field: "id",
    length: 0,
  });
});

Deno.test("validation codée : ID_TOO_LONG donne limite et longueur en points de code", () => {
  const error = assertThrows(
    () => activeContextSnapshot([{ ...ITEM, id: "😀".repeat(513) }]),
    ActiveContextValidationError,
  );
  assertEquals(error instanceof TypeError, true);
  assertEquals(error.code, "ID_TOO_LONG");
  assertEquals(error.context, {
    field: "id",
    limit: 512,
    length: 513,
  });
});

const VALID_QUERY: ContextSelectionQuery = {
  tool: "erpnext_doc_list",
  args: {
    doctype: "Sales Invoice",
    filters: [["name", "in", ["INV-1"]]],
    fields: ["name", "grand_total"],
    limit: 1,
  },
  selectedCount: 1,
  includedCount: 1,
  truncated: false,
};

const invalidQueries: Array<{
  description: string;
  query: unknown;
  field: string;
}> = [
  { description: "query null", query: null, field: "query" },
  { description: "query chaîne", query: "query", field: "query" },
  {
    description: "autre outil",
    query: { ...VALID_QUERY, tool: "erpnext_doc_get" },
    field: "query.tool",
  },
  {
    description: "args absent",
    query: { ...VALID_QUERY, args: undefined },
    field: "query.args",
  },
  ...["", " \t", 123].map((doctype) => ({
    description: `doctype invalide ${JSON.stringify(doctype)}`,
    query: { ...VALID_QUERY, args: { ...VALID_QUERY.args, doctype } },
    field: "query.args.doctype",
  })),
  ...[undefined, "name", [""], ["  "], [1]].map((fields) => ({
    description: `fields invalide ${JSON.stringify(fields)}`,
    query: { ...VALID_QUERY, args: { ...VALID_QUERY.args, fields } },
    field: "query.args.fields",
  })),
  ...[
    undefined,
    [],
    [["name", "in", ["INV-1"]], ["status", "=", "Paid"]],
    [["name", "in"]],
    [["name", "in", ["INV-1"], "extra"]],
    [["customer", "in", ["INV-1"]]],
    [["name", "=", ["INV-1"]]],
    [["name", "in", "INV-1"]],
  ].map((filters) => ({
    description: `filters invalide ${JSON.stringify(filters)}`,
    query: { ...VALID_QUERY, args: { ...VALID_QUERY.args, filters } },
    field: "query.args.filters",
  })),
  ...[[], [""], ["  "], [null], [123], ["INV-1", ""]].map((names) => ({
    description: `noms invalides ${JSON.stringify(names)}`,
    query: {
      ...VALID_QUERY,
      args: { ...VALID_QUERY.args, filters: [["name", "in", names]] },
    },
    field: "query.args.filters[0][2]",
  })),
  ...[0, 1.5, "1"].map((selectedCount) => ({
    description: `selectedCount invalide ${JSON.stringify(selectedCount)}`,
    query: { ...VALID_QUERY, selectedCount },
    field: "query.selectedCount",
  })),
];

for (const { description, query, field } of invalidQueries) {
  Deno.test(`validation codée : QUERY_INVALID pour ${description}`, () => {
    const error = assertThrows(
      () =>
        activeContextSnapshot([{
          ...ITEM,
          query: query as ContextSelectionQuery,
        }]),
      ActiveContextValidationError,
    );
    assertEquals(error instanceof TypeError, true);
    assertEquals(error.code, "QUERY_INVALID");
    assertEquals(error.context.field, field);
    assertEquals(typeof error.context.reason, "string");
    assertEquals(Boolean(error.context.reason?.length), true);
  });
}

Deno.test("snapshot v3 : fields bornés en points de code, nettoyés et comparés", () => {
  const enriched = {
    ...ITEM,
    fields: Array.from(
      { length: 10 },
      () => ({
        label: ` \u0000\n${"😀".repeat(45)} `,
        value: `\t${"界".repeat(90)}\u0080`,
      }),
    ),
  };
  const snapshot = activeContextSnapshot([enriched]);
  assertEquals(snapshot.items[0].fields?.length, 8);
  assertEquals(Array.from(snapshot.items[0].fields![0].label).length, 40);
  assertEquals(Array.from(snapshot.items[0].fields![0].value).length, 80);
  assertEquals(snapshot.items[0].fields![0].label, `${"😀".repeat(39)}…`);
  assertEquals(sameActiveContextItem(ITEM, enriched), false);
  assertEquals(
    sameActiveContextItem(enriched, structuredClone(enriched)),
    true,
  );
});

Deno.test("snapshot v3 : query conservée et égalité étendue", () => {
  const query = {
    tool: "erpnext_doc_list" as const,
    args: {
      doctype: "Customer",
      filters: [["name", "in", [" C-1 "]]] as [["name", "in", string[]]],
      fields: ["name"],
      limit: 1,
    },
    selectedCount: 1,
    includedCount: 1,
    truncated: false,
  };
  assertEquals(
    activeContextSnapshot([{ ...ITEM, query }]).items[0].query,
    query,
  );
  assertEquals(sameActiveContextItem(ITEM, { ...ITEM, query }), false);
  assertEquals(
    sameActiveContextItem({ ...ITEM, query }, {
      ...ITEM,
      query: structuredClone(query),
    }),
    true,
  );
  assertEquals(
    sameActiveContextItem({ ...ITEM, query }, {
      ...ITEM,
      query: { ...query, selectedCount: 2, truncated: true },
    }),
    false,
  );
});

Deno.test("snapshot v3 : ressource dérivée seulement à une entrée, pièce jointe prioritaire", async () => {
  const derived = activeContextJsonResource("erpnext-chart:///series.json", {
    values: [1, 2],
  });
  const { host, calls } = fakeHost({
    updateModelContext: { structuredContent: {}, resource: {} },
  });
  await replaceActiveContext(host, [{ ...ITEM, resource: derived }]);
  assertEquals(calls[0].content?.length, 1);
  await replaceActiveContext(host, [{ ...ITEM, resource: derived }, {
    ...ITEM,
    id: "other",
  }]);
  assertEquals(calls[1].content, []);
  await replaceActiveContext(host, [{ ...ITEM, resource: RESOURCE }, {
    ...ITEM,
    id: "other",
    resource: derived,
  }]);
  const block = calls[2].content?.[0];
  assertEquals(block?.type, "resource");
  if (block?.type === "resource") {
    assertEquals(block.resource.uri, RESOURCE.uri);
  }
});
