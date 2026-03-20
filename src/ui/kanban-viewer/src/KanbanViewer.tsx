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
import type { CardDetailState } from "~/shared/kanban/state";
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

/** Unwrap Frappe-style `{ data: { ... } }` envelope, falling back to the raw object. */
function unwrapDoc(payload: Record<string, unknown>): Record<string, unknown> {
  if (payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)) {
    return payload.data as Record<string, unknown>;
  }
  return payload;
}

function getAvailableTargets(
  board: KanbanBoardData,
  columnId: string,
): Array<{ columnId: string; label: string; color?: string }> {
  return board.allowedTransitions
    .filter((transition) =>
      transition.allowed &&
      transition.fromColumn === columnId &&
      transition.toColumn !== columnId
    )
    .map((transition) => {
      const targetCol = board.columns.find((column) => column.id === transition.toColumn);
      return {
        columnId: transition.toColumn,
        label: transition.label ?? targetCol?.label ?? transition.toColumn,
        color: targetCol?.color,
      };
    });
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

  function computeMaskImage(): string | undefined {
    if (canScrollLeft && canScrollRight) {
      return "linear-gradient(to right, transparent, black 24px, black calc(100% - 24px), transparent)";
    }
    if (canScrollRight) {
      return "linear-gradient(to right, black calc(100% - 24px), transparent)";
    }
    if (canScrollLeft) {
      return "linear-gradient(to right, transparent, black 24px)";
    }
    return undefined;
  }

  const maskImage = computeMaskImage();

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

function AssigneeBadge({ email }: { email: string }) {
  const initial = email.charAt(0).toUpperCase();
  const atIndex = email.indexOf("@");
  const displayName = atIndex > 0 ? email.slice(0, atIndex) : email;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span
        style={{
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: colors.accent,
          color: "#fff",
          fontSize: 8,
          fontWeight: 700,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {initial}
      </span>
      <span style={{ fontSize: 10, color: colors.text.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {displayName}
      </span>
    </span>
  );
}

function KanbanCard({
  card,
  allowedTargets,
  onMove,
  onDragStart,
  onDragEnd,
  onTitleClick,
  enableDrag = true,
}: {
  card: KanbanCardData;
  allowedTargets: Array<{ columnId: string; label: string; color?: string }>;
  onMove: (card: KanbanCardData, toColumn: string, label: string) => void;
  onDragStart: (card: KanbanCardData, event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  onTitleClick?: (card: KanbanCardData) => void;
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

  const titleStyle: CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    color: colors.text.primary,
    lineHeight: 1.35,
    overflow: "hidden",
    textOverflow: "ellipsis",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical" as const,
  };

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
            {onTitleClick ? (
              <span
                className="kanban-card-title-link"
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); onTitleClick(card); }}
                onKeyDown={(e) => { if (e.key === "Enter") onTitleClick(card); }}
                style={titleStyle}
              >
                {card.title}
              </span>
            ) : (
              <div style={titleStyle}>
                {card.title}
              </div>
            )}
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

        {/* Description */}
        {card.description && (
          <div
            style={{
              fontSize: 11,
              fontStyle: "italic",
              color: colors.text.muted,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              lineHeight: 1.3,
            }}
          >
            {card.description}
          </div>
        )}

        {/* Assignee */}
        {card.assignee && (
          <div style={{ marginTop: -2 }}>
            <AssigneeBadge email={card.assignee} />
          </div>
        )}

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
  onTitleClick,
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
  onTitleClick?: (card: KanbanCardData) => void;
}) {
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
            allowedTargets={getAvailableTargets(board, card.columnId)}
            onMove={onMove}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onTitleClick={onTitleClick}
          />
        ))}
      </div>
    </section>
  );
}

