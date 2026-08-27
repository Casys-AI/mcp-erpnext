import type { KanbanBoardData } from "../../shared/kanban/types.ts";

/**
 * Forme étendue du tableau en fixture : même que KanbanBoardData mais avec
 * `_sendMessageHints` pour tester l'affichage des sauts de navigation.
 * Le champ est injecté par withUiRefreshRequest en production.
 */
type KanbanFixtureHint = {
  key?: string;
  label: string;
  message?: string;
  tool?: string;
  args?: Record<string, unknown>;
  kind?: "list" | "record" | "chart";
};

type KanbanFixture = KanbanBoardData & {
  _sendMessageHints?: KanbanFixtureHint[];
};

/** Mock payload so the bundled HTML can be opened without a host. */
export const KANBAN_FIXTURE: KanbanFixture = {
  boardId: "task-board",
  title: "Task Board",
  doctype: "Task",
  generatedAt: "2026-03-06T00:00:00.000Z",
  moveToolName: "erpnext_kanban_move_card",
  refreshArguments: { doctype: "Task", limit: 50, offset: 0 },
  columns: [
    { id: "open", label: "Open", color: "#60a5fa", count: 2 },
    { id: "working", label: "Working", color: "#f59e0b", count: 1 },
    {
      id: "pending-review",
      label: "Pending Review",
      color: "#a78bfa",
      count: 1,
    },
    { id: "completed", label: "Completed", color: "#22c55e", count: 1 },
  ],
  cards: [
    {
      id: "TASK-0001",
      title: "Draft protocol",
      subtitle: "Alpha",
      columnId: "open",
      accent: "#60a5fa",
      badges: [
        { label: "High", tone: "error" },
        { label: "Overdue", tone: "error" },
      ],
      metrics: [
        { label: "Progress", value: "20%" },
        { label: "Due", value: "Jan 1" },
        { label: "Est.", value: "8h" },
      ],
      description: "Write the qualification protocol for the Q1 batch.",
      dueDate: "2025-01-01",
      assignee: "alice@example.com",
    },
    {
      id: "TASK-0002",
      title: "Collect supplier quotes",
      subtitle: "Alpha",
      columnId: "open",
      accent: "#60a5fa",
      badges: [{ label: "Medium", tone: "warning" }],
      metrics: [{ label: "Progress", value: "0%" }, {
        label: "Due",
        value: "Jun 15",
      }],
      description: "Three vendors, same BOM.",
      dueDate: "2026-06-15",
    },
    {
      id: "TASK-0003",
      title: "Machine setup",
      subtitle: "Beta",
      columnId: "working",
      accent: "#f59e0b",
      badges: [
        { label: "Urgent", tone: "error" },
        { label: "Milestone", tone: "info" },
      ],
      metrics: [
        { label: "Progress", value: "55%" },
        { label: "Actual", value: "6h" },
      ],
      description: "Changeover for the new fixture plate.",
      assignee: "bob@example.com",
    },
    {
      id: "TASK-0004",
      title: "QA review",
      subtitle: "Alpha",
      columnId: "pending-review",
      accent: "#a78bfa",
      badges: [{ label: "Low", tone: "success" }],
      metrics: [{ label: "Progress", value: "90%" }],
      assignee: "carol@example.com",
    },
    {
      id: "TASK-0005",
      title: "Close Q1 books",
      subtitle: "Finance",
      columnId: "completed",
      accent: "#22c55e",
      badges: [{ label: "Medium", tone: "warning" }],
      metrics: [{ label: "Progress", value: "100%" }],
    },
  ],
  allowedTransitions: [
    {
      fromColumn: "open",
      toColumn: "working",
      allowed: true,
      label: "Start work",
    },
    { fromColumn: "open", toColumn: "pending-review", allowed: true },
    { fromColumn: "open", toColumn: "completed", allowed: true },
    { fromColumn: "working", toColumn: "open", allowed: true },
    {
      fromColumn: "working",
      toColumn: "pending-review",
      allowed: true,
      label: "Request review",
    },
    { fromColumn: "working", toColumn: "completed", allowed: true },
    {
      fromColumn: "pending-review",
      toColumn: "working",
      allowed: true,
      label: "Resume work",
    },
    {
      fromColumn: "pending-review",
      toColumn: "completed",
      allowed: true,
      label: "Approve",
    },
    {
      fromColumn: "completed",
      toColumn: "working",
      allowed: true,
      label: "Reopen",
    },
    { fromColumn: "completed", toColumn: "open", allowed: true },
  ],
  capabilities: { canMoveCards: true },
  pagination: {
    limit: 50,
    offset: 0,
    loadedCount: 5,
    hasMore: false,
    total: 5,
  },
  /**
   * Copie de DOCTYPE_SEND_MESSAGE_HINTS["Task"] — injectée par withUiRefreshRequest
   * en production, simulée ici pour que les sauts de navigation s'affichent
   * en mode fixture (les outils sont désactivés, les boutons ne font rien).
   */
  _sendMessageHints: [
    {
      key: "timesheets",
      label: "Timesheets",
      message: "Show timesheets for task {id}",
      tool: "erpnext_doc_list",
      args: {
        doctype: "Timesheet",
        fields: ["name", "employee", "start_date", "total_hours", "status"],
        filters: [["Timesheet Detail", "task", "=", "{id}"]],
        limit: 20,
      },
    },
  ],
};

export const KANBAN_FIXTURE_DETAILS: Record<string, Record<string, unknown>> = {
  "TASK-0001": {
    name: "TASK-0001",
    subject: "Draft protocol",
    status: "Open",
    priority: "High",
    project: "Alpha",
    progress: 20,
    description: "Write the qualification protocol for the Q1 batch.",
    exp_start_date: "2025-12-01",
    exp_end_date: "2025-01-01",
    expected_time: 8,
    actual_time: 1.5,
    duration: 2,
    task_weight: 4,
    total_costing_amount: 640,
    total_billing_amount: 920,
    company: "Casys Industries",
    is_milestone: 0,
    _assign: '["alice@example.com"]',
  },
  "TASK-0002": {
    name: "TASK-0002",
    subject: "Collect supplier quotes",
    status: "Open",
    priority: "Medium",
    project: "Alpha",
    progress: 0,
    description: "Three vendors, same BOM.",
    exp_end_date: "2026-06-15",
    _assign: "[]",
  },
  "TASK-0003": {
    name: "TASK-0003",
    subject: "Machine setup",
    status: "Working",
    priority: "Urgent",
    project: "Beta",
    progress: 55,
    description: "Changeover for the new fixture plate.",
    expected_time: 12,
    actual_time: 6,
    is_milestone: 1,
    _assign: '["bob@example.com"]',
  },
  "TASK-0004": {
    name: "TASK-0004",
    subject: "QA review",
    status: "Pending Review",
    priority: "Low",
    project: "Alpha",
    progress: 90,
    _assign: '["carol@example.com"]',
  },
  "TASK-0005": {
    name: "TASK-0005",
    subject: "Close Q1 books",
    status: "Completed",
    priority: "Medium",
    project: "Finance",
    progress: 100,
    _assign: "[]",
  },
};

export const KANBAN_FIXTURE_USERS: Array<{ name: string; full_name?: string }> =
  [
    { name: "alice@example.com", full_name: "Alice Martin" },
    { name: "bob@example.com", full_name: "Bob Nguyen" },
    { name: "carol@example.com", full_name: "Carol Singh" },
  ];

export function isFixtureMode(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(globalThis.location.search).has("fixture");
}
