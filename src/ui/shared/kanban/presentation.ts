import type { KanbanViewerState } from "./state.ts";
import type { KanbanBoardData } from "./types.ts";
import { t } from "../i18n.ts";

export function getErrorPresentation(
  state: Pick<KanbanViewerState, "board" | "error">,
): {
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
  board: Pick<
    KanbanBoardData,
    "doctype" | "cards" | "pagination"
  >,
): string {
  let countLabel: string;
  if (board.pagination.total !== undefined) {
    countLabel = `${board.pagination.total} cards`;
  } else if (board.pagination.hasMore) {
    countLabel = `${board.pagination.loadedCount}+ cards loaded`;
  } else {
    countLabel = `${board.pagination.loadedCount} cards`;
  }
  return `${countLabel} · ${board.doctype}`;
}

export function normalizeMoveFailureMessage(error: unknown): string {
  let raw: string;
  if (error instanceof Error) {
    raw = error.message;
  } else if (typeof error === "string") {
    raw = error;
  } else {
    raw = t("kanban.error.move_failed");
  }

  if (/timeout|timed out/i.test(raw)) {
    return t("kanban.error.move_timeout");
  }

  return raw;
}
