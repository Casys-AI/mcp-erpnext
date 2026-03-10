import type { KanbanBoardDefinition } from "./types.ts";

export const KANBAN_BOARD_DEFINITIONS: KanbanBoardDefinition[] = [
  {
    doctype: "Task",
    title: "Task Board",
    adapterKey: "task",
    moveToolName: "erpnext_kanban_move_card",
  },
  {
    doctype: "Opportunity",
    title: "Opportunity Board",
    adapterKey: "opportunity",
    moveToolName: "erpnext_kanban_move_card",
  },
  {
    doctype: "Issue",
    title: "Issue Board",
    adapterKey: "issue",
    moveToolName: "erpnext_kanban_move_card",
  },
];

export function getKanbanBoardDefinition(
  doctype: string,
): KanbanBoardDefinition | undefined {
  return KANBAN_BOARD_DEFINITIONS.find((definition) => definition.doctype === doctype);
}
