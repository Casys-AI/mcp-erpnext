/** Tests du snapshot et de son remplacement atomique dans le contexte hôte. */

import { assertEquals, assertThrows } from "@std/assert";
import {
  ACTIVE_CONTEXT_LIMITS,
  ACTIVE_CONTEXT_MAX_ITEMS,
  ACTIVE_CONTEXT_MAX_RESOURCE_BYTES,
  ACTIVE_CONTEXT_SCHEMA,
  ACTIVE_CONTEXT_VERSION,
  type ActiveContextHost,
  type ActiveContextHostCapabilities,
  type ActiveContextLocalResource,
  type ActiveContextMutation,
  type ActiveContextSelection,
  activeContextSelectionsForScope,
  activeContextSnapshot,
  addActiveContextSelection,
  addActiveContextSelectionWithEviction,
  canReplaceActiveContext,
  canShareActiveContextResource,
  clearActiveContext,
  compactActiveContextMutations,
  type ContextSelectionItem,
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
    id: `  ${"i".repeat(ACTIVE_CONTEXT_LIMITS.id + 5)}  `,
    view: ` ${"v".repeat(ACTIVE_CONTEXT_LIMITS.view + 5)} `,
    label: ` ${"l".repeat(ACTIVE_CONTEXT_LIMITS.label + 5)} `,
    value: "   ",
  }]);
  assertEquals(snapshot.items[0].id.length, ACTIVE_CONTEXT_LIMITS.id);
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
  assertEquals(calls, [{ structuredContent: activeContextSnapshot(items) }]);
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
