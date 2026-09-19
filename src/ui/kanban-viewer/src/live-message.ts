import type { t as translate } from "../../shared/i18n.ts";
import { kanbanTransitionLabel } from "../../shared/kanban/labels.ts";

export type KanbanLiveMessage = string | {
  key:
    | "kanban.live.moved"
    | "kanban.live.moving"
    | "kanban.live.queued"
    | "kanban.live.move_not_allowed";
  title?: string;
  destination: string;
};

export function kanbanLiveMessageText(
  message: KanbanLiveMessage,
  t: typeof translate,
): string {
  if (typeof message === "string") return message;
  return t(message.key, {
    title: message.title,
    label: kanbanTransitionLabel(message.destination, t),
  });
}
