import { getKanbanBoardDefinition } from "../kanban/definitions.ts";
import { taskKanbanAdapter } from "../kanban/adapters/task.ts";
import { opportunityKanbanAdapter } from "../kanban/adapters/opportunity.ts";
import { issueKanbanAdapter } from "../kanban/adapters/issue.ts";
import type {
  KanbanAdapter,
  KanbanBoard,
  KanbanCard,
  KanbanColumn,
} from "../kanban/types.ts";
import type { ErpNextTool } from "./types.ts";

const KANBAN_UI = { ui: { resourceUri: "ui://mcp-erpnext/kanban-viewer" } };

const ADAPTERS: Record<string, KanbanAdapter> = {
  task: taskKanbanAdapter,
  opportunity: opportunityKanbanAdapter,
  issue: issueKanbanAdapter,
};

function getAdapter(doctype: string): { definition: NonNullable<ReturnType<typeof getKanbanBoardDefinition>>; adapter: KanbanAdapter } {
  const definition = getKanbanBoardDefinition(doctype);
  if (!definition) {
    throw new Error(`[erpnext_kanban] Unsupported kanban doctype: ${doctype}`);
  }
  const adapter = ADAPTERS[definition.adapterKey];
  if (!adapter) {
    throw new Error(`[erpnext_kanban] No adapter registered for ${doctype}`);
  }
  return { definition, adapter };
}

function withColumnCounts(columns: KanbanColumn[], cards: KanbanCard[]): KanbanColumn[] {
  const counts = new Map<string, number>();
  for (const card of cards) {
    counts.set(card.columnId, (counts.get(card.columnId) ?? 0) + 1);
  }
  return columns.map((column) => ({
    ...column,
    count: counts.get(column.id) ?? 0,
  }));
}

export const kanbanTools: ErpNextTool[] = [
  {
    name: "erpnext_kanban_get_board",
    category: "kanban",
    _meta: KANBAN_UI,
    description:
      "Get a normalized kanban board for a supported ERPNext DocType. " +
      "Supports Task, Opportunity, and Issue, with pagination and MCP App metadata.",
    inputSchema: {
      type: "object",
      properties: {
        doctype: {
          type: "string",
          description: "Kanban-enabled ERPNext DocType",
          enum: ["Task", "Opportunity", "Issue"],
        },
        limit: { type: "number", description: "Page size (default 50)" },
        offset: { type: "number", description: "Pagination offset (default 0)" },
        project: { type: "string", description: "Optional Task project filter" },
        priority: {
          type: "string",
          description: "Optional Task priority filter",
          enum: ["Low", "Medium", "High", "Urgent"],
        },
        status: {
          type: "string",
          description: "Optional Opportunity status filter",
          enum: ["Open", "Replied", "Quotation", "Converted", "Closed", "Lost"],
        },
        opportunity_owner: {
          type: "string",
          description: "Optional Opportunity owner filter",
        },
        party_name: {
          type: "string",
          description: "Optional Opportunity party filter",
        },
        customer: {
          type: "string",
          description: "Optional Issue customer filter",
        },
        raised_by: {
          type: "string",
          description: "Optional Issue reporter email filter",
        },
      },
      required: ["doctype"],
    },
    handler: async (input, ctx) => {
      const doctype = String(input.doctype ?? "");
      const { definition, adapter } = getAdapter(doctype);
      const limit = Math.max(1, Number(input.limit ?? 50));
      const offset = Math.max(0, Number(input.offset ?? 0));

      const rows = await ctx.client.list(doctype, {
        fields: adapter.getListFields(),
        filters: adapter.buildListFilters(input),
        limit: limit + 1,
        limit_start: offset,
        order_by: "modified desc",
      });

      const hasMore = rows.length > limit;
      const visibleRows = rows.slice(0, limit) as Record<string, unknown>[];
      const cards = adapter.buildCards(visibleRows);

      const board: KanbanBoard = {
        boardId: `${doctype.toLowerCase()}-board`,
        title: definition.title,
        doctype,
        generatedAt: new Date().toISOString(),
        moveToolName: definition.moveToolName,
        refreshArguments: { ...input, doctype, limit, offset },
        columns: withColumnCounts(adapter.getColumns(), cards),
        cards,
        allowedTransitions: adapter.getAllowedTransitions(),
        capabilities: { canMoveCards: true },
        pagination: {
          limit,
          offset,
          loadedCount: offset + visibleRows.length,
          hasMore,
        },
      };

      return {
        ...board,
        _meta: KANBAN_UI,
      };
    },
  },
  {
    name: "erpnext_kanban_move_card",
    category: "kanban",
    description:
      "Move a kanban card for a supported ERPNext DocType. " +
      "Returns structured success or business error details for MCP App reconciliation.",
    inputSchema: {
      type: "object",
      properties: {
        doctype: {
          type: "string",
          description: "Kanban-enabled ERPNext DocType",
          enum: ["Task", "Opportunity", "Issue"],
        },
        card_id: { type: "string", description: "Card/document identifier" },
        from_column: { type: "string", description: "Source column identifier" },
        to_column: { type: "string", description: "Destination column identifier" },
      },
      required: ["doctype", "card_id", "from_column", "to_column"],
    },
    handler: async (input, ctx) => {
      const doctype = String(input.doctype ?? "");
      const { adapter } = getAdapter(doctype);
      return await adapter.executeMove({
        doctype,
        cardId: String(input.card_id ?? ""),
        fromColumn: String(input.from_column ?? ""),
        toColumn: String(input.to_column ?? ""),
      }, ctx);
    },
  },
];
