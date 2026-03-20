import { useEffect, useRef, useState, useCallback, type CSSProperties, type DragEvent, type ReactNode, type HTMLAttributes } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { colors, fonts, styles } from "~/shared/theme";
import { ErpNextBrandHeader } from "~/shared/ErpNextBrand";
import {
  formatBoardSummary,
  getErrorPresentation,
  normalizeMoveFailureMessage,
} from "~/shared/kanban/presentation";
import { useKanbanBoard } from "~/shared/kanban/useKanbanBoard";
import type { KanbanBoardData, KanbanCardData, KanbanColumnData } from "~/shared/kanban/types";
import {
  applyOptimisticMove,
  canDropCardInColumn,
  enqueueMove,
  reconcileMoveSuccess,
  rollbackMoveFailure,
  takeNextQueuedMove,
  type QueuedKanbanMove,
} from "~/shared/kanban/interactions";
import {
  canRequestBoardRefresh,
  resolveKanbanRefreshRequest,
  type KanbanRefreshRequestData,
} from "~/shared/kanban/refresh";
import {
  shouldUseKanbanColumnFocus,
  clampKanbanFocusIndex,
} from "~/shared/kanban/layout";

const app = new App({ name: "Kanban Viewer", version: "1.0.0" });
const AUTO_REFRESH_INTERVAL_MS = 15_000;
const TOOL_CALL_TIMEOUT_MS = 10_000;

function hiddenLiveRegionStyle(): CSSProperties {
  return {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    clip: "rect(0, 0, 0, 0)",
    whiteSpace: "nowrap",
    border: 0,
  };
}

function extractTextContent(result: { content?: Array<{ type: string; text?: string }> }): string | null {
  return result.content?.find((item) => item.type === "text")?.text ?? null;
}

