import { useEffect } from "preact/hooks";
import type { DocumentContextController } from "../document/context-interaction.ts";
import { hasExplicitAvailableTool } from "../viewer-tools.ts";
import type { KanbanBoardData, KanbanCardData } from "./types.ts";

export function kanbanCardMember(card: KanbanCardData) {
  return {
    name: card.id,
    label: card.id,
    value: card.title,
    fieldsSource: "row" as const,
  };
}

export function useKanbanPins(
  board: KanbanBoardData,
  context: DocumentContextController,
  rootKey: string,
) {
  const key = `kanban-cards:${rootKey}`;
  const config = {
    reconcileKey: key,
    doctype: board.doctype,
    view: board.title,
    fields: ["name"],
    queryAvailable: hasExplicitAvailableTool(
      board._availableTools,
      "erpnext_doc_list",
    ),
  };
  const complete = !!board.pagination && board.pagination.offset === 0 &&
    !board.pagination.hasMore &&
    board.pagination.loadedCount === board.cards.length &&
    (board.pagination.total === undefined ||
      board.pagination.total === board.cards.length);
  const reconcile = context.supported ? context.reconcileGroup : undefined;
  useEffect(() => {
    if (reconcile && !board.cards.some((card) => card.pending)) {
      void reconcile(key, board.cards.map(kanbanCardMember), { complete });
    }
  }, [board.cards, complete, key, reconcile]);

  if (!context.supported || !board.doctype) return;
  const names = context.recordPins(board.doctype);
  return {
    toggleCard(card: KanbanCardData) {
      if (card.pending) return;
      void context.toggleGroupMember(config, kanbanCardMember(card));
    },
    addCards(cards: readonly KanbanCardData[]) {
      const members = cards.filter((card) => !card.pending)
        .map(kanbanCardMember);
      if (members.length) void context.addGroupMembers(config, members);
    },
    isSelected(card: KanbanCardData) {
      return names.selected.has(card.id);
    },
  };
}
