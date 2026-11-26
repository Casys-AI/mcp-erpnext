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
