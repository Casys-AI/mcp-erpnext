/** @jsxImportSource preact */

import { useEffect } from "preact/hooks";
import { projectedRecordNames } from "../active-context-chip.ts";
import type { ActiveContextSelection } from "../active-context.ts";
import { kanbanPinCoverage } from "./pin-coverage.ts";
import { ContextPinButton } from "../ContextPinButton.tsx";
import type { DocumentContextController } from "../document/context-interaction.ts";
import { useT } from "../i18n-hook.ts";
import { hasExplicitAvailableTool } from "../viewer-tools.ts";
import { kanbanStatusLabel } from "./labels.ts";
import type {
  KanbanBoardData,
  KanbanCardData,
  KanbanColumnData,
} from "./types.ts";

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
  selections: readonly ActiveContextSelection[],
) {
  const t = useT();
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
  const sharedNames = projectedRecordNames(selections, rootKey, board.doctype);
  function pinned(card: KanbanCardData) {
    return context.isSelected({
      id: `record:${board.doctype}:${card.id}`,
      label: card.id,
      view: board.title,
    });
  }
  function toggle(cards: KanbanCardData[], remove: boolean) {
    if (remove) {
      void context.removeGroupMembers(
        config,
        cards.map((card) => card.id),
      );
    } else void context.addGroupMembers(config, cards.map(kanbanCardMember));
  }
  function pin(cards: KanbanCardData[], label: string) {
    const { allSelected, pressed, selected, shared } = kanbanPinCoverage(
      cards,
      pinned,
      sharedNames,
    );
    const action = t(allSelected ? "context.pin.remove" : "context.pin.add", {
      label,
    });
    return (
      <ContextPinButton
        label={shared < selected
          ? `${action} · ${
            t("context.active.partly_shared", { shared, total: selected })
          }`
          : action}
        pressed={pressed}
        disabled={context.pending || cards.some((card) => card.pending)}
        onToggle={() => toggle(cards, allSelected)}
      />
    );
  }
  return {
    card(card: KanbanCardData) {
      return pin([card], card.title);
    },
    column(column: KanbanColumnData, cards: KanbanCardData[]) {
      if (!cards.length) return null;
      return pin(
        cards,
        t("kanban.pin.loaded_cards", {
          column: kanbanStatusLabel(column.label, t),
          count: cards.length,
        }),
      );
    },
  };
}
