import type { KanbanBoardData } from "../../shared/kanban/types.ts";
import { canCallViewerTool } from "../../shared/viewer-tools.ts";

export interface KanbanViewerCapabilities {
  canLoadDetail: boolean;
  canEdit: boolean;
  canAssign: boolean;
  canUnassign: boolean;
  canMove: boolean;
}

/** Capacités d'action exactes du tableau, issues du registre serveur. */
export function kanbanViewerCapabilities(
  board: KanbanBoardData,
  serverTools: unknown,
  fixture: boolean,
): KanbanViewerCapabilities {
  if (fixture) {
    return {
      canLoadDetail: true,
      canEdit: true,
      canAssign: true,
      canUnassign: true,
      canMove: true,
    };
  }
  const available = board._availableTools;
  return {
    canLoadDetail: canCallViewerTool(
      serverTools,
      available,
      "erpnext_doc_get",
    ),
    canEdit: canCallViewerTool(
      serverTools,
      available,
      "erpnext_doc_update",
    ),
    canAssign: canCallViewerTool(
      serverTools,
      available,
      "erpnext_doc_assign",
    ) && canCallViewerTool(
      serverTools,
      available,
      "erpnext_user_list",
    ),
    canUnassign: canCallViewerTool(
      serverTools,
      available,
      "erpnext_doc_unassign",
    ),
    canMove: board.capabilities.canMoveCards && canCallViewerTool(
      serverTools,
      available,
      board.moveToolName,
    ),
  };
}
