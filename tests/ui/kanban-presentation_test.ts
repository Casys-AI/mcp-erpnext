import { assertEquals } from "jsr:@std/assert";
import type { KanbanViewerState } from "../../src/ui/shared/kanban/state.ts";
import type { KanbanBoardData } from "../../src/ui/shared/kanban/types.ts";
import {
  formatBoardSummary,
  getErrorPresentation,
  normalizeMoveFailureMessage,
} from "../../src/ui/shared/kanban/presentation.ts";

function makeBoard(): KanbanBoardData {
  return {
    boardId: "task-board",
    title: "Task Board",
    doctype: "Task",
    generatedAt: "2026-03-06T00:00:00.000Z",
    moveToolName: "erpnext_kanban_move_card",
    refreshArguments: { doctype: "Task", limit: 50, offset: 0 },
    columns: [
      { id: "open", label: "Open", color: "#60a5fa", count: 1 },
      { id: "working", label: "Working", color: "#f59e0b", count: 1 },
    ],
    cards: [
      { id: "TASK-0001", title: "Draft protocol", columnId: "open" },
      { id: "TASK-0002", title: "Review protocol", columnId: "working" },
    ],
    allowedTransitions: [
      { fromColumn: "open", toColumn: "working", allowed: true },
    ],
    capabilities: { canMoveCards: true },
    pagination: { limit: 2, offset: 3, loadedCount: 5, hasMore: true },
  };
}

Deno.test("kanban presentation - keeps board visible and surfaces inline errors", () => {
  const state: KanbanViewerState = {
    board: makeBoard(),
    loading: false,
    error: "Move failed",
  };

  assertEquals(getErrorPresentation(state), {
    blockingError: null,
    inlineError: "Move failed",
  });
});

Deno.test("kanban presentation - keeps blocking errors for empty boards", () => {
  const state: KanbanViewerState = {
    board: null,
    loading: false,
    error: "No kanban payload received from tool result",
  };

  assertEquals(getErrorPresentation(state), {
    blockingError: "No kanban payload received from tool result",
    inlineError: null,
  });
});

Deno.test("kanban presentation - labels paginated counts as loaded lower bounds", () => {
  assertEquals(
    formatBoardSummary(makeBoard()),
    "5+ cards loaded · Task · move tool erpnext_kanban_move_card",
  );
});

Deno.test("kanban presentation - normalizes timeout errors for move failures", () => {
  assertEquals(
    normalizeMoveFailureMessage(new Error("Tool call timed out after 10000ms")),
    "La mise a jour a expire, veuillez reessayer.",
  );
});
