import { assertEquals } from "@std/assert";
import { snippetEvent } from "./snippet-contract.ts";

Deno.test("only verified snippet events with matching structured content display catalog UI", () => {
  const snippet = {
    id: "Customer invoices",
    name: "Customer invoices",
    parameters: { customer: "string" as const },
  };
  const structuredContent = { value: snippet };
  const _meta = { "io.casys/erpnext-snippet-event": "saved" };
  assertEquals(snippetEvent({ structuredContent }), undefined);
  assertEquals(
    snippetEvent({ _meta, structuredContent, isError: true }),
    undefined,
  );
  assertEquals(
    snippetEvent({ _meta, structuredContent: { value: [snippet] } }),
    undefined,
  );
  assertEquals(snippetEvent({ _meta, structuredContent }), {
    kind: "saved",
    snippet,
  });
  assertEquals(
    snippetEvent({
      _meta: { "io.casys/erpnext-snippet-event": "list" },
      structuredContent: { value: [] },
    }),
    { kind: "list", snippets: [] },
  );
});

Deno.test("source events carry exact script text and validated metadata", () => {
  const _meta = { "io.casys/erpnext-snippet-event": "source" };
  const code = '\n  return "<script>&</script>";\r\n  ';
  const snippet = { name: "Customer invoices", code };
  const structuredContent = { value: snippet };
  assertEquals(snippetEvent({ _meta, structuredContent }), {
    kind: "source",
    snippet,
  });
  assertEquals(snippetEvent({ structuredContent }), undefined);
  assertEquals(
    snippetEvent({ _meta, structuredContent, isError: true }),
    undefined,
  );
  assertEquals(
    snippetEvent({
      _meta,
      structuredContent: { value: { ...snippet, code: 123 } },
    }),
    undefined,
  );
  assertEquals(
    snippetEvent({
      _meta,
      structuredContent: {
        value: { ...snippet, parameters: { x: "unknown" } },
      },
    }),
    undefined,
  );
});
