import type { FrappeFilter } from "../../api/types.ts";
import type {
  KanbanAdapter,
  KanbanCard,
  KanbanColumn,
  KanbanMoveRequest,
  KanbanMoveResult,
  KanbanTransition,
} from "../types.ts";

const OPPORTUNITY_COLUMNS: Array<{ id: string; label: string; color: string; status: string }> = [
  { id: "open", label: "Open", color: "#60a5fa", status: "Open" },
  { id: "replied", label: "Replied", color: "#f59e0b", status: "Replied" },
  { id: "quotation", label: "Quotation", color: "#a78bfa", status: "Quotation" },
  { id: "converted", label: "Converted", color: "#22c55e", status: "Converted" },
  { id: "closed", label: "Closed", color: "#64748b", status: "Closed" },
  { id: "lost", label: "Lost", color: "#ef4444", status: "Lost" },
];

const STATUS_BY_COLUMN = new Map(OPPORTUNITY_COLUMNS.map((column) => [column.id, column.status]));
const COLUMN_BY_STATUS = new Map(OPPORTUNITY_COLUMNS.map((column) => [column.status, column.id]));

const OPPORTUNITY_LIST_FIELDS = [
  "name",
  "title",
  "opportunity_from",
  "party_name",
  "status",
  "opportunity_amount",
  "currency",
  "probability",
  "opportunity_owner",
];

const OPPORTUNITY_ALLOWED_TRANSITIONS: KanbanTransition[] = [
  { fromColumn: "open", toColumn: "replied", allowed: true, label: "Reply" },
  { fromColumn: "open", toColumn: "quotation", allowed: true, label: "Send quotation" },
  { fromColumn: "open", toColumn: "converted", allowed: true, label: "Convert" },
  { fromColumn: "open", toColumn: "closed", allowed: true, label: "Close" },
  { fromColumn: "open", toColumn: "lost", allowed: true, label: "Mark lost" },
  { fromColumn: "replied", toColumn: "open", allowed: true, label: "Reopen" },
  { fromColumn: "replied", toColumn: "quotation", allowed: true, label: "Send quotation" },
  { fromColumn: "replied", toColumn: "converted", allowed: true, label: "Convert" },
  { fromColumn: "replied", toColumn: "closed", allowed: true, label: "Close" },
  { fromColumn: "replied", toColumn: "lost", allowed: true, label: "Mark lost" },
  { fromColumn: "quotation", toColumn: "open", allowed: true, label: "Reopen" },
  { fromColumn: "quotation", toColumn: "replied", allowed: true, label: "Resume conversation" },
  { fromColumn: "quotation", toColumn: "converted", allowed: true, label: "Convert" },
  { fromColumn: "quotation", toColumn: "closed", allowed: true, label: "Close" },
  { fromColumn: "quotation", toColumn: "lost", allowed: true, label: "Mark lost" },
  { fromColumn: "converted", toColumn: "open", allowed: true, label: "Reopen" },
  { fromColumn: "converted", toColumn: "closed", allowed: true, label: "Close" },
  { fromColumn: "closed", toColumn: "open", allowed: true, label: "Reopen" },
  { fromColumn: "closed", toColumn: "replied", allowed: true, label: "Resume" },
  { fromColumn: "lost", toColumn: "open", allowed: true, label: "Reopen" },
  { fromColumn: "lost", toColumn: "replied", allowed: true, label: "Resume" },
];

function columnIdForOpportunityStatus(status: unknown): string {
  return COLUMN_BY_STATUS.get(String(status ?? "Open")) ?? "open";
}

function formatOpportunityAmount(amount: unknown, currency: unknown): string | null {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return null;
  const currencyCode = typeof currency === "string" && currency.length > 0 ? currency : "Amount";
  return `${currencyCode} ${numeric}`;
}

function buildOpportunityCard(row: Record<string, unknown>): KanbanCard {
  const status = String(row.status ?? "Open");
  const columnId = columnIdForOpportunityStatus(status);
  const amountValue = formatOpportunityAmount(row.opportunity_amount, row.currency);
  const probability = Number(row.probability);
  const probabilityValue = Number.isFinite(probability) ? `${probability}%` : null;
  const title = typeof row.title === "string" && row.title.length > 0
    ? row.title
    : typeof row.party_name === "string" && row.party_name.length > 0
    ? row.party_name
    : String(row.name ?? "Untitled opportunity");

  return {
    id: String(row.name ?? ""),
    title,
    subtitle: typeof row.party_name === "string" ? row.party_name : undefined,
    columnId,
    accent: OPPORTUNITY_COLUMNS.find((column) => column.id === columnId)?.color,
    badges: typeof row.opportunity_from === "string" && row.opportunity_from.length > 0
      ? [{ label: row.opportunity_from, tone: "neutral" }]
      : [],
    metrics: [
      ...(amountValue ? [{ label: "Amount", value: amountValue }] : []),
      ...(probabilityValue ? [{ label: "Probability", value: probabilityValue }] : []),
    ],
  };
}

export const opportunityKanbanAdapter: KanbanAdapter = {
  doctype: "Opportunity",
  getColumns(): KanbanColumn[] {
    return OPPORTUNITY_COLUMNS.map((column) => ({
      id: column.id,
      label: column.label,
      color: column.color,
      count: 0,
    }));
  },
  getAllowedTransitions(): KanbanTransition[] {
    return OPPORTUNITY_ALLOWED_TRANSITIONS;
  },
  getListFields(): string[] {
    return OPPORTUNITY_LIST_FIELDS;
  },
  buildListFilters(input: Record<string, unknown>): FrappeFilter[] {
    const filters: FrappeFilter[] = [];
    if (typeof input.status === "string" && input.status.length > 0) {
      filters.push(["status", "=", input.status]);
    }
    if (typeof input.opportunity_owner === "string" && input.opportunity_owner.length > 0) {
      filters.push(["opportunity_owner", "=", input.opportunity_owner]);
    }
    if (typeof input.party_name === "string" && input.party_name.length > 0) {
      filters.push(["party_name", "=", input.party_name]);
    }
    return filters;
  },
  buildCards(rows: Record<string, unknown>[]): KanbanCard[] {
    return rows.map(buildOpportunityCard);
  },
  validateTransition(move: KanbanMoveRequest) {
    const match = OPPORTUNITY_ALLOWED_TRANSITIONS.find((transition) =>
      transition.fromColumn === move.fromColumn &&
      transition.toColumn === move.toColumn &&
      transition.allowed
    );

    if (!match) {
      return { allowed: false, reason: "Opportunity transition is not allowed" };
    }

    return { allowed: true };
  },
  async executeMove(move: KanbanMoveRequest, ctx): Promise<KanbanMoveResult> {
    const currentOpportunity = await ctx.client.get("Opportunity", move.cardId) as Record<string, unknown>;
    const serverColumn = columnIdForOpportunityStatus(currentOpportunity.status);

    if (serverColumn !== move.fromColumn) {
      return {
        ok: false,
        cardId: move.cardId,
        fromColumn: serverColumn,
        toColumn: move.toColumn,
        errorMessage:
          `Opportunity moved on the server from ${move.fromColumn} to ${serverColumn}. ` +
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
        errorMessage: "Unknown Opportunity column",
      };
    }

    const serverOpportunity = await ctx.client.update("Opportunity", move.cardId, {
      status,
    }) as Record<string, unknown>;

    return {
      ok: true,
      cardId: move.cardId,
      fromColumn: serverColumn,
      toColumn: move.toColumn,
      serverCard: buildOpportunityCard(serverOpportunity),
    };
  },
};
