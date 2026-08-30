import { assertEquals } from "@std/assert";
import {
  jumpInto,
  refreshCurrent,
  type StackStore,
  toggleRootJump,
} from "./nav-jump.ts";
import type { Jump, ToolHost } from "./jumps.ts";
import {
  createStack,
  currentLevel,
  markStale,
  type NavStack,
  patchLevel,
  popLevel,
  pushLevel,
  reconcileRoot,
} from "./nav-stack.ts";

/** Une pile en mémoire, comme `useState` la tiendrait. */
function memoryStore(initial: NavStack): StackStore & { stack: NavStack } {
  const store = {
    stack: initial,
    set: (update: (s: NavStack) => NavStack) => {
      store.stack = update(store.stack);
    },
  };
  return store;
}

/** Un hôte dont chaque appel d'outil se résout à la main, dans l'ordre voulu. */
function deferredHost() {
  const pending: ((payload: unknown) => void)[] = [];
  const host: ToolHost = {
    callServerTool: () =>
      new Promise((resolve) => {
        pending.push((payload) =>
          resolve({
            content: [{ type: "text", text: JSON.stringify(payload) }],
          })
        );
      }),
  };
  return {
    host,
    resolve: (i: number, payload: unknown) => pending[i](payload),
    calls: () => pending.length,
  };
}

const jump = (
  title: string,
  name = "erpnext_doc_list",
  args = { doctype: title },
): Jump => ({
  label: title,
  kind: "list",
  tool: { name, args },
});

Deno.test("jumpInto - empile un niveau en chargement, puis le remplit", async () => {
  const store = memoryStore(createStack({ title: "Racine", kind: "root" }));
  const { host, resolve } = deferredHost();
  const done = jumpInto(store, host, jump("Paiements"));
  assertEquals(currentLevel(store.stack).title, "Paiements");
  assertEquals(currentLevel(store.stack).loading, true);
  resolve(0, { count: 2, data: [{ name: "a" }, { name: "b" }] });
  assertEquals(await done, "pushed");
  assertEquals(currentLevel(store.stack).loading, false);
  assertEquals(currentLevel(store.stack).count, 2);
});

Deno.test("jumpInto - un saut pendant un chargement est ignoré", async () => {
  const store = memoryStore(createStack({ title: "Racine", kind: "root" }));
  const { host, resolve } = deferredHost();
  const first = jumpInto(store, host, jump("Paiements"));
  assertEquals(await jumpInto(store, host, jump("Autre")), "ignored");
  assertEquals(store.stack.levels.length, 2);
  resolve(0, { data: [] });
  await first;
});

Deno.test("jumpInto - une cible déjà en pile : on y remonte, sans appel", async () => {
  const store = memoryStore(createStack({ title: "Racine", kind: "root" }));
  const { host, resolve } = deferredHost();
  const a = jumpInto(store, host, jump("A"));
  resolve(0, { data: [] });
  await a;
  const b = jumpInto(store, host, jump("B"));
  resolve(1, { data: [] });
  await b;
  assertEquals(store.stack.levels.length, 3);
  assertEquals(await jumpInto(store, host, jump("A")), "popped");
  assertEquals(store.stack.levels.map((l) => l.title), ["Racine", "A"]);
});

Deno.test("jumpInto - une réponse tardive ne touche pas un niveau repoussé", async () => {
  const store = memoryStore(createStack({ title: "Racine", kind: "root" }));
  const { host, resolve } = deferredHost();
  const first = jumpInto(store, host, jump("Paiements"));
  store.set((s) => popLevel(s));
  const second = jumpInto(store, host, jump("Paiements"));
  resolve(0, { count: 1, data: [{ name: "vieux" }] });
  await first;
  // le nouveau niveau est toujours en chargement, intact
  assertEquals(currentLevel(store.stack).loading, true);
  assertEquals(currentLevel(store.stack).count, undefined);
  resolve(1, { count: 3, data: [] });
  await second;
  assertEquals(currentLevel(store.stack).count, 3);
});

