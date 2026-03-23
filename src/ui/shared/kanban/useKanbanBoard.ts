import { useReducer } from "react";
import { createKanbanInitialState, kanbanStateReducer } from "./state";
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
    selectCard(cardId: string) {
      dispatch({ type: "select-card", cardId });
    },
    hydrateDetail(detail: Record<string, unknown>) {
      dispatch({ type: "hydrate-detail", detail });
    },
    closeDetail() {
      dispatch({ type: "close-detail" });
    },
    setDetailError(message: string) {
      dispatch({ type: "detail-error", message });
    },
  };
}
