import type { KanbanBoardData } from "./types.ts";

export interface KanbanViewerState {
  board: KanbanBoardData | null;
  loading: boolean;
  error: string | null;
}

export type KanbanViewerAction =
  | { type: "tool-input" }
  | { type: "hydrate-board"; board: KanbanBoardData }
  | { type: "tool-error"; message: string };

export function createKanbanInitialState(): KanbanViewerState {
  return {
    board: null,
    loading: true,
    error: null,
  };
}

export function kanbanStateReducer(
  state: KanbanViewerState,
  action: KanbanViewerAction,
): KanbanViewerState {
  switch (action.type) {
    case "tool-input":
      return { ...state, loading: true, error: null };
    case "hydrate-board":
      return { board: action.board, loading: false, error: null };
    case "tool-error":
      return { ...state, loading: false, error: action.message };
    default:
      return state;
  }
}