Deno.test("jumpInto - une réponse de l'ancienne racine ne touche pas la nouvelle pile", async () => {
  const store = memoryStore(createStack({ title: "SINV-1", kind: "root" }));
  const { host, resolve } = deferredHost();
  const old = jumpInto(store, host, jump("Paiements"));
  store.set((s) => reconcileRoot(s, { title: "SINV-2", kind: "root" }));
  const current = jumpInto(store, host, jump("Paiements"));

  resolve(0, { count: 1, data: [{ name: "ancien" }] });
  await old;
  assertEquals(currentLevel(store.stack).loading, true);
  assertEquals(currentLevel(store.stack).body, undefined);

  resolve(1, { count: 2, data: [{ name: "nouveau" }] });
  await current;
  assertEquals(currentLevel(store.stack).count, 2);
});

Deno.test("jumpInto - un outil en erreur remplit `error`, pas `body`", async () => {
  const store = memoryStore(createStack({ title: "Racine", kind: "root" }));
  const host: ToolHost = {
    callServerTool: () =>
      Promise.resolve({
        isError: true,
        content: [{ type: "text", text: "boom" }],
      }),
  };
  assertEquals(await jumpInto(store, host, jump("X")), "pushed");
  assertEquals(currentLevel(store.stack).loading, false);
  assertEquals(typeof currentLevel(store.stack).error, "string");
  assertEquals(currentLevel(store.stack).body, undefined);
});

Deno.test("toggleRootJump - ouvre puis referme le même enfant sans second appel", async () => {
  const store = memoryStore(createStack({ title: "Racine", kind: "root" }));
  const { host, resolve, calls } = deferredHost();
  const first = toggleRootJump(store, host, jump("A"), "point:a");
  assertEquals(store.stack.levels.map((level) => level.title), ["Racine", "A"]);
  assertEquals(currentLevel(store.stack).loading, true);
  assertEquals(calls(), 1);
  resolve(0, { count: 1, data: [{ name: "A-1" }] });
  assertEquals(await first, "pushed");
  assertEquals(currentLevel(store.stack).count, 1);

  assertEquals(
    await toggleRootJump(store, host, jump("A"), "point:a"),
    "closed",
  );
  assertEquals(store.stack.levels.map((level) => level.title), ["Racine"]);
  assertEquals(calls(), 1);
});

Deno.test("toggleRootJump - un autre point remplace atomiquement toute la branche", async () => {
  const store = memoryStore(createStack({ title: "Racine", kind: "root" }));
  const { host, resolve } = deferredHost();
  const sameJump = jump("Détail");
  const first = toggleRootJump(store, host, sameJump, "point:a");
  resolve(0, { data: [] });
  await first;
  store.set((stack) =>
    pushLevel(stack, {
      title: "Descendant",
      kind: "record",
      body: { data: { name: "DOC-1" } },
    })
  );

  const replacement = toggleRootJump(store, host, sameJump, "point:b");
  assertEquals(store.stack.levels.map((level) => level.title), [
    "Racine",
    "Détail",
  ]);
  assertEquals(currentLevel(store.stack).loading, true);
  resolve(1, { count: 2, data: [{}, {}] });
  assertEquals(await replacement, "replaced");
  assertEquals(currentLevel(store.stack).count, 2);
});

Deno.test("toggleRootJump - la réponse tardive du point remplacé ne touche pas le nouveau", async () => {
  const store = memoryStore(createStack({ title: "Racine", kind: "root" }));
  const { host, resolve } = deferredHost();
  const old = toggleRootJump(store, host, jump("A"));
  const current = toggleRootJump(store, host, jump("B"));
  assertEquals(store.stack.levels.map((level) => level.title), ["Racine", "B"]);

  resolve(0, { count: 7, data: [{ name: "ancien" }] });
  assertEquals(await old, "pushed");
  assertEquals(currentLevel(store.stack).title, "B");
  assertEquals(currentLevel(store.stack).loading, true);
  assertEquals(currentLevel(store.stack).body, undefined);

  resolve(1, { count: 2, data: [{ name: "nouveau" }] });
  assertEquals(await current, "replaced");
  assertEquals(currentLevel(store.stack).count, 2);
});

