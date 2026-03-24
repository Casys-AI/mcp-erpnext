import { assertEquals } from "jsr:@std/assert";
import type { FrappeFilter } from "../../src/api/types.ts";
import type {
  KanbanAdapter,
  KanbanBoard,
  KanbanCard,
  KanbanColumn,
  KanbanMoveRequest,
  KanbanMoveResult,
  KanbanTransition,
} from "../../src/kanban/types.ts";

Deno.test("kanban shared types - describe the normalized board payload", () => {
  const column: KanbanColumn = {
    id: "open",
    label: "Open",
    color: "#60a5fa",
    count: 1,
  };

  const card: KanbanCard = {
    id: "TASK-0001",
    title: "Draft the protocol notes",
    subtitle: "Project Alpha",
    columnId: "open",
    badges: [{ label: "High", tone: "warning" }],
    metrics: [{ label: "Progress", value: "20%" }],
  };

  const transition: KanbanTransition = {
    fromColumn: "open",
    toColumn: "working",
    allowed: true,
    label: "Start work",
  };

  const board: KanbanBoard = {
    boardId: "task-default",
    title: "Task Board",
    doctype: "Task",
    generatedAt: "2026-03-06T00:00:00.000Z",
    moveToolName: "erpnext_kanban_move_card",
    refreshArguments: { doctype: "Task", limit: 50, offset: 0 },
    columns: [column],
    cards: [card],
    allowedTransitions: [transition],
    capabilities: { canMoveCards: true },
    pagination: { limit: 50, offset: 0, loadedCount: 1, hasMore: false },
  };

  assertEquals(board.columns[0].id, "open");
  assertEquals(board.cards[0].columnId, "open");
  assertEquals(board.allowedTransitions[0].toColumn, "working");
  assertEquals(board.refreshArguments.doctype, "Task");
});

Deno.test("kanban shared types - describe move request, result, and adapter contract", async () => {
  const move: KanbanMoveRequest = {
    doctype: "Task",
    cardId: "TASK-0001",
    fromColumn: "open",
    toColumn: "working",
  };

  const result: KanbanMoveResult = {
    ok: true,
    cardId: "TASK-0001",
    fromColumn: "open",
    toColumn: "working",
  };

  const adapter: KanbanAdapter = {
    doctype: "Task",
    getColumns() {
      return [{
        id: "open",
        label: "Open",
        color: "#60a5fa",
        count: 0,
      }];
    },
    getAllowedTransitions() {
      return [{
        fromColumn: "open",
        toColumn: "working",
        allowed: true,
      }];
    },
    getListFields() {
      return ["name", "status"];
    },
    buildListFilters(): FrappeFilter[] {
      return [];
    },
    buildCards() {
      return [];
    },
    validateTransition() {
      return { allowed: true };
    },
    async executeMove() {
      return result;
    },
  };

  assertEquals(move.toColumn, "working");
  assertEquals(adapter.getColumns().length, 1);
  assertEquals(adapter.getAllowedTransitions().length, 1);
  assertEquals(adapter.getListFields(), ["name", "status"]);
  assertEquals((await adapter.executeMove(move, {} as never)).ok, true);
});
