import { assertEquals } from "jsr:@std/assert";
import {
  applyOptimisticMove,
  canDropCardInColumn,
  enqueueMove,
  reconcileMoveSuccess,
  rollbackMoveFailure,
  takeNextQueuedMove,
  type QueuedKanbanMove,
} from "../../src/ui/shared/kanban/interactions.ts";
import type { KanbanBoardData } from "../../src/ui/shared/kanban/types.ts";

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
      { id: "working", label: "Working", color: "#f59e0b", count: 0 },
    ],
    cards: [
      { id: "TASK-0001", title: "Draft protocol", columnId: "open" },
    ],
    allowedTransitions: [
      { fromColumn: "open", toColumn: "working", allowed: true },
    ],
    capabilities: { canMoveCards: true },
    pagination: { limit: 50, offset: 0, loadedCount: 1, hasMore: false },
  };
}

Deno.test("kanban interactions - optimistic move updates card and column counts", () => {
  const move: QueuedKanbanMove = {
    cardId: "TASK-0001",
    fromColumn: "open",
    toColumn: "working",
    doctype: "Task",
    moveToolName: "erpnext_kanban_move_card",
  };

  const result = applyOptimisticMove(makeBoard(), move);

  assertEquals(result.board.cards[0].columnId, "working");
  assertEquals(result.board.cards[0].pending, true);
  assertEquals(result.board.columns[0].count, 0);
  assertEquals(result.board.columns[1].count, 1);
});

Deno.test("kanban interactions - success reconciliation clears pending state", () => {
  const move: QueuedKanbanMove = {
    cardId: "TASK-0001",
    fromColumn: "open",
    toColumn: "working",
    doctype: "Task",
    moveToolName: "erpnext_kanban_move_card",
  };

  const optimistic = applyOptimisticMove(makeBoard(), move);
  const reconciled = reconcileMoveSuccess(optimistic.board, {
    ok: true,
    cardId: "TASK-0001",
    fromColumn: "open",
    toColumn: "working",
    serverCard: {
      id: "TASK-0001",
      title: "Draft protocol",
      columnId: "working",
    },
  });

  assertEquals(reconciled.cards[0].columnId, "working");
  assertEquals(reconciled.cards[0].pending, false);
});

Deno.test("kanban interactions - rollback restores original board after failure", () => {
  const move: QueuedKanbanMove = {
    cardId: "TASK-0001",
    fromColumn: "open",
    toColumn: "working",
    doctype: "Task",
    moveToolName: "erpnext_kanban_move_card",
  };

  const optimistic = applyOptimisticMove(makeBoard(), move);
  const rolledBack = rollbackMoveFailure(optimistic.snapshot, {
    ok: false,
    cardId: "TASK-0001",
    fromColumn: "open",
    toColumn: "working",
    errorMessage: "Server rejected move",
  });

  assertEquals(rolledBack.cards[0].columnId, "open");
  assertEquals(rolledBack.columns[0].count, 1);
  assertEquals(rolledBack.columns[1].count, 0);
});

Deno.test("kanban interactions - queue processes one move at a time in FIFO order", () => {
  const first: QueuedKanbanMove = {
    cardId: "TASK-0001",
    fromColumn: "open",
    toColumn: "working",
    doctype: "Task",
    moveToolName: "erpnext_kanban_move_card",
  };
  const second: QueuedKanbanMove = {
    cardId: "TASK-0002",
    fromColumn: "working",
    toColumn: "open",
    doctype: "Task",
    moveToolName: "erpnext_kanban_move_card",
  };

  const queued = enqueueMove(enqueueMove([], first), second);
  const { nextMove, restQueue } = takeNextQueuedMove(queued);

  assertEquals(nextMove?.cardId, "TASK-0001");
  assertEquals(restQueue.length, 1);
  assertEquals(restQueue[0].cardId, "TASK-0002");
});

Deno.test("kanban interactions - exposes allowed drop targets only for valid transitions", () => {
  const board = makeBoard();

  assertEquals(canDropCardInColumn(board, "TASK-0001", "working"), true);
  assertEquals(canDropCardInColumn(board, "TASK-0001", "open"), false);
  assertEquals(canDropCardInColumn(board, "TASK-9999", "working"), false);
});
