import type { t as translate } from "../i18n.ts";

type TFunction = typeof translate;

const STATUS_KEYS: Readonly<Record<string, string>> = {
  "Open": "kanban.status.open",
  "Working": "kanban.status.working",
  "Pending Review": "kanban.status.pending_review",
  "Overdue": "kanban.status.overdue",
  "Completed": "kanban.status.completed",
  "Cancelled": "kanban.status.cancelled",
  "Replied": "kanban.status.replied",
  "Quotation": "kanban.status.quotation",
  "Converted": "kanban.status.converted",
  "Closed": "kanban.status.closed",
  "Lost": "kanban.status.lost",
  "On Hold": "kanban.status.on_hold",
  "Resolved": "kanban.status.resolved",
};

const TRANSITION_KEYS: Readonly<Record<string, string>> = {
  "Start work": "kanban.transition.start_work",
  "Request review": "kanban.transition.request_review",
  "Resume work": "kanban.transition.resume_work",
  "Approve": "kanban.transition.approve",
  "Reopen": "kanban.transition.reopen",
  "Reply": "kanban.transition.reply",
  "Send quotation": "kanban.transition.send_quotation",
  "Convert": "kanban.transition.convert",
  "Close": "kanban.transition.close",
  "Mark lost": "kanban.transition.mark_lost",
  "Resume conversation": "kanban.transition.resume_conversation",
  "Resume": "kanban.transition.resume",
  "Put on hold": "kanban.transition.put_on_hold",
  "Resolve": "kanban.transition.resolve",
};

const METRIC_KEYS: Readonly<Record<string, string>> = {
  "Progress": "kanban.metric.progress",
  "Due": "kanban.metric.due",
  "Start": "kanban.metric.start",
  "Est.": "kanban.metric.estimated",
  "Actual": "kanban.metric.actual",
  "Amount": "kanban.metric.amount",
  "Probability": "kanban.metric.probability",
  "Closing": "kanban.metric.closing",
  "Created": "kanban.metric.created",
  "Raised By": "kanban.metric.raised_by",
  "SLA": "kanban.metric.sla",
  "Opened": "kanban.metric.opened",
  "Resolved": "kanban.metric.resolved",
};

const BADGE_KEYS: Readonly<Record<string, string>> = {
  Low: "kanban.select.priority.Low",
  Medium: "kanban.select.priority.Medium",
  High: "kanban.select.priority.High",
  Urgent: "kanban.select.priority.Urgent",
  Lead: "kanban.select.opportunity_from.Lead",
  Customer: "kanban.select.opportunity_from.Customer",
  Milestone: "kanban.card.milestone",
  Jalon: "kanban.card.milestone",
  "SLA breach": "kanban.badge.sla_breach",
};

function labelFromKeys(
  label: string,
  keys: Readonly<Record<string, string>>,
  t: TFunction,
): string {
  const key = Object.hasOwn(keys, label) ? keys[label] : undefined;
  if (!key) return label;
  const translated = t(key);
  return translated === key ? label : translated;
}

export function kanbanStatusLabel(label: string, t: TFunction): string {
  return labelFromKeys(label, STATUS_KEYS, t);
}

export function kanbanTransitionLabel(label: string, t: TFunction): string {
  const translated = labelFromKeys(label, TRANSITION_KEYS, t);
  return translated === label ? kanbanStatusLabel(label, t) : translated;
}

export function kanbanMetricLabel(label: string, t: TFunction): string {
  return labelFromKeys(label, METRIC_KEYS, t);
}

export function kanbanBadgeLabel(label: string, t: TFunction): string {
  const translated = labelFromKeys(label, BADGE_KEYS, t);
  return translated === label ? kanbanStatusLabel(label, t) : translated;
}
