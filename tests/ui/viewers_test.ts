import { assert, assertEquals } from "jsr:@std/assert";
import { UI_VIEWERS } from "../../src/ui/viewers.ts";

Deno.test("UI_VIEWERS includes the canonical kanban viewer", () => {
  assert(UI_VIEWERS.includes("kanban-viewer"));
  assertEquals((UI_VIEWERS as readonly string[]).includes("order-pipeline-viewer"), false);
  assertEquals(UI_VIEWERS.length, 7);
});
