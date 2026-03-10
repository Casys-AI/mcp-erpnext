export interface KanbanBadgeData {
  label: string;
  tone?: "neutral" | "info" | "success" | "warning" | "error";
}

export interface KanbanMetricData {
  label: string;
  value: string;
}

export interface KanbanColumnData {
  id: string;
  label: string;
  color: string;
  count: number;
  totalValue?: number;
}

export interface KanbanCardData {
  id: string;
  title: string;
  subtitle?: string;
  columnId: string;
  accent?: string;
  badges?: KanbanBadgeData[];
  metrics?: KanbanMetricData[];
  pending?: boolean;
}

export interface KanbanTransitionData {
  fromColumn: string;
  toColumn: string;
  allowed: boolean;
  label?: string;
  reason?: string;
}

export interface KanbanPaginationData {
  limit: number;
  offset: number;
  loadedCount: number;
  hasMore: boolean;
  total?: number;
}

export interface KanbanCapabilitiesData {
  canMoveCards: boolean;
}

export interface KanbanBoardData {
  boardId: string;
  title: string;
  doctype: string;
  generatedAt: string;
  moveToolName: string;
  refreshArguments: Record<string, unknown>;
  columns: KanbanColumnData[];
  cards: KanbanCardData[];
  allowedTransitions: KanbanTransitionData[];
  capabilities: KanbanCapabilitiesData;
  pagination: KanbanPaginationData;
}
