import { assertEquals } from "@std/assert";
import { buildKanbanCardListHint, kanbanNavVars } from "./kanban-nav.ts";

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

Deno.test("kanban card list: exact Task identity keeps the destination scoped", () => {
  const hint = buildKanbanCardListHint("Task", "TASK-001");
  assertEquals(hint?.key, "view_list");
  assertEquals(hint?.kind, "list");
  assertEquals(hint?.tool, "erpnext_doc_list");
  assertEquals(hint?.args, {
    doctype: "Task",
    filters: [["name", "=", "TASK-001"]],
    fields: ["name", "subject", "status", "priority", "project"],
    limit: 1,
  });
});

Deno.test("kanban card list: each board exposes fields valid for its DocType", () => {
  assertEquals(buildKanbanCardListHint("Opportunity", "OPP-001")?.args, {
    doctype: "Opportunity",
    filters: [["name", "=", "OPP-001"]],
    fields: [
      "name",
      "title",
      "status",
      "party_name",
      "opportunity_amount",
      "currency",
    ],
    limit: 1,
  });
  assertEquals(buildKanbanCardListHint("Issue", "ISS-001")?.args, {
    doctype: "Issue",
    filters: [["name", "=", "ISS-001"]],
    fields: ["name", "subject", "status", "priority", "customer"],
    limit: 1,
  });
});

Deno.test("kanban card list: literal IDs survive punctuation and template syntax", () => {
  for (const cardId of ["TASK / 'quoted' \"name\"", "{id}", " A/B "]) {
    assertEquals(buildKanbanCardListHint("Task", cardId)?.args?.filters, [
      ["name", "=", cardId],
    ]);
  }
});

Deno.test("kanban card list: blank identities and unsupported boards cannot navigate", () => {
  assertEquals(buildKanbanCardListHint("Task", ""), null);
  assertEquals(buildKanbanCardListHint("Task", " \t"), null);
  assertEquals(buildKanbanCardListHint("Sales Invoice", "INV-001"), null);
  assertEquals(buildKanbanCardListHint("toString", "TASK-001"), null);
});

Deno.test("kanban card list: callers cannot change fields of later destinations", () => {
  const first = buildKanbanCardListHint("Task", "TASK-001");
  (first?.args?.fields as string[]).push("private_field");
  assertEquals(buildKanbanCardListHint("Task", "TASK-002")?.args?.fields, [
    "name",
    "subject",
    "status",
    "priority",
    "project",
  ]);
});
