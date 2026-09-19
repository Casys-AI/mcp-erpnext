import type { KanbanCardData } from "../../shared/kanban/types.ts";

const DEADLINE_METRIC_LABELS = new Set(["due", "closing", "sla"]);

export function cardDeadlinePresentation(
  card: KanbanCardData,
  now = Date.now(),
): {
  isOverdue: boolean;
  overdueDays: number | null;
  needsDueDateFallback: boolean;
} {
  const isOverdue = card.badges?.some((badge) => {
    const label = badge.label.toLowerCase();
    return label === "overdue" || label === "sla breach";
  }) ?? false;
  let overdueDays: number | null = null;
  if (isOverdue && card.dueDate) {
    // Issue deadlines may be Frappe Datetime values; day counts share the
    // adapters' UTC calendar-date convention.
    const date = card.dueDate.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
    const due = date ? Date.parse(`${date}T00:00:00Z`) : NaN;
    if (Number.isFinite(due) && now > due) {
      overdueDays = Math.floor((now - due) / 86_400_000);
    }
  }
  return {
    isOverdue,
    overdueDays,
    needsDueDateFallback: Boolean(card.dueDate) &&
      !(card.metrics ?? []).some((metric) =>
        DEADLINE_METRIC_LABELS.has(metric.label.toLowerCase())
      ),
  };
}
