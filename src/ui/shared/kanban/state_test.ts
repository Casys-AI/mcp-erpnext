import { assertEquals } from "@std/assert";
import {
  createKanbanInitialState,
  kanbanStateReducer,
  rebaseCardEdits,
  resolveCardDetailCloseIntent,
} from "./state.ts";
import type { KanbanBoardData } from "./types.ts";

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

Deno.test("kanban state - hydrates board payload from MCP tool result", () => {
  const state = kanbanStateReducer(createKanbanInitialState(), {
    type: "hydrate-board",
    board: makeBoard(),
  });

  assertEquals(state.loading, false);
  assertEquals(state.error, null);
  assertEquals(state.board?.doctype, "Task");
  assertEquals(state.board?.cards[0].id, "TASK-0001");
});

Deno.test("kanban state - marks loading when tool input starts", () => {
  const hydratedState = kanbanStateReducer(createKanbanInitialState(), {
    type: "hydrate-board",
    board: makeBoard(),
  });

  const loadingState = kanbanStateReducer(hydratedState, {
    type: "tool-input",
  });

  assertEquals(loadingState.loading, true);
  assertEquals(loadingState.board?.boardId, "task-board");
});

Deno.test("kanban state - select-card sets loading detail state", () => {
  const state = kanbanStateReducer(createKanbanInitialState(), {
    type: "select-card",
    cardId: "TASK-0001",
  });

  assertEquals(state.detail.selectedCardId, "TASK-0001");
  assertEquals(state.detail.detailLoading, true);
  assertEquals(state.detail.cardDetail, null);
  assertEquals(state.detail.detailError, null);
});

Deno.test("kanban state - hydrate-detail populates card detail", () => {
  const selected = kanbanStateReducer(createKanbanInitialState(), {
    type: "select-card",
    cardId: "TASK-0001",
  });

  const detail = {
    name: "TASK-0001",
    subject: "Draft protocol",
    status: "Open",
  };
  const state = kanbanStateReducer(selected, {
    type: "hydrate-detail",
    detail,
  });

  assertEquals(state.detail.detailLoading, false);
  assertEquals(state.detail.cardDetail?.name, "TASK-0001");
  assertEquals(state.detail.detailError, null);
});

Deno.test("kanban state - close-detail resets detail state", () => {
  const selected = kanbanStateReducer(createKanbanInitialState(), {
    type: "select-card",
    cardId: "TASK-0001",
  });

  const state = kanbanStateReducer(selected, { type: "close-detail" });

  assertEquals(state.detail.selectedCardId, null);
  assertEquals(state.detail.cardDetail, null);
  assertEquals(state.detail.detailLoading, false);
});

Deno.test("kanban state - closes detail immediately when nothing changed", () => {
  assertEquals(resolveCardDetailCloseIntent({}), "close");
});

Deno.test("kanban state - asks before discarding any edited value", () => {
  assertEquals(
    resolveCardDetailCloseIntent({ subject: "Updated title" }),
    "confirm-discard",
  );
  assertEquals(
    resolveCardDetailCloseIntent({ description: "", progress: "0" }),
    "confirm-discard",
  );
});

Deno.test("kanban state - a save keeps only values differing from its canonical result", () => {
  assertEquals(
    rebaseCardEdits(
      { subject: "newer title", description: "added while saving" },
      { subject: "submitted title", description: "original" },
    ),
    { subject: "newer title", description: "added while saving" },
  );
  assertEquals(
    rebaseCardEdits(
      { subject: "submitted title", description: "added while saving" },
      { subject: "submitted title", description: "original" },
    ),
    { description: "added while saving" },
  );
});

Deno.test("kanban state - a pending save preserves an explicit return to the old value", () => {
  const original = { subject: "O" };
  const submitted = { subject: "A" };
  const inputWhileSaving = { subject: "O" };

  assertEquals(
    rebaseCardEdits(inputWhileSaving, { ...original, ...submitted }),
    { subject: "O" },
  );
  assertEquals(rebaseCardEdits(inputWhileSaving, original), {});
});

Deno.test("kanban state - detail-error sets error on detail", () => {
  const selected = kanbanStateReducer(createKanbanInitialState(), {
    type: "select-card",
    cardId: "TASK-0001",
  });

  const state = kanbanStateReducer(selected, {
    type: "detail-error",
    message: "Network error",
  });

  assertEquals(state.detail.detailLoading, false);
  assertEquals(state.detail.detailError, "Network error");
  assertEquals(state.detail.selectedCardId, "TASK-0001");
});

Deno.test("kanban state - hydrate-board tolerates missing arrays from ERPNext", () => {
  // Un payload réel peut omettre allowedTransitions, ou le renvoyer null.
  // Sans normalisation, le premier .find() du glisser-déposer blanchit la vue.
  const partial = {
    doctype: "Task",
    columns: null,
    cards: undefined,
    allowedTransitions: null,
  } as unknown as KanbanBoardData;
  const state = kanbanStateReducer(createKanbanInitialState(), {
    type: "hydrate-board",
    board: partial,
  });
  assertEquals(state.board?.columns, []);
  assertEquals(state.board?.cards, []);
  assertEquals(state.board?.allowedTransitions, []);
  assertEquals(state.loading, false);
});
