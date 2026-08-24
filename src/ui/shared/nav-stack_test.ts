import { assertEquals } from "@std/assert";
import {
  clearStale,
  createStack,
  crumbs,
  currentLevel,
  findLevelByKey,
  levelKey,
  markStale,
  navRootIdentity,
  patchLevel,
  patchLevelUi,
  popLevel,
  popToLevel,
  pushLevel,
  reconcileRoot,
  viewerRootKey,
} from "./nav-stack.ts";

const root = () => createStack({ title: "Customer", kind: "root" });
const list = (title: string) => ({
  title,
  kind: "list" as const,
  tool: { name: "erpnext_doc_list", args: { doctype: title } },
  loading: true,
});

Deno.test("nav-stack : la racine seule n'a pas de barre", () => {
  const c = crumbs(root());
  assertEquals(c.depth, 1);
  assertEquals(c.showBar, false);
  assertEquals(c.parents, []);
  assertEquals(c.current.level.title, "Customer");
});

Deno.test("nav-stack : deux et trois niveaux montrent tous les parents", () => {
  const two = pushLevel(root(), list("CUST-42"));
  assertEquals(crumbs(two).parents.map((c) => c.level.title), ["Customer"]);
  const three = pushLevel(two, list("Sales Order"));
  assertEquals(crumbs(three).parents.map((c) => c.level.title), [
    "Customer",
    "CUST-42",
  ]);
  assertEquals(crumbs(three).elided, []);
});

Deno.test("nav-stack : dès quatre niveaux, les intermédiaires s'élident derrière …N — pas l'origine", () => {
  let s = root();
  for (const t of ["CUST-42", "Sales Order", "SO-1043", "Factures"]) {
    s = pushLevel(s, list(t));
  }
  const c = crumbs(s);
  assertEquals(c.depth, 5);
  assertEquals(c.elided.map((x) => x.level.title), ["CUST-42", "Sales Order"]);
  assertEquals(c.parents.map((x) => x.level.title), ["Customer", "SO-1043"]);
  assertEquals(
    c.trail.map((part) =>
      "elided" in part ? `…${part.elided.length}` : part.level.title
    ),
    ["Customer", "…2", "SO-1043"],
  );
  assertEquals(c.current.level.title, "Factures");
});

Deno.test("reconcileRoot - même identité conserve le parcours ; une autre racine le remet à zéro", () => {
  const initial = {
    title: "SINV-1",
    kind: "root" as const,
    origin: "record" as const,
  };
  let stack = pushLevel(createStack(initial), list("Paiements"));
  stack = patchLevelUi(stack, currentLevel(stack).id, { page: 2 });

  const same = reconcileRoot(stack, {
    ...initial,
    count: 99,
    body: { fresh: true },
  });
  assertEquals(same, stack);
  assertEquals(currentLevel(same).ui.page, 2);
  assertEquals(navRootIdentity(initial), navRootIdentity({ ...initial }));

  const changed = reconcileRoot(stack, {
    title: "SINV-2",
    kind: "root",
    origin: "record",
  });
  assertEquals(changed.levels.map((level) => level.title), ["SINV-2"]);
  assertEquals(changed.nextId, 1);
});

Deno.test("viewerRootKey - canonicalise la requête et ignore les données rafraîchies", () => {
  const first = viewerRootKey(
    "stock",
    {
      toolName: "erpnext_stock_balance",
      arguments: { warehouse: "Stores - C", limit: 50 },
    },
    { doctype: "Bin" },
  );
  const refreshed = viewerRootKey(
    "stock",
    {
      toolName: "erpnext_stock_balance",
      arguments: { limit: 50, warehouse: "Stores - C" },
    },
    { doctype: "Bin", title: "Stock refreshed" },
  );

  assertEquals(refreshed, first);
  assertEquals(
    viewerRootKey(
      "stock",
      {
        toolName: "erpnext_stock_balance",
        arguments: { warehouse: "Finished Goods - C", limit: 50 },
      },
      { doctype: "Bin" },
    ) === first,
    false,
  );
});

Deno.test("viewerRootKey - l'identité intrinsèque distingue deux racines sans refresh", () => {
  const invoices = viewerRootKey("doclist", undefined, {
    doctype: "Sales Invoice",
  });
  const orders = viewerRootKey("doclist", undefined, {
    doctype: "Sales Order",
  });
  assertEquals(invoices === orders, false);
});

Deno.test("reconcileRoot - même titre, nouvelle requête racine coupe la pile", () => {
  const stockRoot = (warehouse: string) => ({
    title: "Stock",
    kind: "root" as const,
    origin: "list" as const,
    key: viewerRootKey(
      "stock",
      {
        toolName: "erpnext_stock_balance",
        arguments: { warehouse, limit: 50 },
      },
      { doctype: "Bin" },
    ),
  });
  let stack = pushLevel(createStack(stockRoot("Stores - C")), list("Item"));

  const refreshed = reconcileRoot(stack, stockRoot("Stores - C"));
  assertEquals(refreshed, stack);

  stack = reconcileRoot(stack, stockRoot("Finished Goods - C"));
  assertEquals(stack.levels.map((level) => level.title), ["Stock"]);
  assertEquals(stack.nextId, 1);
});

