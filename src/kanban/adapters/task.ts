import type { FrappeFilter } from "../../api/types.ts";
import type {
  KanbanAdapter,
  KanbanCard,
  KanbanColumn,
  KanbanMoveRequest,
  KanbanMoveResult,
  KanbanTransition,
} from "../types.ts";

const TASK_COLUMNS: Array<{ id: string; label: string; color: string; status: string }> = [
  { id: "open", label: "Open", color: "#60a5fa", status: "Open" },
  { id: "working", label: "Working", color: "#f59e0b", status: "Working" },
  { id: "pending-review", label: "Pending Review", color: "#a78bfa", status: "Pending Review" },
  { id: "overdue", label: "Overdue", color: "#ef4444", status: "Overdue" },
  { id: "completed", label: "Completed", color: "#22c55e", status: "Completed" },
  { id: "cancelled", label: "Cancelled", color: "#78716c", status: "Cancelled" },
];

const STATUS_BY_COLUMN = new Map(TASK_COLUMNS.map((column) => [column.id, column.status]));
const COLUMN_BY_STATUS = new Map(TASK_COLUMNS.map((column) => [column.status, column.id]));
const TASK_LIST_FIELDS = [
  "name",
  "subject",
  "project",
  "status",
  "priority",
  "progress",
];

const TASK_ALLOWED_TRANSITIONS: KanbanTransition[] = [
  { fromColumn: "open", toColumn: "working", allowed: true, label: "Start work" },
  { fromColumn: "open", toColumn: "pending-review", allowed: true },
  { fromColumn: "open", toColumn: "completed", allowed: true },
  { fromColumn: "open", toColumn: "cancelled", allowed: true },
  { fromColumn: "working", toColumn: "open", allowed: true },
  { fromColumn: "working", toColumn: "pending-review", allowed: true, label: "Request review" },
  { fromColumn: "working", toColumn: "completed", allowed: true },
  { fromColumn: "working", toColumn: "cancelled", allowed: true },
  { fromColumn: "pending-review", toColumn: "working", allowed: true, label: "Resume work" },
  { fromColumn: "pending-review", toColumn: "completed", allowed: true, label: "Approve" },
  { fromColumn: "pending-review", toColumn: "open", allowed: true },
  { fromColumn: "pending-review", toColumn: "cancelled", allowed: true },
  { fromColumn: "completed", toColumn: "working", allowed: true, label: "Reopen" },
  { fromColumn: "completed", toColumn: "open", allowed: true },
  { fromColumn: "cancelled", toColumn: "open", allowed: true, label: "Reopen" },
];

function buildTaskCard(row: Record<string, unknown>): KanbanCard {
  const status = String(row.status ?? "Open");
  const columnId = columnIdForTaskStatus(status);
  const priority = typeof row.priority === "string" ? row.priority : undefined;
  const progress = typeof row.progress === "number"
    ? row.progress
    : Number.isFinite(Number(row.progress))
    ? Number(row.progress)
    : undefined;

  return {
    id: String(row.name ?? ""),
    title: String(row.subject ?? row.name ?? "Untitled task"),
    subtitle: typeof row.project === "string" ? row.project : undefined,
    columnId,
    accent: TASK_COLUMNS.find((column) => column.id === columnId)?.color,
    badges: priority ? [{ label: priority, tone: priorityTone(priority) }] : [],
    metrics: progress === undefined ? [] : [{ label: "Progress", value: `${progress}%` }],
  };
}

function priorityTone(priority: string): "neutral" | "warning" | "error" {
  if (priority === "Urgent") return "error";
  if (priority === "High") return "warning";
  return "neutral";
}

function columnIdForTaskStatus(status: unknown): string {
  return COLUMN_BY_STATUS.get(String(status ?? "Open")) ?? "open";
}

export const taskKanbanAdapter: KanbanAdapter = {
  doctype: "Task",
  getColumns(): KanbanColumn[] {
    return TASK_COLUMNS.map((column) => ({
      id: column.id,
      label: column.label,
      color: column.color,
      count: 0,
    }));
  },
  getAllowedTransitions(): KanbanTransition[] {
    return TASK_ALLOWED_TRANSITIONS;
  },
  getListFields(): string[] {
    return TASK_LIST_FIELDS;
  },
  buildListFilters(input: Record<string, unknown>): FrappeFilter[] {
    const filters: FrappeFilter[] = [];
    if (typeof input.project === "string" && input.project.length > 0) {
      filters.push(["project", "=", input.project]);
    }
    if (typeof input.priority === "string" && input.priority.length > 0) {
      filters.push(["priority", "=", input.priority]);
    }
    return filters;
  },
  buildCards(rows: Record<string, unknown>[]): KanbanCard[] {
    return rows.map(buildTaskCard);
  },
  validateTransition(move: KanbanMoveRequest) {
    if (move.toColumn === "overdue") {
      return { allowed: false, reason: "Overdue is system-managed" };
    }

    const match = TASK_ALLOWED_TRANSITIONS.find((transition) =>
      transition.fromColumn === move.fromColumn &&
      transition.toColumn === move.toColumn &&
      transition.allowed
    );

    if (!match) {
      return { allowed: false, reason: "Task transition is not allowed" };
    }

    return { allowed: true };
  },
  async executeMove(
    move: KanbanMoveRequest,
    ctx,
  ): Promise<KanbanMoveResult> {
    const currentTask = await ctx.client.get("Task", move.cardId) as Record<string, unknown>;
    const serverColumn = columnIdForTaskStatus(currentTask.status);

    if (serverColumn !== move.fromColumn) {
      return {
        ok: false,
        cardId: move.cardId,
        fromColumn: serverColumn,
        toColumn: move.toColumn,
        errorMessage:
          `Task moved on the server from ${move.fromColumn} to ${serverColumn}. ` +
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
        errorMessage: "Unknown Task column",
      };
    }

    const serverTask = await ctx.client.update("Task", move.cardId, { status }) as Record<
      string,
      unknown
    >;

    return {
      ok: true,
      cardId: move.cardId,
      fromColumn: serverColumn,
      toColumn: move.toColumn,
      serverCard: buildTaskCard(serverTask),
    };
  },
};
