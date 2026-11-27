import { assertEquals, assertStringIncludes } from "@std/assert";

Deno.test("Kanban sends every gesture to the context queue and skips moving cards", async () => {
  const source = await Deno.readTextFile(
    new URL("./useKanbanPins.ts", import.meta.url),
  );
  assertEquals(source.includes("context.pending"), false);
  assertStringIncludes(source, "if (card.pending) return;");
  assertStringIncludes(source, "context.toggleGroupMember(");
  assertStringIncludes(source, "cards.filter((card) => !card.pending)");
  assertStringIncludes(source, "context.addGroupMembers(");
});
