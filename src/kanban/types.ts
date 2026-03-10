import type { FrappeFilter } from "../api/types.ts";
import type { ErpNextToolContext } from "../tools/types.ts";

export interface KanbanBadge {
  label: string;
  tone?: "neutral" | "info" | "success" | "warning" | "error";
}

export interface KanbanMetric {
  label: string;
  value: string;
}

export interface KanbanColumn {
  id: string;
  label: string;
  color: string;
  count: number;
  totalValue?: number;
}

export interface KanbanCard {
  id: string;
  title: string;
  subtitle?: string;
  columnId: string;
  accent?: string;
  badges?: KanbanBadge[];
  metrics?: KanbanMetric[];
  pending?: boolean;
}

export interface KanbanTransition {
  fromColumn: string;
  toColumn: string;
  allowed: boolean;
  label?: string;
  reason?: string;
}

export interface KanbanPagination {
  limit: number;
  offset: number;
  loadedCount: number;
  hasMore: boolean;
  total?: number;
}

export interface KanbanBoardCapabilities {
  canMoveCards: boolean;
}

export interface KanbanBoard {
  boardId: string;
  title: string;
  doctype: string;
  generatedAt: string;
  moveToolName: string;
  refreshArguments: Record<string, unknown>;
  columns: KanbanColumn[];
  cards: KanbanCard[];
  allowedTransitions: KanbanTransition[];
  capabilities: KanbanBoardCapabilities;
  pagination: KanbanPagination;
}

export interface KanbanMoveRequest {
  doctype: string;
  cardId: string;
  fromColumn: string;
  toColumn: string;
}

export interface KanbanMoveResult {
  ok: boolean;
  cardId: string;
  fromColumn: string;
  toColumn: string;
  errorMessage?: string;
  serverCard?: KanbanCard;
}

export interface KanbanTransitionValidation {
  allowed: boolean;
  reason?: string;
}

export interface KanbanAdapter {
  doctype: string;
  getColumns(): KanbanColumn[];
  getAllowedTransitions(): KanbanTransition[];
  getListFields(): string[];
  buildListFilters(input: Record<string, unknown>): FrappeFilter[];
  buildCards(rows: Record<string, unknown>[]): KanbanCard[];
  validateTransition(move: KanbanMoveRequest): KanbanTransitionValidation;
  executeMove(
    move: KanbanMoveRequest,
    ctx: ErpNextToolContext,
  ): Promise<KanbanMoveResult>;
}

export interface KanbanBoardDefinition {
  doctype: string;
  title: string;
  adapterKey: string;
  moveToolName: string;
}
