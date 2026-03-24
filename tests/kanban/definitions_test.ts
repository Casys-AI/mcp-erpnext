import { assertEquals } from "jsr:@std/assert";
import {
  KANBAN_BOARD_DEFINITIONS,
  getKanbanBoardDefinition,
} from "../../src/kanban/definitions.ts";

Deno.test("kanban board definitions - registers Task, Opportunity, and Issue", () => {
  assertEquals(KANBAN_BOARD_DEFINITIONS.length, 3);
  assertEquals(KANBAN_BOARD_DEFINITIONS[0].doctype, "Task");
  assertEquals(KANBAN_BOARD_DEFINITIONS[0].title, "Task Board");
  assertEquals(KANBAN_BOARD_DEFINITIONS[0].moveToolName, "erpnext_kanban_move_card");
  assertEquals(KANBAN_BOARD_DEFINITIONS[1].doctype, "Opportunity");
  assertEquals(KANBAN_BOARD_DEFINITIONS[1].title, "Opportunity Board");
  assertEquals(KANBAN_BOARD_DEFINITIONS[2].doctype, "Issue");
  assertEquals(KANBAN_BOARD_DEFINITIONS[2].title, "Issue Board");
});

Deno.test("kanban board definitions - lookup returns Task/Opportunity/Issue and rejects unknown doctypes", () => {
  const taskDefinition = getKanbanBoardDefinition("Task");
  const opportunityDefinition = getKanbanBoardDefinition("Opportunity");
  const issueDefinition = getKanbanBoardDefinition("Issue");
  const missingDefinition = getKanbanBoardDefinition("Sales Order");

  assertEquals(taskDefinition?.doctype, "Task");
  assertEquals(taskDefinition?.adapterKey, "task");
  assertEquals(opportunityDefinition?.doctype, "Opportunity");
  assertEquals(opportunityDefinition?.adapterKey, "opportunity");
  assertEquals(issueDefinition?.doctype, "Issue");
  assertEquals(issueDefinition?.adapterKey, "issue");
  assertEquals(missingDefinition, undefined);
});
