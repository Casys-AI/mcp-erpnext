import { assertEquals, assertFalse, assertStringIncludes } from "@std/assert";
import type { KanbanBoardData } from "../../shared/kanban/types.ts";
import { kanbanViewerCapabilities } from "./capabilities.ts";

const BASE_BOARD: KanbanBoardData = {
  boardId: "task",
  title: "Tasks",
  doctype: "Task",
  generatedAt: "2026-08-24T00:00:00Z",
  moveToolName: "erpnext_kanban_move_card",
  refreshArguments: {},
  columns: [],
  cards: [],
  allowedTransitions: [],
  capabilities: { canMoveCards: true },
  pagination: { limit: 20, offset: 0, loadedCount: 0, hasMore: false },
};

Deno.test("kanban capabilities : catégorie kanban garde le move sans ops/setup", () => {
  assertEquals(
    kanbanViewerCapabilities(
      {
        ...BASE_BOARD,
        _availableTools: [
          "erpnext_kanban_get_board",
          "erpnext_kanban_move_card",
        ],
      },
      {},
      false,
    ),
    {
      canLoadDetail: false,
      canEdit: false,
      canAssign: false,
      canUnassign: false,
      canMove: true,
    },
  );
});

Deno.test("kanban capabilities : plein serveur expose chaque action exacte", () => {
  assertEquals(
    kanbanViewerCapabilities(
      {
        ...BASE_BOARD,
        _availableTools: [
          "erpnext_kanban_move_card",
          "erpnext_doc_get",
          "erpnext_doc_update",
          "erpnext_doc_assign",
          "erpnext_doc_unassign",
          "erpnext_user_list",
        ],
      },
      {},
      false,
    ),
    {
      canLoadDetail: true,
      canEdit: true,
      canAssign: true,
      canUnassign: true,
      canMove: true,
    },
  );
});

Deno.test("kanban capabilities : message-only refuse tous les outils", () => {
  assertEquals(
    kanbanViewerCapabilities(
      {
        ...BASE_BOARD,
        _availableTools: [
          "erpnext_kanban_move_card",
          "erpnext_doc_get",
          "erpnext_doc_update",
          "erpnext_doc_assign",
          "erpnext_doc_unassign",
          "erpnext_user_list",
        ],
      },
      undefined,
      false,
    ),
    {
      canLoadDetail: false,
      canEdit: false,
      canAssign: false,
      canUnassign: false,
      canMove: false,
    },
  );
});

Deno.test("kanban : le contexte suit les niveaux sans remplacer le bouton de détail", async () => {
  const source = await Deno.readTextFile(
    new URL("./KanbanViewer.tsx", import.meta.url),
  );

  assertStringIncludes(
    source,
    "const activeContext = useActiveContext(app, rootKey)",
  );
  assertStringIncludes(source, "context={context}");
  assertStringIncludes(source, "contextView={board.title}");
  assertStringIncludes(source, 'aria-haspopup="dialog"');
  assertStringIncludes(source, 't("interaction.detail.open"');
  assertFalse(source.includes("aria-expanded={expanded}"));
  assertFalse(source.includes("kanbanCardDetailAction"));
  assertStringIncludes(source, '"min-h-10"');
  assertStringIncludes(source, "style={{ width: 40, height: 40 }}");
});
