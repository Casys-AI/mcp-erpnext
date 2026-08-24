import { useReducer } from "preact/hooks";
import { createKanbanInitialState, kanbanStateReducer } from "./state";
import type { KanbanBoardData } from "./types";

export function useKanbanBoard(initialBoard?: KanbanBoardData) {
  const [state, dispatch] = useReducer(
    kanbanStateReducer,
    initialBoard,
    // Tout board entre par le reducer : la fixture aussi est normalisée.
    (board) =>
      board
        ? kanbanStateReducer(createKanbanInitialState(), {
          type: "hydrate-board",
          board,
        })
        : createKanbanInitialState(),
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
