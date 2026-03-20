import type { KanbanBoardData } from "./types.ts";

export interface CardDetailState {
  selectedCardId: string | null;
  cardDetail: Record<string, unknown> | null;
  detailLoading: boolean;
  detailError: string | null;
}

export interface KanbanViewerState {
  board: KanbanBoardData | null;
  loading: boolean;
  error: string | null;
  detail: CardDetailState;
}

export type KanbanViewerAction =
  | { type: "tool-input" }
  | { type: "hydrate-board"; board: KanbanBoardData }
  | { type: "tool-error"; message: string }
  | { type: "select-card"; cardId: string }
  | { type: "hydrate-detail"; detail: Record<string, unknown> }
  | { type: "close-detail" }
  | { type: "detail-error"; message: string };

const INITIAL_DETAIL: CardDetailState = {
  selectedCardId: null,
  cardDetail: null,
  detailLoading: false,
  detailError: null,
};

export function createKanbanInitialState(): KanbanViewerState {
  return {
    board: null,
    loading: true,
    error: null,
    detail: { ...INITIAL_DETAIL },
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
      return { board: action.board, loading: false, error: null, detail: state.detail };
    case "tool-error":
      return { ...state, loading: false, error: action.message };
    case "select-card":
      return {
        ...state,
        detail: {
          selectedCardId: action.cardId,
          cardDetail: null,
          detailLoading: true,
          detailError: null,
        },
      };
    case "hydrate-detail":
      return {
        ...state,
        detail: {
          ...state.detail,
          cardDetail: action.detail,
          detailLoading: false,
          detailError: null,
        },
      };
    case "close-detail":
      return { ...state, detail: { ...INITIAL_DETAIL } };
    case "detail-error":
      return {
        ...state,
        detail: {
          ...state.detail,
          detailLoading: false,
          detailError: action.message,
        },
      };
    default:
      return state;
  }
}
