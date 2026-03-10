import type { FrappeFilter } from "../../api/types.ts";
import type {
  KanbanAdapter,
  KanbanCard,
  KanbanColumn,
  KanbanMoveRequest,
  KanbanMoveResult,
  KanbanTransition,
} from "../types.ts";

const ISSUE_COLUMNS: Array<{ id: string; label: string; color: string; status: string }> = [
  { id: "open", label: "Open", color: "#60a5fa", status: "Open" },
  { id: "replied", label: "Replied", color: "#f59e0b", status: "Replied" },
  { id: "on-hold", label: "On Hold", color: "#a78bfa", status: "On Hold" },
  { id: "resolved", label: "Resolved", color: "#22c55e", status: "Resolved" },
  { id: "closed", label: "Closed", color: "#64748b", status: "Closed" },
];

const STATUS_BY_COLUMN = new Map(ISSUE_COLUMNS.map((column) => [column.id, column.status]));
const COLUMN_BY_STATUS = new Map(ISSUE_COLUMNS.map((column) => [column.status, column.id]));

const ISSUE_LIST_FIELDS = [
  "name",
  "subject",
  "status",
  "priority",
  "customer",
  "raised_by",
];

const ISSUE_ALLOWED_TRANSITIONS: KanbanTransition[] = [
  { fromColumn: "open", toColumn: "replied", allowed: true, label: "Reply" },
  { fromColumn: "open", toColumn: "on-hold", allowed: true, label: "Put on hold" },
  { fromColumn: "open", toColumn: "resolved", allowed: true, label: "Resolve" },
  { fromColumn: "open", toColumn: "closed", allowed: true, label: "Close" },
  { fromColumn: "replied", toColumn: "open", allowed: true, label: "Reopen" },
  { fromColumn: "replied", toColumn: "on-hold", allowed: true, label: "Put on hold" },
  { fromColumn: "replied", toColumn: "resolved", allowed: true, label: "Resolve" },
  { fromColumn: "replied", toColumn: "closed", allowed: true, label: "Close" },
  { fromColumn: "on-hold", toColumn: "open", allowed: true, label: "Resume" },
  { fromColumn: "on-hold", toColumn: "replied", allowed: true, label: "Reply" },
  { fromColumn: "on-hold", toColumn: "resolved", allowed: true, label: "Resolve" },
  { fromColumn: "on-hold", toColumn: "closed", allowed: true, label: "Close" },
  { fromColumn: "resolved", toColumn: "open", allowed: true, label: "Reopen" },
  { fromColumn: "resolved", toColumn: "replied", allowed: true, label: "Reply" },
  { fromColumn: "resolved", toColumn: "closed", allowed: true, label: "Close" },
  { fromColumn: "closed", toColumn: "open", allowed: true, label: "Reopen" },
  { fromColumn: "closed", toColumn: "replied", allowed: true, label: "Reply" },
];

function columnIdForIssueStatus(status: unknown): string {
  return COLUMN_BY_STATUS.get(String(status ?? "Open")) ?? "open";
}

function priorityTone(priority: string): "neutral" | "warning" | "error" {
  if (priority === "Urgent") return "error";
  if (priority === "High") return "warning";
  return "neutral";
}

function buildIssueCard(row: Record<string, unknown>): KanbanCard {
  const status = String(row.status ?? "Open");
  const columnId = columnIdForIssueStatus(status);
  const priority = typeof row.priority === "string" ? row.priority : undefined;
  const subtitle = typeof row.customer === "string" && row.customer.length > 0
    ? row.customer
    : typeof row.raised_by === "string" && row.raised_by.length > 0
    ? row.raised_by
    : undefined;

  return {
    id: String(row.name ?? ""),
    title: String(row.subject ?? row.name ?? "Untitled issue"),
    subtitle,
    columnId,
    accent: ISSUE_COLUMNS.find((column) => column.id === columnId)?.color,
    badges: priority ? [{ label: priority, tone: priorityTone(priority) }] : [],
    metrics: typeof row.raised_by === "string" && row.raised_by.length > 0
      ? [{ label: "Raised By", value: row.raised_by }]
      : [],
  };
}

export const issueKanbanAdapter: KanbanAdapter = {
  doctype: "Issue",
  getColumns(): KanbanColumn[] {
    return ISSUE_COLUMNS.map((column) => ({
      id: column.id,
      label: column.label,
      color: column.color,
      count: 0,
    }));
  },
  getAllowedTransitions(): KanbanTransition[] {
    return ISSUE_ALLOWED_TRANSITIONS;
  },
  getListFields(): string[] {
    return ISSUE_LIST_FIELDS;
  },
  buildListFilters(input: Record<string, unknown>): FrappeFilter[] {
    const filters: FrappeFilter[] = [];
    if (typeof input.status === "string" && input.status.length > 0) {
      filters.push(["status", "=", input.status]);
    }
    if (typeof input.priority === "string" && input.priority.length > 0) {
      filters.push(["priority", "=", input.priority]);
    }
    if (typeof input.customer === "string" && input.customer.length > 0) {
      filters.push(["customer", "=", input.customer]);
    }
    if (typeof input.raised_by === "string" && input.raised_by.length > 0) {
      filters.push(["raised_by", "=", input.raised_by]);
    }
    return filters;
  },
  buildCards(rows: Record<string, unknown>[]): KanbanCard[] {
    return rows.map(buildIssueCard);
  },
  validateTransition(move: KanbanMoveRequest) {
    const match = ISSUE_ALLOWED_TRANSITIONS.find((transition) =>
      transition.fromColumn === move.fromColumn &&
      transition.toColumn === move.toColumn &&
      transition.allowed
    );

    if (!match) {
      return { allowed: false, reason: "Issue transition is not allowed" };
    }

    return { allowed: true };
  },
  async executeMove(move: KanbanMoveRequest, ctx): Promise<KanbanMoveResult> {
    const currentIssue = await ctx.client.get("Issue", move.cardId) as Record<string, unknown>;
    const serverColumn = columnIdForIssueStatus(currentIssue.status);

    if (serverColumn !== move.fromColumn) {
      return {
        ok: false,
        cardId: move.cardId,
        fromColumn: serverColumn,
        toColumn: move.toColumn,
        errorMessage:
          `Issue moved on the server from ${move.fromColumn} to ${serverColumn}. ` +
          "Refresh the board and try again.",
      };
    }

    const validation = this.validateTransition(move);
    if (!validation.allowed) {
      return {
        ok: false,
        cardId: move.cardId,
        fromColumn: move.fromColumn,
        toColumn: move.toColumn,
        errorMessage: validation.reason,
      };
    }

    const status = STATUS_BY_COLUMN.get(move.toColumn);
    if (!status) {
      return {
        ok: false,
        cardId: move.cardId,
        fromColumn: move.fromColumn,
        toColumn: move.toColumn,
        errorMessage: "Unknown Issue column",
      };
    }

    const serverIssue = await ctx.client.update("Issue", move.cardId, { status }) as Record<string, unknown>;

    return {
      ok: true,
      cardId: move.cardId,
      fromColumn: serverColumn,
      toColumn: move.toColumn,
      serverCard: buildIssueCard(serverIssue),
    };
  },
};
