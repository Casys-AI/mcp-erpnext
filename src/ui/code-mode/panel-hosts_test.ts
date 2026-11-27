import { assertEquals, assertRejects } from "@std/assert";
import { createPanelContexts } from "./panel-hosts.ts";
type Update = {
  content?: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
};

Deno.test("panel model context preserves an adjoining selection and clears snapshots after disposal", async () => {
  const updates: Update[] = [];
  const hosts = createPanelContexts((update: Update) => {
    updates.push(update);
    return Promise.resolve({});
  });
  const lifetime = new AbortController();
  const first = hosts.forPanel("a", "Sales invoices", lifetime.signal);
  const second = hosts.forPanel("b", "Invoice detail", lifetime.signal);
  const a = { structuredContent: { document: "A" } };
  const b = { structuredContent: { document: "B" } };
  await Promise.all([
    first(a),
    second(b),
  ]);
  assertEquals(updates[1], {
    structuredContent: {
      panels: [
        { title: "Sales invoices", context: a.structuredContent },
        { title: "Invoice detail", context: b.structuredContent },
      ],
    },
  });
  await second({ structuredContent: {} });
  assertEquals(updates[2], a);
  lifetime.abort();
  await assertRejects(() => first(a));
  await hosts.clear();
  assertEquals(updates[3], { structuredContent: {} });
});

Deno.test("a rejected update does not enter another panel's acknowledged context", async () => {
  const updates: Update[] = [];
  const hosts = createPanelContexts((update: Update) => {
    updates.push(update);
    return Promise.resolve(updates.length === 1 ? { isError: true } : {});
  });
  const { signal } = new AbortController();
  const a = { content: [{ type: "text" as const, text: "private A" }] };
  const b = { content: [{ type: "text" as const, text: "selected B" }] };
  await hosts.forPanel("a", "A", signal)(a);
  await hosts.forPanel("b", "B", signal)(b);
  assertEquals(updates, [a, b]);
});

for (const mode of ["exception", "error response"] as const) {
  Deno.test(`a failed context clear (${mode}) keeps the acknowledged snapshot for the next attempt`, async () => {
    const updates: Update[] = [];
    const store = createPanelContexts(async (update: Update) => {
      updates.push(update);
      if (updates.length === 2) {
        if (mode === "exception") throw new Error("temporary failure");
        return { isError: true };
      }
      return {};
    });
    const old = new AbortController();
    const value = {
      structuredContent: { ref: "invoice-A" },
      content: [{ type: "text" as const, text: "A" }],
    };
    await store.forPanel("a", "A", old.signal)(value);
    old.abort();
    await assertRejects(() => store.clear());
    await store.clear();
    await store.clear();
    const empty = { structuredContent: {}, content: [] };
    assertEquals(updates, [value, empty, empty]);
  });
}

Deno.test("a late disposal cannot clear a current board even after a previous clear failed", async () => {
  const updates: Update[] = [];
  const store = createPanelContexts(async (value: Update) => {
    updates.push(value);
    return updates.length === 2 ? { isError: true } : {};
  });
  const old = new AbortController();
  const current = new AbortController();
  const a = { structuredContent: { ref: "invoice-A" } };
  const b = { structuredContent: { ref: "invoice-B" } };
  await store.forPanel("detail", "Detail", old.signal)(a);
  old.abort();
  await assertRejects(() => store.clear());
  await store.forPanel("detail", "Detail", current.signal)(b);
  await store.clear();
  assertEquals(updates, [a, { structuredContent: {} }, b]);
  current.abort();
  await store.clear();
  assertEquals(updates.at(-1), { structuredContent: {} });
});

Deno.test("a retired pin in flight cannot join the next board or overwrite a newer selection", async () => {
  const pending = Promise.withResolvers<void>();
  const started = Promise.withResolvers<void>();
  const updates: Update[] = [];
  const store = createPanelContexts(async (value: Update) => {
    updates.push(value);
    if (updates.length === 1) {
      started.resolve();
      await pending.promise;
    }
    return {};
  });
  const old = new AbortController();
  const current = new AbortController();
  const a = { structuredContent: { ref: "invoice-A" } };
  const b = { structuredContent: { ref: "invoice-B" } };
  const oldPin = store.forPanel("old", "A", old.signal)(a);
  await started.promise;
  old.abort();
  const newerPin = store.forPanel("new", "B", current.signal)(b);
  const lateCleanup = store.clear();
  pending.resolve();
  await Promise.all([oldPin, newerPin, lateCleanup]);
  assertEquals(updates, [a, b]);
  const third = new AbortController();
  await store.forPanel("third", "C", third.signal)({
    structuredContent: { ref: "C" },
  });
  current.abort();
  await store.clear();
  assertEquals(updates.at(-1), { structuredContent: { ref: "C" } });
});
