import { useReducer } from "react";
import {
  createKanbanInitialState,
  kanbanStateReducer,
} from "./state";
import type { KanbanBoardData } from "./types";

export function useKanbanBoard() {
  const [state, dispatch] = useReducer(
    kanbanStateReducer,
    undefined,
    createKanbanInitialState,
  );

  return {
    state,
    startLoading() {
      dispatch({ type: "tool-input" });
    },
    hydrateBoard(board: KanbanBoardData) {
      dispatch({ type: "hydrate-board", board });
    },
    setError(message: string) {
      dispatch({ type: "tool-error", message });
    },
  };
}