Deno.test("nav-stack : retour et saut direct coupent la pile, jamais sous la racine", () => {
  let s = root();
  for (const t of ["A", "B", "C"]) s = pushLevel(s, list(t));
  assertEquals(currentLevel(popLevel(s)).title, "B");
  assertEquals(popToLevel(s, 1).levels.map((l) => l.title), ["Customer", "A"]);
  assertEquals(popToLevel(s, 3), s); // le courant : rien à couper
  assertEquals(popLevel(root()), root());
});

Deno.test("nav-stack : un niveau garde sa payload et son interface ; le retour restaure", () => {
  let s = pushLevel(root(), list("Factures"));
  const id = currentLevel(s).id;
  s = patchLevel(s, id, { loading: false, body: { count: 3 }, count: 3 });
  s = patchLevelUi(s, id, { sortKey: "name", page: 2 });
  s = patchLevelUi(s, id, { expandedId: "SINV-1" });
  s = pushLevel(s, list("Paiements"));
  const back = currentLevel(popLevel(s));
  assertEquals(back.body, { count: 3 });
  assertEquals(back.ui, { sortKey: "name", page: 2, expandedId: "SINV-1" });
  assertEquals(back.loading, false);
  assertEquals(patchLevel(s, "nope", { count: 9 }), s);
});

Deno.test("nav-stack : les ids sont stables et déterministes", () => {
  const a = pushLevel(root(), list("Factures"));
  const b = pushLevel(root(), list("Factures"));
  assertEquals(currentLevel(a).id, currentLevel(b).id);
  assertEquals(currentLevel(a).id, "1:Factures");
});

Deno.test("crumbs - l'origine n'est jamais élidée, même à cinq niveaux", () => {
  let stack = createStack({
    title: "CA par mois",
    kind: "root",
    origin: "chart",
  });
  for (const title of ["A", "B", "C", "Lignes"]) {
    stack = pushLevel(stack, { title, kind: "list" });
  }
  const c = crumbs(stack);
  assertEquals(c.depth, 5);
  assertEquals(c.elided.map((x) => x.level.title), ["A", "B"]);
  assertEquals(c.parents.map((x) => x.level.title), ["CA par mois", "C"]);
  assertEquals(c.current.level.title, "Lignes");
  assertEquals(c.parents[0].level.origin, "chart");
});

Deno.test("crumbs - à quatre niveaux, rien n'est élidé sauf l'intermédiaire", () => {
  let stack = createStack({ title: "CUST-42", kind: "root" });
  for (const title of ["Factures", "…00046", "Paiements"]) {
    stack = pushLevel(stack, { title, kind: "list" });
  }
  const c = crumbs(stack);
  assertEquals(c.elided.map((x) => x.level.title), ["Factures"]);
  assertEquals(c.parents.map((x) => x.level.title), ["CUST-42", "…00046"]);
});

Deno.test("levelKey - même outil, mêmes arguments dans un autre ordre : même clé", () => {
  const a = levelKey({
    name: "erpnext_doc_list",
    args: { doctype: "X", limit: 20 },
  });
  const b = levelKey({
    name: "erpnext_doc_list",
    args: { limit: 20, doctype: "X" },
  });
  assertEquals(a, b);
  const c = levelKey({
    name: "erpnext_doc_list",
    args: { doctype: "Y", limit: 20 },
  });
  assertEquals(a === c, false);
});

Deno.test("findLevelByKey - retrouve un niveau déjà en pile, -1 sinon", () => {
  const key = levelKey({
    name: "erpnext_customer_get",
    args: { name: "CUST-42" },
  });
  let stack = createStack({ title: "Clients", kind: "root" });
  stack = pushLevel(stack, { title: "CUST-42", kind: "record", key });
  stack = pushLevel(stack, { title: "Factures", kind: "list", key: "k2" });
  assertEquals(findLevelByKey(stack, key), 1);
  assertEquals(findLevelByKey(stack, "absent"), -1);
});

Deno.test("markStale / clearStale - tous les niveaux marqués, un seul effacé", () => {
  let stack = createStack({ title: "Clients", kind: "root" });
  stack = pushLevel(stack, { title: "Factures", kind: "list" });
  stack = markStale(stack, "14:02", "…00046");
  assertEquals(stack.levels.map((l) => l.stale?.at), ["14:02", "14:02"]);
  assertEquals(stack.levels[1].stale?.subject, "…00046");
  const cleared = clearStale(stack, stack.levels[1].id);
  assertEquals(cleared.levels[1].stale, undefined);
  assertEquals(cleared.levels[0].stale?.at, "14:02");
  assertEquals(clearStale(cleared, cleared.levels[1].id), cleared);
});

Deno.test("pushLevel - un niveau repoussé après un retour n'hérite pas de l'id de l'ancien", () => {
  let s = createStack({ title: "Clients", kind: "root" });
  s = pushLevel(s, { title: "Paiements", kind: "list" });
  const first = currentLevel(s).id;
  s = popLevel(s);
  s = pushLevel(s, { title: "Paiements", kind: "list" });
  const second = currentLevel(s).id;
  assertEquals(first === second, false);
  // une réponse tardive pour l'ancien id ne touche pas le nouveau niveau
  assertEquals(patchLevel(s, first, { body: "vieux" }), s);
});