function ScrollArrow({ direction, onClick }: { direction: "left" | "right"; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Scroll ${direction}`}
      style={{
        ...styles.button,
        padding: "6px 4px",
        fontSize: 12,
        lineHeight: 1,
        borderRadius: 6,
        flexShrink: 0,
        minWidth: 22,
      }}
    >
      {direction === "left" ? "\u2039" : "\u203a"}
    </button>
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
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(false);

  const updateArrows = useCallback(() => {
    const first = tabRefs.current[0];
    const last = tabRefs.current[columns.length - 1];
    const container = first?.parentElement;
    if (!container || !first || !last) return;
    setShowLeft(container.scrollLeft > 0);
    setShowRight(container.scrollLeft < container.scrollWidth - container.clientWidth - 1);
  }, [columns.length]);

  useEffect(updateArrows, [updateArrows]);

  useEffect(() => {
    const btn = tabRefs.current[focusIndex];
    if (!btn) return;
    const container = btn.parentElement;
    if (!container) return;
    container.scrollTo({ left: btn.offsetLeft - 40, behavior: "smooth" });
    requestAnimationFrame(updateArrows);
  }, [focusIndex, updateArrows]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
      {showLeft && <ScrollArrow direction="left" onClick={() => onSelect(Math.max(0, focusIndex - 1))} />}
      <DragScrollContainer
        onScroll={updateArrows}
        style={{
          display: "flex",
          gap: 4,
          overflowX: "auto",
          minWidth: 0,
          flex: 1,
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
              ref={(el) => { tabRefs.current[index] = el; }}
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
      {showRight && <ScrollArrow direction="right" onClick={() => onSelect(Math.min(columns.length - 1, focusIndex + 1))} />}
    </div>
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
  onTitleClick,
}: {
  board: KanbanBoardData;
  inlineError: string | null;
  activeDropColumn: string | null;
  onMove: (card: KanbanCardData, toColumn: string, label: string) => void;
  onDropCard: (toColumn: string, event: React.DragEvent<HTMLElement>) => void;
  onDragStart: (card: KanbanCardData, event: React.DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  onDragOverColumn: (columnId: string, event: React.DragEvent<HTMLElement>) => void;
  onTitleClick?: (card: KanbanCardData) => void;
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
    <div style={{ display: "flex", flexDirection: "column", minHeight: 480, background: colors.bg.root, overflowX: "hidden", width: "100%" }}>
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
                  .map((card) => (
                    <KanbanCard
                      key={card.id}
                      card={card}
                      allowedTargets={getAvailableTargets(board, card.columnId)}
                      onMove={onMove}
                      onDragStart={onDragStart}
                      onDragEnd={onDragEnd}
                      onTitleClick={onTitleClick}
                      enableDrag={false}
                    />
                  ))}
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
                onTitleClick={onTitleClick}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const DETAIL_SKIP_FIELDS = new Set([
  "doctype", "docstatus", "idx", "modified_by", "owner",
  "creation", "modified", "_user_tags", "_comments", "_assign",
  "_liked_by", "_seen", "__last_sync_on",
  "lft", "rgt", "old_parent", "is_group", "is_template",
  "depends_on_tasks", "depends_on",
]);

const READONLY_FIELDS = new Set([
  "name", "status", "workflow_state",
]);

const FIELD_LABELS: Record<string, string> = {
  name: "ID", subject: "Subject", status: "Status", priority: "Priority",
  project: "Project", progress: "Progress (%)", description: "Description",
  exp_start_date: "Start date", exp_end_date: "Due date",
  expected_time: "Estimated (h)", actual_time: "Actual time (h)",
  is_milestone: "Milestone", task_weight: "Weight",
  total_costing_amount: "Cost", total_billing_amount: "Billing",
  start: "Start", duration: "Duration", title: "Title",
  opportunity_from: "Source type", party_name: "Party",
  opportunity_amount: "Amount", currency: "Currency",
  probability: "Probability (%)", opportunity_owner: "Owner",
  expected_closing: "Expected closing", transaction_date: "Created",
  contact_person: "Contact", source: "Source", customer: "Customer",
  raised_by: "Raised by", resolution_by: "SLA deadline",
  opening_date: "Opened", resolution_date: "Resolved",
  first_responded_on: "First response",
};

const BOOLEAN_FIELDS = new Set(["is_milestone", "is_group", "is_template"]);
const DATE_FIELDS = new Set([
  "exp_start_date", "exp_end_date", "expected_closing", "transaction_date",
  "opening_date", "resolution_date", "resolution_by", "first_responded_on",
]);
const SELECT_OPTIONS: Record<string, string[]> = {
  priority: ["Low", "Medium", "High", "Urgent"],
  opportunity_from: ["Lead", "Customer"],
};

function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function isDescriptionField(key: string): boolean {
  return key === "description" || key === "resolution_details" || key === "notes";
}

function getFieldType(key: string, value: unknown): "boolean" | "date" | "select" | "number" | "textarea" | "text" {
  if (BOOLEAN_FIELDS.has(key)) return "boolean";
  if (DATE_FIELDS.has(key)) return "date";
  if (key in SELECT_OPTIONS) return "select";
  if (isDescriptionField(key)) return "textarea";
  if (typeof value === "number") return "number";
  return "text";
}

function DetailFieldGrid({
  detail,
  editedFields,
  onFieldChange,
}: {
  detail: Record<string, unknown>;
  editedFields: Record<string, string>;
  onFieldChange: (key: string, value: string) => void;
}) {
  const entries = Object.entries(detail).filter(
    ([key, value]) =>
      !DETAIL_SKIP_FIELDS.has(key) &&
      value !== null &&
      value !== undefined &&
      value !== "" &&
      typeof value !== "object",
  );

  const inputBase: CSSProperties = {
    ...styles.input,
    flex: 1,
    padding: "6px 10px",
    fontSize: 13,
  };

  function inputStyle(edited: boolean): CSSProperties {
    return {
      ...inputBase,
      borderColor: edited ? colors.accent : "transparent",
      background: edited ? colors.accentDim : "transparent",
    };
  }

  function renderField(key: string, value: unknown, edited: boolean, displayValue: string) {
    const type = getFieldType(key, value);

    switch (type) {
      case "boolean":
        return (
          <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={edited ? displayValue === "1" : value === 1}
              onChange={(e) => onFieldChange(key, e.target.checked ? "1" : "0")}
              style={{ width: 16, height: 16, accentColor: "var(--accent)", cursor: "pointer" }}
            />
            <span style={{ fontSize: 12, color: colors.text.secondary }}>
              {(edited ? displayValue === "1" : value === 1) ? "Yes" : "No"}
            </span>
          </label>
        );

      case "select":
        return (
          <select
            value={displayValue}
            onChange={(e) => onFieldChange(key, e.target.value)}
            style={{
              ...inputBase,
              borderColor: edited ? colors.accent : colors.border,
              background: edited ? colors.accentDim : colors.bg.elevated,
              cursor: "pointer",
            }}
          >
            {SELECT_OPTIONS[key]?.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        );

      case "date":
        return (
          <input
            type="date"
            value={displayValue}
            onChange={(e) => onFieldChange(key, e.target.value)}
            style={inputStyle(edited)}
          />
        );

      case "number":
        return (
          <input
            type="number"
            value={displayValue}
            onChange={(e) => onFieldChange(key, e.target.value)}
            style={{ ...inputStyle(edited), fontFamily: fonts.mono }}
          />
        );

      case "textarea":
        return (
          <textarea
            value={displayValue}
            onChange={(e) => onFieldChange(key, e.target.value)}
            rows={3}
            style={{
              ...inputBase,
              resize: "vertical" as const,
              borderColor: edited ? colors.accent : colors.border,
              background: edited ? colors.accentDim : colors.bg.elevated,
              lineHeight: 1.5,
            }}
          />
        );

      default:
        return (
          <input
            type="text"
            value={displayValue}
            onChange={(e) => onFieldChange(key, e.target.value)}
            style={inputStyle(edited)}
          />
        );
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {entries.map(([key, value]) => {
        const isReadonly = READONLY_FIELDS.has(key);
        const isEdited = key in editedFields;
        const type = getFieldType(key, value);
        const isLong = type === "textarea";
        const displayValue = isEdited ? editedFields[key] : String(value);

        return (
          <div
            key={key}
            className="detail-field-row"
            style={{
              display: "flex",
              flexDirection: isLong ? "column" : "row",
              alignItems: isLong ? "stretch" : "center",
              gap: isLong ? 4 : 0,
              padding: isLong ? "10px 20px" : "0 20px",
              minHeight: isLong ? undefined : 36,
              borderBottom: `1px solid ${colors.borderSubtle}`,
            }}
          >
            <span
              style={{
                width: isLong ? "auto" : 140,
                flexShrink: 0,
                fontWeight: 500,
                fontSize: 12,
                color: isEdited ? colors.accent : colors.text.muted,
                padding: isLong ? 0 : "8px 0",
              }}
            >
              {fieldLabel(key)}
            </span>
            {isReadonly ? (
              <span
                style={{
                  flex: 1,
                  fontSize: 13,
                  color: colors.text.primary,
                  fontFamily: typeof value === "number" ? fonts.mono : fonts.sans,
                  fontWeight: key === "name" ? 500 : 400,
                  padding: "8px 0",
                }}
              >
                {String(value)}
              </span>
            ) : (
              renderField(key, value, isEdited, displayValue)
            )}
          </div>
        );
      })}
    </div>
  );
}

function CardDetailModal({
  detail,
  board,
  onClose,
  onMove,
  onSave,
  onAction,
}: {
  detail: CardDetailState;
  board: KanbanBoardData;
  onClose: () => void;
  onMove: (card: KanbanCardData, toColumn: string, label: string) => void;
  onSave?: (doctype: string, name: string, data: Record<string, string>) => void;
  onAction?: (toolName: string, args: Record<string, unknown>) => void;
}) {
  const [editedFields, setEditedFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ text: string; isError: boolean } | null>(null);

  useEffect(() => {
    if (!detail.selectedCardId) return;
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [detail.selectedCardId, onClose]);

  useEffect(() => {
    setEditedFields({});
    setSaveMessage(null);
  }, [detail.selectedCardId]);

  if (!detail.selectedCardId) return null;

  const card = board.cards.find((c) => c.id === detail.selectedCardId);
  const cardTitle = card?.title ?? detail.selectedCardId;
  const availableTargets = card ? getAvailableTargets(board, card.columnId) : [];
  const hasEdits = Object.keys(editedFields).length > 0;

  function handleFieldChange(key: string, value: string) {
    setEditedFields((prev) => {
      const original = detail.cardDetail ? String(detail.cardDetail[key] ?? "") : "";
      if (value === original) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: value };
    });
    setSaveMessage(null);
  }

  async function handleSave() {
    if (!hasEdits || !onSave || !detail.selectedCardId) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      await onSave(board.doctype, detail.selectedCardId, editedFields);
      setSaveMessage({ text: "Saved", isError: false });
      setEditedFields({});
    } catch (error) {
      setSaveMessage({
        text: error instanceof Error ? error.message : "Save failed",
        isError: true,
      });
    } finally {
      setSaving(false);
    }
  }

  const columnLabel = card
    ? board.columns.find((c) => c.id === card.columnId)?.label
    : undefined;
  const columnColor = card
    ? board.columns.find((c) => c.id === card.columnId)?.color
    : undefined;

  return (
    <div
      className="kanban-detail-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={`Detail: ${cardTitle}`}
    >
      <div className="kanban-detail-panel">
        {/* Color accent bar */}
        {columnColor && (
          <div aria-hidden="true" style={{ height: 3, background: columnColor, borderRadius: "12px 12px 0 0", flexShrink: 0 }} />
        )}

        {/* Header */}
        <div style={{ padding: "16px 20px 12px", display: "flex", alignItems: "flex-start", gap: 12, borderBottom: `1px solid ${colors.border}` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: colors.text.primary, lineHeight: 1.3 }}>
              {cardTitle}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
              <span style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.text.faint }}>
                {detail.selectedCardId}
              </span>
              {columnLabel && (
                <span style={{
                  ...styles.badge(columnColor ?? colors.text.muted, `${columnColor ?? colors.text.muted}20`),
                  fontSize: 10,
                }}>
                  {columnLabel}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close detail"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 4,
              borderRadius: 4,
              color: colors.text.faint,
              fontSize: 18,
              lineHeight: 1,
              transition: "color 0.1s",
            }}
          >
            \u2715
          </button>
        </div>

        {/* Content */}
        <div style={{ maxHeight: "50vh", overflowY: "auto" }}>
          {detail.detailLoading && (
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <div className="skeleton" style={{ width: 120, height: 14 }} />
                  <div className="skeleton" style={{ flex: 1, height: 14 }} />
                </div>
              ))}
            </div>
          )}

          {detail.detailError && (
            <div style={{ margin: 16, padding: "10px 14px", background: colors.errorDim, borderRadius: 6, color: colors.error, fontSize: 12 }}>
              {detail.detailError}
            </div>
          )}

          {detail.cardDetail && (
            <DetailFieldGrid
              detail={detail.cardDetail}
              editedFields={editedFields}
              onFieldChange={handleFieldChange}
            />
          )}
        </div>

        {/* Sticky footer */}
        <div style={{ borderTop: `1px solid ${colors.border}`, padding: "12px 20px", display: "flex", flexDirection: "column", gap: 10, flexShrink: 0 }}>

          {/* Save bar */}
          {onSave && detail.cardDetail && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                type="button"
                onClick={handleSave}
                disabled={!hasEdits || saving}
                style={{
                  ...styles.button,
                  padding: "7px 20px",
                  fontSize: 12,
                  fontWeight: 600,
                  background: hasEdits ? colors.accent : colors.bg.elevated,
                  color: hasEdits ? "#fff" : colors.text.faint,
                  borderColor: hasEdits ? colors.accent : colors.border,
                  opacity: saving ? 0.6 : 1,
                  borderRadius: 6,
                }}
              >
                {saving ? "Saving\u2026" : "Save changes"}
              </button>
              {hasEdits && (
                <button
                  type="button"
                  onClick={() => { setEditedFields({}); setSaveMessage(null); }}
                  style={{ ...styles.button, padding: "7px 14px", fontSize: 12 }}
                >
                  Discard
                </button>
              )}
              {saveMessage && (
                <span style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: saveMessage.isError ? colors.error : colors.success,
                  padding: "2px 8px",
                  borderRadius: 4,
                  background: saveMessage.isError ? colors.errorDim : colors.successDim,
                }}>
                  {saveMessage.text}
                </span>
              )}
            </div>
          )}

          {/* Move + action buttons in a single row */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            {card && availableTargets.map((target) => (
              <button
                key={target.columnId}
                type="button"
                onClick={() => { onMove(card, target.columnId, target.label); onClose(); }}
                style={{
                  ...styles.button,
                  padding: "5px 10px",
                  fontSize: 11,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                {target.color && (
                  <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: target.color, flexShrink: 0 }} />
                )}
                {target.label}
              </button>
            ))}

            {onAction && (card || availableTargets.length > 0) && (
              <span style={{ width: 1, height: 16, background: colors.border, flexShrink: 0 }} />
            )}

            {onAction && (
              <>
                <button
                  type="button"
                  onClick={() => onAction("erpnext_doc_list", { doctype: board.doctype, filters: [["name", "=", detail.selectedCardId]] })}
                  style={{ ...styles.button, padding: "5px 10px", fontSize: 11, color: colors.accent }}
                >
                  Doclist
                </button>
                {board.doctype === "Task" && (
                  <button
                    type="button"
                    onClick={() => onAction("erpnext_doc_list", { doctype: "Timesheet Detail", filters: [["task", "=", detail.selectedCardId]] })}
                    style={{ ...styles.button, padding: "5px 10px", fontSize: 11, color: colors.accent }}
                  >
                    Timesheets
                  </button>
                )}
              </>
            )}
          </div>
        </div>
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
  const { state, hydrateBoard, setError, startLoading, selectCard, hydrateDetail, closeDetail, setDetailError } = useKanbanBoard();
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
  const detailFetchCardIdRef = useRef<string | null>(null);

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

  function handleCardTitleClick(card: KanbanCardData) {
    if (!boardRef.current) return;
    const cardId = card.id;
    detailFetchCardIdRef.current = cardId;
    selectCard(cardId);

    void (async () => {
      try {
        const result = await app.callServerTool({
          name: "erpnext_doc_get",
          arguments: { doctype: boardRef.current!.doctype, name: cardId },
        }, { timeout: TOOL_CALL_TIMEOUT_MS });

        if (detailFetchCardIdRef.current !== cardId) return;

        if (result.isError) {
          setDetailError(extractToolError(result));
          return;
        }

        const text = extractTextContent(result);
        if (!text) {
          setDetailError("No detail payload returned");
          return;
        }

        hydrateDetail(unwrapDoc(JSON.parse(text) as Record<string, unknown>));
      } catch (error) {
        if (detailFetchCardIdRef.current !== cardId) return;
        setDetailError(error instanceof Error ? error.message : "Failed to fetch detail");
      }
    })();
  }

  async function handleAction(toolName: string, args: Record<string, unknown>): Promise<void> {
    try {
      await app.callServerTool({ name: toolName, arguments: args }, { timeout: TOOL_CALL_TIMEOUT_MS });
    } catch {
      // Best-effort: host may not support this tool call
    }
  }

  async function handleSaveDetail(doctype: string, name: string, data: Record<string, string>) {
    // Coerce types: if original value was a number, convert back
    const coerced: Record<string, unknown> = {};
    const originalDetail = state.detail.cardDetail;
    for (const [key, val] of Object.entries(data)) {
      const orig = originalDetail?.[key];
      if (typeof orig === "number") {
        const num = Number(val);
        coerced[key] = Number.isFinite(num) ? num : val;
      } else {
        coerced[key] = val;
      }
    }

    const result = await app.callServerTool({
      name: "erpnext_doc_update",
      arguments: { doctype, name, data: coerced },
    }, { timeout: TOOL_CALL_TIMEOUT_MS });

    if (result.isError) {
      throw new Error(extractToolError(result));
    }

    // Re-fetch the detail to get the updated values
    const refreshResult = await app.callServerTool({
      name: "erpnext_doc_get",
      arguments: { doctype, name },
    }, { timeout: TOOL_CALL_TIMEOUT_MS });

    if (!refreshResult.isError) {
      const text = extractTextContent(refreshResult);
      if (text) {
        hydrateDetail(unwrapDoc(JSON.parse(text) as Record<string, unknown>));
      }
    }

    // Refresh the board to reflect changes on cards
    void requestBoardRefresh({ ignoreInterval: true });
  }

  if (state.loading) {
    return (
      <div style={{ minHeight: 480, background: colors.bg.root }}>
        <ErpNextBrandHeader />
        <LoadingSkeleton />
      </div>
    );
  }

  const errorPresentation = getErrorPresentation(state);

  if (errorPresentation.blockingError) {
    return (
      <div style={{ minHeight: 480, background: colors.bg.root }}>
        <ErpNextBrandHeader />
        <ErrorState message={errorPresentation.blockingError} />
      </div>
    );
  }

  if (!state.board) {
    return (
      <div style={{ minHeight: 480, background: colors.bg.root }}>
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
        onTitleClick={handleCardTitleClick}
      />
      {state.detail.selectedCardId && state.board && (
        <CardDetailModal
          detail={state.detail}
          board={state.board}
          onClose={closeDetail}
          onMove={requestMove}
          onSave={handleSaveDetail}
          onAction={handleAction}
        />
      )}
    </>
  );
}