Deno.test("toggleRootJump - fermer puis rouvrir pendant le chargement garde un id neuf", async () => {
  const store = memoryStore(createStack({ title: "Racine", kind: "root" }));
  const { host, resolve } = deferredHost();
  const old = toggleRootJump(store, host, jump("A"));
  const oldId = currentLevel(store.stack).id;
  assertEquals(await toggleRootJump(store, host, jump("A")), "closed");
  const current = toggleRootJump(store, host, jump("A"));
  const currentId = currentLevel(store.stack).id;
  assertEquals(oldId === currentId, false);

  resolve(0, { count: 7, data: [{ name: "ancien" }] });
  await old;
  assertEquals(currentLevel(store.stack).id, currentId);
  assertEquals(currentLevel(store.stack).loading, true);
  assertEquals(currentLevel(store.stack).body, undefined);

  resolve(1, { count: 1, data: [{ name: "nouveau" }] });
  await current;
  assertEquals(currentLevel(store.stack).count, 1);
});

Deno.test("toggleRootJump - une ancienne racine ne peut pas hydrater la nouvelle", async () => {
  const store = memoryStore(createStack({ title: "Racine A", kind: "root" }));
  const { host, resolve } = deferredHost();
  const old = toggleRootJump(store, host, jump("Détail"));
  store.set((stack) =>
    reconcileRoot(stack, { title: "Racine B", kind: "root" })
  );
  resolve(0, { count: 4, data: [{ name: "ancien" }] });
  await old;
  assertEquals(store.stack.levels.map((level) => level.title), ["Racine B"]);
  assertEquals(currentLevel(store.stack).body, undefined);
});

Deno.test("refreshCurrent - la racine ne sait pas se recharger ; un niveau si, et il n'est plus périmé", async () => {
  const store = memoryStore(createStack({ title: "Racine", kind: "root" }));
  const { host, resolve } = deferredHost();
  assertEquals(await refreshCurrent(store, host), false);
  const a = jumpInto(store, host, jump("A"));
  resolve(0, { count: 1, data: [{}] });
  await a;
  store.set((s) => markStale(s, "14:02", "X"));
  const r = refreshCurrent(store, host);
  assertEquals(currentLevel(store.stack).loading, true);
  resolve(1, { count: 5, data: [] });
  assertEquals(await r, true);
  assertEquals(currentLevel(store.stack).count, 5);
  assertEquals(currentLevel(store.stack).stale, undefined);
});

Deno.test("refreshCurrent - un échec garde le corps périmé et un retry réussi le remplace", async () => {
  let stack = createStack({ title: "Racine", kind: "root" });
  stack = pushLevel(stack, {
    title: "Factures",
    kind: "list",
    tool: { name: "erpnext_doc_list", args: { doctype: "Sales Invoice" } },
  });
  stack = patchLevel(stack, currentLevel(stack).id, {
    body: { count: 1, data: [{ name: "SINV-1" }] },
    count: 1,
  });
  stack = markStale(stack, "14:02", "SINV-1");
  const store = memoryStore(stack);
  let calls = 0;
  const host: ToolHost = {
    callServerTool: () => {
      calls += 1;
      if (calls === 1) {
        return Promise.resolve({
          isError: true,
          content: [{ type: "text", text: "indisponible" }],
        });
      }
      return Promise.resolve({
        content: [{
          type: "text",
          text: JSON.stringify({ count: 2, data: [{ name: "SINV-2" }] }),
        }],
      });
    },
  };

  assertEquals(await refreshCurrent(store, host), false);
  assertEquals(currentLevel(store.stack).body, {
    count: 1,
    data: [{ name: "SINV-1" }],
  });
  assertEquals(currentLevel(store.stack).count, 1);
  assertEquals(currentLevel(store.stack).stale?.at, "14:02");
  assertEquals(currentLevel(store.stack).loading, false);

  assertEquals(await refreshCurrent(store, host), true);
  assertEquals(currentLevel(store.stack).body, {
    count: 2,
    data: [{ name: "SINV-2" }],
  });
  assertEquals(currentLevel(store.stack).count, 2);
  assertEquals(currentLevel(store.stack).stale, undefined);
});