function DragScrollContainer({
  children,
  style,
  ...rest
}: { children: ReactNode; style?: CSSProperties } & HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  const dragState = useRef({ active: false, startX: 0, scrollLeft: 0 });
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateFades = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    updateFades();
    const observer = new ResizeObserver(updateFades);
    observer.observe(el);
    return () => observer.disconnect();
  }, [updateFades]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    dragState.current = { active: true, startX: e.clientX, scrollLeft: el.scrollLeft };
    el.style.cursor = "grabbing";
    el.style.userSelect = "none";
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragState.current.active) return;
    const el = ref.current;
    if (!el) return;
    const delta = e.clientX - dragState.current.startX;
    el.scrollLeft = dragState.current.scrollLeft - delta;
    updateFades();
  }, [updateFades]);

  const onMouseUp = useCallback(() => {
    dragState.current.active = false;
    const el = ref.current;
    if (el) {
      el.style.cursor = "grab";
      el.style.userSelect = "";
    }
  }, []);

  const maskImage = canScrollLeft && canScrollRight
    ? "linear-gradient(to right, transparent, black 24px, black calc(100% - 24px), transparent)"
    : canScrollRight
    ? "linear-gradient(to right, black calc(100% - 24px), transparent)"
    : canScrollLeft
    ? "linear-gradient(to right, transparent, black 24px)"
    : undefined;

  return (
    <div
      ref={ref}
      style={{ ...style, WebkitMaskImage: maskImage, maskImage }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onScroll={updateFades}
      className="drag-scroll"
      {...rest}
    >
      {children}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", overflowX: "auto" }}>
        {[1, 2, 3].map((column) => (
          <div
            key={column}
            style={{
              minWidth: 240,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div className="skeleton" style={{ height: 36, width: "100%" }} />
            {[1, 2, 3].map((card) => (
              <div key={card} className="skeleton" style={{ height: 72, width: "100%" }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        padding: "36px 20px",
        textAlign: "center",
        color: colors.text.muted,
        fontFamily: fonts.sans,
        fontSize: 13,
      }}
    >
      No kanban data available
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div
      style={{
        margin: 16,
        ...styles.card,
        borderColor: colors.error,
        color: colors.error,
        fontSize: 13,
      }}
    >
      {message}
    </div>
  );
}

function badgeToneColors(tone?: string): { color: string; bg: string } {
  switch (tone) {
    case "error":
      return { color: colors.error, bg: colors.errorDim };
    case "warning":
      return { color: colors.warning, bg: colors.warningDim };
    case "success":
      return { color: colors.success, bg: colors.successDim };
    case "info":
      return { color: colors.info, bg: colors.infoDim };
    default:
      return { color: colors.text.secondary, bg: colors.bg.elevated };
  }
}

function KanbanCard({
  card,
  allowedTargets,
  onMove,
  onDragStart,
  onDragEnd,
  enableDrag = true,
}: {
  card: KanbanCardData;
  allowedTargets: Array<{ columnId: string; label: string; color?: string }>;
  onMove: (card: KanbanCardData, toColumn: string, label: string) => void;
  onDragStart: (card: KanbanCardData, event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  enableDrag?: boolean;
}) {
  const isDraggable = enableDrag && !card.pending;
  const accentColor = card.accent ?? colors.accent;

  const cardStyle: CSSProperties = {
    background: colors.bg.surface,
    border: `1px solid ${card.pending ? colors.accent : colors.border}`,
    borderRadius: 8,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    opacity: card.pending ? 0.72 : 1,
    boxShadow: card.pending
      ? `0 0 0 1px ${colors.accentDim}`
      : `0 1px 3px rgba(0,0,0,0.06)`,
    cursor: isDraggable ? "grab" : undefined,
    overflow: "hidden",
    position: "relative" as const,
  };

  const hasMetrics = (card.metrics?.length ?? 0) > 0;
  const hasBadges = (card.badges?.length ?? 0) > 0;

  return (
    <article
      style={cardStyle}
      draggable={isDraggable}
      onDragStart={isDraggable ? (event) => onDragStart(card, event) : undefined}
      onDragEnd={isDraggable ? onDragEnd : undefined}
      className={card.pending ? "animate-pulse" : undefined}
      aria-busy={card.pending}
    >
      {/* Accent strip */}
      <div
        aria-hidden="true"
        style={{
          height: 4,
          background: accentColor,
          flexShrink: 0,
          opacity: card.pending ? 0.5 : 0.85,
        }}
      />

      {/* Card body */}
      <div style={{ padding: "10px 12px 0", display: "flex", flexDirection: "column", gap: 6 }}>
        {/* Header row: title + badges */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: colors.text.primary,
                lineHeight: 1.35,
                overflow: "hidden",
                textOverflow: "ellipsis",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical" as const,
              }}
            >
              {card.title}
            </div>
            {card.subtitle && (
              <div
                style={{
                  fontSize: 11,
                  color: colors.text.muted,
                  marginTop: 2,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {card.subtitle}
              </div>
            )}
          </div>
          {hasBadges && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, flexShrink: 0 }}>
              {card.badges?.map((badge) => {
                const tone = badgeToneColors(badge.tone);
                return (
                  <span
                    key={`${card.id}-${badge.label}`}
                    style={{
                      ...styles.badge(tone.color, tone.bg),
                      fontSize: 10,
                      padding: "1px 7px",
                      borderRadius: 3,
                      fontWeight: 700,
                      letterSpacing: "0.03em",
                      textTransform: "uppercase" as const,
                    }}
                  >
                    {badge.label}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Metrics row */}
        {hasMetrics && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              padding: "4px 0 2px",
              borderTop: `1px solid ${colors.borderSubtle}`,
            }}
          >
            {card.metrics?.map((metric) => (
              <div
                key={`${card.id}-${metric.label}`}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 1,
                }}
              >
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 600,
                    color: colors.text.faint,
                    textTransform: "uppercase" as const,
                    letterSpacing: "0.06em",
                  }}
                >
                  {metric.label}
                </span>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: colors.text.primary,
                    fontFamily: fonts.mono,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {metric.value}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action buttons */}
      {allowedTargets.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 0,
            borderTop: `1px solid ${colors.borderSubtle}`,
            marginTop: hasMetrics ? 0 : 6,
          }}
        >
          {allowedTargets.map((target, index) => (
            <button
              key={`${card.id}-${target.columnId}`}
              type="button"
              onClick={() => onMove(card, target.columnId, target.label)}
              disabled={card.pending}
              style={{
                flex: 1,
                minWidth: 0,
                padding: "7px 6px",
                fontSize: 11,
                fontWeight: 500,
                fontFamily: fonts.sans,
                color: colors.text.muted,
                background: "transparent",
                border: "none",
                borderRight: index < allowedTargets.length - 1
                  ? `1px solid ${colors.borderSubtle}`
                  : "none",
                cursor: card.pending ? "default" : "pointer",
                opacity: card.pending ? 0.5 : 1,
                transition: "color 0.12s, background 0.12s",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                outlineOffset: -2,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 5,
              }}
              aria-label={`Move ${card.title} to ${target.label}`}
            >
              {target.color && (
                <span
                  aria-hidden="true"
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: target.color,
                    flexShrink: 0,
                  }}
                />
              )}
              {target.label}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}

function KanbanColumn({
  column,
  cards,
  board,
  activeDropColumn,
  onMove,
  onDropCard,
  onDragStart,
  onDragEnd,
  onDragOverColumn,
}: {
  column: KanbanColumnData;
  cards: KanbanCardData[];
  board: KanbanBoardData;
  activeDropColumn: string | null;
  onMove: (card: KanbanCardData, toColumn: string, label: string) => void;
  onDropCard: (toColumn: string, event: DragEvent<HTMLElement>) => void;
  onDragStart: (card: KanbanCardData, event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  onDragOverColumn: (columnId: string, event: DragEvent<HTMLElement>) => void;
}) {
  const availableTargets = (card: KanbanCardData) =>
    board.allowedTransitions
      .filter((transition) =>
        transition.allowed &&
        transition.fromColumn === card.columnId &&
        transition.toColumn !== card.columnId
      )
      .map((transition) => {
        const targetCol = board.columns.find((candidate) => candidate.id === transition.toColumn);
        return {
          columnId: transition.toColumn,
          label: transition.label ?? targetCol?.label ?? transition.toColumn,
          color: targetCol?.color,
        };
      });

  return (
    <section
      style={{
        minWidth: 260,
        maxWidth: 320,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
      onDragOver={(event) => onDragOverColumn(column.id, event)}
      onDrop={(event) => onDropCard(column.id, event)}
    >
      <header
        style={{
          ...styles.card,
          padding: "10px 12px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          borderColor: activeDropColumn === column.id ? colors.accent : colors.border,
          background: activeDropColumn === column.id ? colors.accentDim : colors.bg.surface,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: column.color,
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 12, fontWeight: 700, color: colors.text.primary, flex: 1 }}>
          {column.label}
        </span>
        <span style={{ ...styles.badge(column.color, `${column.color}20`) }}>{column.count}</span>
      </header>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {cards.map((card) => (
          <KanbanCard
            key={card.id}
            card={card}
            allowedTargets={availableTargets(card)}
            onMove={onMove}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />
        ))}
      </div>
    </section>
  );
}

function ColumnTabs({
  columns,
  focusIndex,
  onSelect,
}: {
  columns: KanbanColumnData[];
  focusIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <DragScrollContainer
      style={{
        display: "flex",
        gap: 4,
        overflowX: "auto",
        minWidth: 0,
        cursor: "grab",
      }}
      role="tablist"
      aria-label="Kanban columns"
    >
      {columns.map((column, index) => {
        const isActive = index === focusIndex;
        return (
          <button
            key={column.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`kanban-panel-${column.id}`}
            onClick={() => onSelect(index)}
            style={{
              ...styles.button,
              padding: "7px 14px 6px",
              fontSize: 12,
              fontWeight: isActive ? 700 : 500,
              color: isActive ? colors.text.primary : colors.text.muted,
              background: isActive ? colors.bg.surface : "transparent",
              borderColor: isActive ? "transparent" : colors.border,
              borderBottomWidth: 2,
              borderBottomColor: isActive ? column.color : "transparent",
              borderRadius: isActive ? "6px 6px 0 0" : "6px",
              display: "flex",
              alignItems: "center",
              gap: 6,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: column.color,
                flexShrink: 0,
              }}
            />
            {column.label}
            <span
              style={{
                ...styles.badge(
                  isActive ? colors.text.primary : colors.text.muted,
                  isActive ? `${column.color}30` : `${colors.text.muted}15`
                ),
                fontSize: 10,
              }}
            >
              {column.count}
            </span>
          </button>
        );
      })}
    </DragScrollContainer>
  );
}

function BoardView({
  board,
  inlineError,
  activeDropColumn,
  onMove,
  onDropCard,
  onDragStart,
  onDragEnd,
  onDragOverColumn,
}: {
  board: KanbanBoardData;
  inlineError: string | null;
  activeDropColumn: string | null;
  onMove: (card: KanbanCardData, toColumn: string, label: string) => void;
  onDropCard: (toColumn: string, event: React.DragEvent<HTMLElement>) => void;
  onDragStart: (card: KanbanCardData, event: React.DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  onDragOverColumn: (columnId: string, event: React.DragEvent<HTMLElement>) => void;
}) {
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1200
  );
  const [focusIndex, setFocusIndex] = useState(0);

  useEffect(() => {
    function handleResize() {
      setViewportWidth(window.innerWidth);
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const useFocusMode = shouldUseKanbanColumnFocus(viewportWidth, board.columns.length);
  const safeFocusIndex = clampKanbanFocusIndex(focusIndex, board.columns.length);
  const focusedColumn = useFocusMode ? board.columns[safeFocusIndex] : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: colors.bg.root, overflowX: "hidden", width: "100%" }}>
      <ErpNextBrandHeader />
      <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: colors.text.primary }}>
            {board.title}
          </div>
          <div style={{ fontSize: 11, color: colors.text.muted }}>
            {formatBoardSummary(board)}
          </div>
        </div>

        {inlineError && <ErrorState message={inlineError} />}

        {useFocusMode ? (
          <>
            <ColumnTabs
              columns={board.columns}
              focusIndex={safeFocusIndex}
              onSelect={setFocusIndex}
            />
            {focusedColumn && (
              <div
                id={`kanban-panel-${focusedColumn.id}`}
                role="tabpanel"
                aria-label={focusedColumn.label}
                style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}
              >
                {board.cards
                  .filter((card) => card.columnId === focusedColumn.id)
                  .map((card) => {
                    const availableTargets = board.allowedTransitions
                      .filter(
                        (t) =>
                          t.allowed &&
                          t.fromColumn === card.columnId &&
                          t.toColumn !== card.columnId
                      )
                      .map((t) => {
                        const targetCol = board.columns.find((c) => c.id === t.toColumn);
                        return {
                          columnId: t.toColumn,
                          label: t.label ?? targetCol?.label ?? t.toColumn,
                          color: targetCol?.color,
                        };
                      });
                    return (
                      <KanbanCard
                        key={card.id}
                        card={card}
                        allowedTargets={availableTargets}
                        onMove={onMove}
                        onDragStart={onDragStart}
                        onDragEnd={onDragEnd}
                        enableDrag={false}
                      />
                    );
                  })}
                {board.cards.filter((card) => card.columnId === focusedColumn.id).length === 0 && (
                  <div
                    style={{
                      padding: "20px 12px",
                      textAlign: "center",
                      fontSize: 12,
                      color: colors.text.muted,
                    }}
                  >
                    No cards in {focusedColumn.label}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start", overflowX: "auto", paddingBottom: 8 }}>
            {board.columns.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                board={board}
                cards={board.cards.filter((card) => card.columnId === column.id)}
                activeDropColumn={activeDropColumn}
                onMove={onMove}
                onDropCard={onDropCard}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onDragOverColumn={onDragOverColumn}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function parseBoard(text: string): KanbanBoardData {
  return JSON.parse(text) as KanbanBoardData;
}

type ToolResultPayload = {
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
};

export function KanbanViewer() {
  const { state, hydrateBoard, setError, startLoading } = useKanbanBoard();
  const [liveMessage, setLiveMessage] = useState("");
  const [activeDropColumn, setActiveDropColumn] = useState<string | null>(null);
  const queueRef = useRef<QueuedKanbanMove[]>([]);
  const snapshotsRef = useRef<Record<string, KanbanBoardData>>({});
  const processingRef = useRef(false);
  const boardRef = useRef<KanbanBoardData | null>(null);
  const draggedCardIdRef = useRef<string | null>(null);
  const draggingRef = useRef(false);
  const refreshRequestRef = useRef<KanbanRefreshRequestData | null>(null);
  const refreshInFlightRef = useRef(false);
  const refreshAfterMutationRef = useRef(false);
  const lastRefreshStartedAtRef = useRef(0);

  function updateBoard(board: KanbanBoardData) {
    boardRef.current = board;
    hydrateBoard(board);
  }

  function parseToolCallResult(result: ToolResultPayload): Record<string, unknown> {
    const text = extractTextContent(result);
    if (!text) {
      throw new Error("No text payload returned by tool call");
    }
    return JSON.parse(text) as Record<string, unknown>;
  }

  function extractToolError(result: ToolResultPayload): string {
    const text = extractTextContent(result);
    if (!text) return "Tool call failed";
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      return String(parsed.errorMessage ?? parsed.message ?? text);
    } catch {
      return text;
    }
  }

  async function requestBoardRefresh(options: { ignoreInterval?: boolean } = {}) {
    const board = boardRef.current;
    const request = resolveKanbanRefreshRequest(board, refreshRequestRef.current);

    if (!canRequestBoardRefresh({
      board,
      request,
      visibilityState: typeof document === "undefined" ? "visible" : document.visibilityState,
      dragging: draggingRef.current,
      processingMove: processingRef.current,
      queuedMoves: queueRef.current.length,
      refreshInFlight: refreshInFlightRef.current,
      now: Date.now(),
      lastRefreshStartedAt: lastRefreshStartedAtRef.current,
      minIntervalMs: AUTO_REFRESH_INTERVAL_MS,
    }, options)) {
      return false;
    }

    if (!request || !app.getHostCapabilities()?.serverTools) {
      return false;
    }

    refreshInFlightRef.current = true;
    lastRefreshStartedAtRef.current = Date.now();

    try {
      const result = await app.callServerTool({
        name: request.toolName,
        arguments: request.arguments,
      }, { timeout: TOOL_CALL_TIMEOUT_MS });

      if (result.isError) {
        return false;
      }

      const text = extractTextContent(result);
      if (!text) {
        return false;
      }

      updateBoard(parseBoard(text));
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlightRef.current = false;
    }
  }

  async function processQueue() {
    if (processingRef.current) return;
    const { nextMove, restQueue } = takeNextQueuedMove(queueRef.current);
    if (!nextMove) return;

    if (!boardRef.current) {
      queueRef.current = restQueue;
      return;
    }

    queueRef.current = restQueue;
    processingRef.current = true;

    const queueId = nextMove.queueId ?? nextMove.cardId;
    if (!snapshotsRef.current[queueId]) {
      const optimistic = applyOptimisticMove(boardRef.current, nextMove);
      snapshotsRef.current[queueId] = optimistic.snapshot;
      updateBoard(optimistic.board);
    }

    try {
      if (!app.getHostCapabilities()?.serverTools) {
        throw new Error("Host does not support proxied server tool calls");
      }

      const result = await app.callServerTool({
        name: nextMove.moveToolName,
        arguments: {
          doctype: nextMove.doctype,
          card_id: nextMove.cardId,
          from_column: nextMove.fromColumn,
          to_column: nextMove.toColumn,
        },
      }, { timeout: TOOL_CALL_TIMEOUT_MS });

      if (result.isError) {
        const snapshot = snapshotsRef.current[queueId];
        const message = normalizeMoveFailureMessage(extractToolError(result));
        if (snapshot) {
          updateBoard(rollbackMoveFailure(snapshot, { errorMessage: message }));
        }
        setError(message);
        setLiveMessage(message);
      } else {
        const parsed = parseToolCallResult(result);
        const ok = parsed.ok !== false;
        if (!ok) {
          const snapshot = snapshotsRef.current[queueId];
          const message = normalizeMoveFailureMessage(String(parsed.errorMessage ?? "Move failed"));
          if (snapshot) {
            updateBoard(rollbackMoveFailure(snapshot, { errorMessage: message }));
          }
          setError(message);
          setLiveMessage(message);
        } else if (boardRef.current) {
          const reconciled = reconcileMoveSuccess(boardRef.current, {
            cardId: nextMove.cardId,
            toColumn: nextMove.toColumn,
            serverCard: parsed.serverCard as KanbanCardData | undefined,
          });
          updateBoard(reconciled);
          refreshAfterMutationRef.current = true;
          const destinationLabel =
            reconciled.columns.find((column) => column.id === nextMove.toColumn)?.label ??
            nextMove.toColumn;
          setLiveMessage(`Moved ${nextMove.cardId} to ${destinationLabel}`);
        }
      }
    } catch (error) {
      const snapshot = snapshotsRef.current[queueId];
      const message = normalizeMoveFailureMessage(error);
      if (snapshot) {
        updateBoard(rollbackMoveFailure(snapshot, {
          errorMessage: message,
        }));
      }
      setError(message);
      setLiveMessage(message);
    } finally {
      delete snapshotsRef.current[queueId];
      processingRef.current = false;
      if (queueRef.current.length > 0) {
        void processQueue();
      } else if (refreshAfterMutationRef.current) {
        refreshAfterMutationRef.current = false;
        void requestBoardRefresh({ ignoreInterval: true });
      }
    }
  }

  function requestMove(card: KanbanCardData, toColumn: string, label: string) {
    const board = boardRef.current;
    if (!board || card.pending || card.columnId === toColumn) return;

    const transition = board.allowedTransitions.find((candidate) =>
      candidate.allowed &&
      candidate.fromColumn === card.columnId &&
      candidate.toColumn === toColumn
    );

    if (!transition) {
      const message = `Move to ${label} is not allowed`;
      setError(message);
      setLiveMessage(message);
      return;
    }

    const queuedMove: QueuedKanbanMove = {
      queueId: crypto.randomUUID(),
      doctype: board.doctype,
      moveToolName: board.moveToolName,
      cardId: card.id,
      fromColumn: card.columnId,
      toColumn,
    };

    const shouldStartImmediately = !processingRef.current && queueRef.current.length === 0;
    if (shouldStartImmediately) {
      const optimistic = applyOptimisticMove(board, queuedMove);
      snapshotsRef.current[queuedMove.queueId ?? queuedMove.cardId] = optimistic.snapshot;
      updateBoard(optimistic.board);
      setLiveMessage(`Moving ${card.title} to ${label}`);
    } else {
      setLiveMessage(`${card.title} queued for ${label}`);
    }

    queueRef.current = enqueueMove(queueRef.current, queuedMove);
    void processQueue();
  }

  useEffect(() => {
    app.connect().catch(() => {
      setError("Failed to connect MCP App host");
    });

    app.ontoolinput = (params: { arguments?: Record<string, unknown> }) => {
      const toolName = app.getHostContext()?.toolInfo?.tool.name;
      if (toolName && params.arguments) {
        refreshRequestRef.current = {
          toolName,
          arguments: params.arguments,
        };
      }

      if (!boardRef.current) {
        startLoading();
      }
    };

    app.ontoolresult = (result: ToolResultPayload) => {
      const text = extractTextContent(result);
      if (!text) {
        setError("No kanban payload received from tool result");
        return;
      }

      try {
        updateBoard(parseBoard(text));
      } catch (error) {
        setError(error instanceof Error ? error.message : "Failed to parse kanban payload");
      }
    };

    app.ontoolinputpartial = () => {
      if (!boardRef.current) {
        startLoading();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void requestBoardRefresh();
    }, AUTO_REFRESH_INTERVAL_MS);

    function handleWindowFocus() {
      void requestBoardRefresh({ ignoreInterval: true });
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void requestBoardRefresh({ ignoreInterval: true });
      }
    }

    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    boardRef.current = state.board;
  }, [state.board]);

  function handleDragStart(card: KanbanCardData, event: DragEvent<HTMLElement>) {
    draggedCardIdRef.current = card.id;
    draggingRef.current = true;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/json", JSON.stringify({
      cardId: card.id,
      fromColumn: card.columnId,
      title: card.title,
    }));
  }

  function handleDragEnd() {
    draggedCardIdRef.current = null;
    draggingRef.current = false;
    setActiveDropColumn(null);
  }

  function handleDragOverColumn(columnId: string, event: DragEvent<HTMLElement>) {
    const board = boardRef.current;
    const draggedCardId = draggedCardIdRef.current;
    if (!board || !draggedCardId || !canDropCardInColumn(board, draggedCardId, columnId)) {
      setActiveDropColumn(null);
      return;
    }
    event.preventDefault();
    setActiveDropColumn(columnId);
  }

  function handleDropCard(toColumn: string, event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setActiveDropColumn(null);

    try {
      const raw = event.dataTransfer.getData("application/json");
      if (!raw || !boardRef.current) return;
      const payload = JSON.parse(raw) as { cardId: string; fromColumn: string };
      const card = boardRef.current.cards.find((candidate) => candidate.id === payload.cardId);
      const label =
        boardRef.current.columns.find((column) => column.id === toColumn)?.label ??
        toColumn;
      if (card) {
        requestMove(card, toColumn, label);
      }
    } catch {
      setError("Failed to read dragged kanban card");
    }
  }

  if (state.loading) {
    return (
      <div style={{ minHeight: "100vh", background: colors.bg.root }}>
        <ErpNextBrandHeader />
        <LoadingSkeleton />
      </div>
    );
  }

  const errorPresentation = getErrorPresentation(state);

  if (errorPresentation.blockingError) {
    return (
      <div style={{ minHeight: "100vh", background: colors.bg.root }}>
        <ErpNextBrandHeader />
        <ErrorState message={errorPresentation.blockingError} />
      </div>
    );
  }

  if (!state.board) {
    return (
      <div style={{ minHeight: "100vh", background: colors.bg.root }}>
        <ErpNextBrandHeader />
        <EmptyState />
      </div>
    );
  }

  return (
    <>
      <div aria-live="polite" style={hiddenLiveRegionStyle()}>
        {liveMessage}
      </div>
      <BoardView
        board={state.board}
        inlineError={errorPresentation.inlineError}
        activeDropColumn={activeDropColumn}
        onMove={requestMove}
        onDropCard={handleDropCard}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOverColumn={handleDragOverColumn}
      />
    </>
  );
}
