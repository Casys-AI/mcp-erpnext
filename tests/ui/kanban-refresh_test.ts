import { assertEquals } from "jsr:@std/assert";
import {
  canRequestBoardRefresh,
  resolveKanbanRefreshRequest,
  type KanbanRefreshGate,
} from "../../src/ui/shared/kanban/refresh.ts";
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

function makeGate(overrides: Partial<KanbanRefreshGate> = {}): KanbanRefreshGate {
  return {
    board: makeBoard(),
    request: {
      toolName: "erpnext_kanban_get_board",
      arguments: { doctype: "Task" },
    },
    visibilityState: "visible",
    dragging: false,
    processingMove: false,
    queuedMoves: 0,
    refreshInFlight: false,
    now: 20_000,
    lastRefreshStartedAt: 0,
    minIntervalMs: 15_000,
    ...overrides,
  };
}

Deno.test("kanban refresh - allows visible idle auto-refresh after the interval", () => {
  assertEquals(canRequestBoardRefresh(makeGate()), true);
});

Deno.test("kanban refresh - blocks background refresh while the document is hidden", () => {
  assertEquals(
    canRequestBoardRefresh(makeGate({ visibilityState: "hidden" })),
    false,
  );
});

Deno.test("kanban refresh - blocks background refresh during drag or queued mutations", () => {
  assertEquals(canRequestBoardRefresh(makeGate({ dragging: true })), false);
  assertEquals(canRequestBoardRefresh(makeGate({ processingMove: true })), false);
  assertEquals(canRequestBoardRefresh(makeGate({ queuedMoves: 1 })), false);
});

Deno.test("kanban refresh - throttles scheduled refreshes until the interval elapses", () => {
  assertEquals(
    canRequestBoardRefresh(makeGate({ now: 9_000, lastRefreshStartedAt: 0 })),
    false,
  );
});

Deno.test("kanban refresh - allows forced revalidation after a successful move", () => {
  assertEquals(
    canRequestBoardRefresh(
      makeGate({ now: 2_000, lastRefreshStartedAt: 0 }),
      { ignoreInterval: true },
    ),
    true,
  );
});

Deno.test("kanban refresh - requires both a board and a refresh request", () => {
  assertEquals(canRequestBoardRefresh(makeGate({ board: null })), false);
  assertEquals(canRequestBoardRefresh(makeGate({ request: null })), false);
});

Deno.test("kanban refresh - resolves request arguments from the board before host fallback", () => {
  const resolved = resolveKanbanRefreshRequest(
    makeBoard(),
    {
      toolName: "erpnext_kanban_get_board",
      arguments: {},
    },
  );

  assertEquals(resolved, {
    toolName: "erpnext_kanban_get_board",
    arguments: { doctype: "Task", limit: 50, offset: 0 },
  });
});
