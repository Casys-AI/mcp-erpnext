import type { KanbanViewerState } from "./state.ts";
import type { KanbanBoardData } from "./types.ts";

export function getErrorPresentation(state: Pick<KanbanViewerState, "board" | "error">): {
  blockingError: string | null;
  inlineError: string | null;
} {
  if (!state.error) {
    return { blockingError: null, inlineError: null };
  }

  if (state.board) {
    return { blockingError: null, inlineError: state.error };
  }

  return { blockingError: state.error, inlineError: null };
}

export function formatBoardSummary(
  board: Pick<KanbanBoardData, "doctype" | "moveToolName" | "cards" | "pagination">,
): string {
  const countLabel = board.pagination.total !== undefined
    ? `${board.pagination.total} cards`
    : board.pagination.hasMore
    ? `${board.pagination.loadedCount}+ cards loaded`
    : `${board.pagination.loadedCount} cards`;
  return `${countLabel} · ${board.doctype} · move tool ${board.moveToolName}`;
}

export function normalizeMoveFailureMessage(error: unknown): string {
  const raw = error instanceof Error
    ? error.message
    : typeof error === "string"
    ? error
    : "Move failed";

  if (/timeout|timed out/i.test(raw)) {
    return "La mise a jour a expire, veuillez reessayer.";
  }

  return raw;
}
