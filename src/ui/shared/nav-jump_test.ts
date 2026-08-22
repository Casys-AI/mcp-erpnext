import { assertEquals } from "@std/assert";
import { jumpInto, refreshCurrent, type StackStore } from "./nav-jump.ts";
import type { Jump, ToolHost } from "./jumps.ts";
import {
  createStack,
  currentLevel,
  markStale,
  type NavStack,
  popLevel,
} from "./nav-stack.ts";

/** Une pile en mémoire, comme `useState` la tiendrait. */
function memoryStore(initial: NavStack): StackStore & { stack: NavStack } {
  const store = {
    stack: initial,
    get: () => store.stack,
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
