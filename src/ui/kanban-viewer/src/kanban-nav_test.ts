import { assertEquals } from "@std/assert";
import { kanbanNavVars } from "./kanban-nav.ts";

// ── fixtures ──────────────────────────────────────────────────────────────

// ── cas limites d'abord ────────────────────────────────────────────────────

Deno.test("kanbanNavVars: id et doctype corrects", () => {
  const vars = kanbanNavVars("TASK-001", "Task");
  assertEquals(vars.id, "TASK-001");
  assertEquals(vars.doctype, "Task");
});

Deno.test("kanbanNavVars: chaîne vide acceptée", () => {
  const vars = kanbanNavVars("", "");
  assertEquals(vars.id, "");
  assertEquals(vars.doctype, "");
});
