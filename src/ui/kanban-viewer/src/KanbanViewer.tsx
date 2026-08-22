/** @jsxImportSource preact */
/**
 * Kanban Viewer — Direction B v2.
 *
 * Présentation : primitives de ~/shared/ui + markup Tailwind natif.
 * Logique métier : handshake ext-apps, file de déplacements, refresh.
 *
 * Aucun import de @casys/mcp-view.
 */
import type { ComponentChildren, JSX, Ref } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { bindHostContext } from "~/shared/host-context-hook";
import {
  Button,
  CasysCredit,
  CountBadge,
  cx,
  StateMessage,
  ViewerShell,
} from "~/shared/ui";
import { useViewerLayout } from "~/shared/useViewerLayout";
import type { ViewerLayout } from "~/shared/useViewerLayout";
import { useT } from "~/shared/i18n-hook";
import { t } from "~/shared/i18n";
import {
  getErrorPresentation,
  normalizeMoveFailureMessage,
} from "~/shared/kanban/presentation";
import { useKanbanBoard } from "~/shared/kanban/useKanbanBoard";
import type {
  KanbanBoardData,
  KanbanCardData,
  KanbanColumnData,
} from "~/shared/kanban/types";
import {
  applyOptimisticMove,
  canDropCardInColumn,
  enqueueMove,
  type QueuedKanbanMove,
  reconcileMoveSuccess,
  rollbackMoveFailure,
  takeNextQueuedMove,
} from "~/shared/kanban/interactions";
import {
  canRequestBoardRefresh,
  type KanbanRefreshRequestData,
  resolveKanbanRefreshRequest,
} from "~/shared/kanban/refresh";
import { clampKanbanFocusIndex } from "~/shared/kanban/layout";
import { extractToolResultText } from "~/shared/refresh";
import { jumpFromHint, type NavHint } from "~/shared/jumps";
import { useViewerNav } from "~/shared/useViewerNav";
import { PathBar } from "~/shared/PathBar";
import { LevelBody } from "~/shared/levels/LevelBody";
import type { CardDetailState } from "~/shared/kanban/state";
import { kanbanNavVars } from "./kanban-nav";
import { CardDetailModal } from "./DetailModal";
import {
  isFixtureMode,
  KANBAN_FIXTURE,
  KANBAN_FIXTURE_DETAILS,
  KANBAN_FIXTURE_USERS,
} from "./fixture.ts";

const app = new App({ name: "Kanban Viewer", version: "1.0.0" });
const AUTO_REFRESH_INTERVAL_MS = 15_000;
const TOOL_CALL_TIMEOUT_MS = 10_000;

type KanbanDragEvent = JSX.TargetedDragEvent<HTMLElement>;

function hiddenLiveRegionStyle(): JSX.CSSProperties {
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

const extractTextContent = extractToolResultText;

/** Unwrap Frappe-style `{ data: { ... } }` envelope, falling back to the raw object. */
function unwrapDoc(payload: Record<string, unknown>): Record<string, unknown> {
  if (
    payload.data && typeof payload.data === "object" &&
    !Array.isArray(payload.data)
  ) {
    return payload.data as Record<string, unknown>;
  }
  return payload;
}

export function getAvailableTargets(
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
      const targetCol = board.columns.find((column) =>
        column.id === transition.toColumn
      );
      return {
        columnId: transition.toColumn,
        label: transition.label ?? targetCol?.label ?? transition.toColumn,
        color: targetCol?.color,
      };
    });
}

/** Conservé pour la compatibilité avec DetailModal. */
export function badgeTone(tone?: string): string {
  return tone ?? "neutral";
}

/* ────────────────────────────── DragScrollContainer ────────────────────────────── */

function DragScrollContainer({
  children,
  style,
  ...rest
}:
  & { children: ComponentChildren; style?: JSX.CSSProperties }
  & JSX.HTMLAttributes<HTMLDivElement>) {
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

  const onMouseDown = useCallback(
    (e: JSX.TargetedMouseEvent<HTMLDivElement>) => {
      const el = ref.current;
      if (!el) return;
      dragState.current = {
        active: true,
        startX: e.clientX,
        scrollLeft: el.scrollLeft,
      };
      el.style.cursor = "grabbing";
      el.style.userSelect = "none";
    },
    [],
  );

  const onMouseMove = useCallback(
    (e: JSX.TargetedMouseEvent<HTMLDivElement>) => {
      if (!dragState.current.active) return;
      const el = ref.current;
      if (!el) return;
      const delta = e.clientX - dragState.current.startX;
      el.scrollLeft = dragState.current.scrollLeft - delta;
      updateFades();
    },
    [updateFades],
  );

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
      style={Object.assign({}, style, {
        WebkitMaskImage: maskImage,
        maskImage,
      }) as JSX.CSSProperties}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onScroll={updateFades}
      class="drag-scroll"
      {...rest}
    >
      {children}
    </div>
  );
}

/* ────────────────────────────── Helpers ────────────────────────────── */

/** Format ISO date to MM-DD */
function formatDueDate(isoDate: string): string {
  // "2026-06-11" → "06-11"
  const parts = isoDate.split("-");
  if (parts.length >= 3) return `${parts[1]}-${parts[2].slice(0, 2)}`;
  return isoDate;
}

/** Calculate overdue days from dueDate (ISO string). Returns null if not overdue. */
function calcOverdueDays(dueDate: string): number | null {
  const due = new Date(dueDate + "T00:00:00Z").getTime();
  const now = Date.now();
  if (now <= due) return null;
  return Math.floor((now - due) / 86_400_000);
}

/** Detect Milestone badge from card.badges[]. */
function isMilestoneBadge(
  badges?: Array<{ label: string; tone?: string }>,
): boolean {
  return badges?.some((b) =>
    b.label.toLowerCase() === "milestone" || b.label.toLowerCase() === "jalon"
  ) ?? false;
}

/** Parse "N%" metric value into an integer 0–100. */
function parseProgressPercent(value: string): number | null {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null;
}

/* ────────────────────────────── KanbanCard ────────────────────────────── */

function KanbanCard({
  card,
  allowedTargets,
  isMobile,
  onMove,
  onDragStart,
  onDragEnd,
  onTitleClick,
  enableDrag = true,
}: {
  card: KanbanCardData;
  allowedTargets: Array<{ columnId: string; label: string; color?: string }>;
  isMobile: boolean;
  onMove: (card: KanbanCardData, toColumn: string, label: string) => void;
  onDragStart: (card: KanbanCardData, event: KanbanDragEvent) => void;
  onDragEnd: () => void;
  onTitleClick?: (card: KanbanCardData) => void;
  enableDrag?: boolean;
}) {
  const t = useT();
  const isDraggable = enableDrag && !card.pending && !isMobile;
  const accentColor = card.accent ?? "var(--color-accent)";
  const isMilestone = isMilestoneBadge(card.badges);
  const overdueDays = card.dueDate ? calcOverdueDays(card.dueDate) : null;
  const isOverdue = overdueDays !== null;

  // Extract Progress metric
  const progressMetric = card.metrics?.find((m) =>
    m.label.toLowerCase() === "progress"
  );
  const progressPct = progressMetric
    ? parseProgressPercent(progressMetric.value)
    : null;

  // Non-progress, non-Overdue badges that remain
  const otherBadges = (card.badges ?? []).filter((b) => {
    const lc = b.label.toLowerCase();
    return lc !== "milestone" && lc !== "jalon" && lc !== "overdue";
  });

  // First allowed target for CTA button
  const ctaTarget = isMilestone && allowedTargets.length > 0
    ? allowedTargets[0]
    : null;

  // Border style: milestone=accent-edge, overdue=bad/28, normal=line
  const borderClass = isMilestone
    ? "border-accent-edge"
    : isOverdue
    ? "border-bad/28"
    : "border-line";

  // Card bg: row-hover token (#f9fbfb light / #181c21 dark ≈ #191d22)
  return (
    <div
      draggable={isDraggable}
      onDragStart={isDraggable
        ? (event) => onDragStart(card, event as unknown as KanbanDragEvent)
        : undefined}
      onDragEnd={isDraggable ? onDragEnd : undefined}
      style={{ cursor: isDraggable ? "grab" : undefined }}
    >
      <article
        aria-busy={card.pending}
        class={cx(
          "rounded-chip border bg-row-hover",
          isMobile ? "p-[11px]" : "p-[10px]",
          isMobile ? "rounded-[5px]" : "rounded-chip",
          borderClass,
          card.pending ? "opacity-60" : undefined,
        )}
        style={{ borderLeftWidth: 2, borderLeftColor: accentColor }}
      >
        {/* Title row */}
        <div
          class={cx(
            "flex items-start justify-between gap-2",
            isMobile ? "mb-[7px]" : "mb-[6px]",
          )}
        >
          <span class="flex-1 min-w-0 text-cell text-ink leading-snug">
            {onTitleClick
              ? (
                <button
                  type="button"
                  class="group text-left text-cell text-ink transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  onClick={(event) => {
                    event.stopPropagation();
                    onTitleClick(card);
                  }}
                >
                  {card.title}
                  {
                    /*
                    Le chevron est la seule chose qui dise que ce titre s'ouvre.
                    La carte entière se saisit pour être déplacée, donc le clic
                    n'est pas un geste disponible sur elle : sans marque, rien
                    ne distingue ce titre du texte qui l'entoure.

                    Il vit dans le bouton et non dans le coin de la carte, déjà
                    occupé par le badge jalon ou le menu — et parce qu'une
                    affordance doit toucher ce qu'elle désigne.
                  */
                  }
                  <svg
                    aria-hidden="true"
                    width="5"
                    height="8"
                    viewBox="0 0 5 8"
                    fill="none"
                    class="ml-1.5 inline-block shrink-0 align-[-1px] text-ink-faint transition-all group-hover:translate-x-0.5 group-hover:text-accent"
                  >
                    <path
                      d="M1 1L4 4L1 7"
                      stroke="currentColor"
                      stroke-width="1.3"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </button>
              )
              : card.title}
          </span>

          {/* Top-right: milestone badge OR mobile kebab */}
          {isMilestone
            ? (
              <span
                class={cx(
                  "shrink-0 font-mono text-[9px] uppercase tracking-[0.06em]",
                  "rounded-bar px-[5px] py-0.5 flex-shrink-0",
                  "bg-brand/12 dark:bg-brand/16 text-brand-text dark:text-brand-text",
                )}
              >
                {t("kanban.card.milestone")}
              </span>
            )
            : isMobile
            ? (
              <button
                type="button"
                aria-label={t("kanban.card.aria_options", {
                  title: card.title,
                })}
                class="shrink-0 flex items-center justify-center text-ink-faint hover:text-ink rounded-chip transition-colors"
                style={{
                  width: 40,
                  height: 40,
                  margin: "-11px -11px 0 0",
                  background: "transparent",
                  border: 0,
                }}
                onClick={() => onTitleClick?.(card)}
              >
                ⋯
              </button>
            )
            : null}
        </div>

        {/* Subtitle */}
        {card.subtitle && (
          <span
            class={cx(
              "block font-mono text-micro text-ink-faint",
              "mb-[8px]",
            )}
          >
            {card.subtitle}
            {!isMobile && card.dueDate && !progressMetric &&
              " · " +
                t("kanban.card.due", { date: formatDueDate(card.dueDate) })}
          </span>
        )}

        {/* Description */}
        {card.description && (
          <span
            class="block text-meta text-ink-muted mb-[8px]"
            style={{ lineHeight: 1.45 }}
          >
            {card.description}
          </span>
        )}

        {/* Other badges (not milestone, not overdue) */}
        {otherBadges.length > 0 && !isMobile && (
          <div class="flex flex-wrap gap-1 mb-[8px]">
            {otherBadges.map((badge) => (
              <span
                key={`${card.id}-${badge.label}`}
                class="font-mono text-micro rounded-badge bg-count px-[7px] py-0.5 text-ink-muted"
              >
                {badge.label}
              </span>
            ))}
          </div>
        )}

        {/* Progress bar */}
        {progressPct !== null && (
          <div class="flex items-center gap-2 mb-[0px]">
            <div class="flex-1 h-[3px] rounded-bar overflow-hidden bg-track">
              <div
                class="h-full rounded-bar"
                style={{ width: `${progressPct}%`, background: accentColor }}
              />
            </div>
            <span class="font-mono text-micro text-ink-muted">
              {progressPct}%
            </span>
          </div>
        )}

        {/* Due date (wide only, shown separately when progress bar present) */}
        {!isMobile && card.dueDate && progressMetric && (
          <span class="block font-mono text-micro text-ink-faint mt-[7px]">
            {t("kanban.card.due", { date: formatDueDate(card.dueDate) })}
          </span>
        )}

        {/* Overdue badge */}
        {isOverdue && overdueDays !== null && (
          <span
            class={cx(
              "inline-flex font-mono text-micro rounded-bar px-[6px] py-0.5",
              "bg-bad/10 dark:bg-bad/14 text-bad",
              progressPct !== null ? "mt-[7px]" : "mt-[5px]",
            )}
          >
            {t("kanban.card.overdue", { n: String(overdueDays) })}
          </span>
        )}

        {/* CTA button for milestone first target */}
        {ctaTarget && (
          <button
            type="button"
            disabled={card.pending}
            class={cx(
              "kanban-cta-btn w-full mt-[8px] rounded-chip px-[5px] py-[5px]",
              isMobile
                ? "min-h-[40px] rounded-[5px] text-[12.5px]"
                : "text-note",
              "font-sans border text-accent-text dark:text-accent-text",
              "bg-accent/10 dark:bg-accent/14 border-accent-edge",
              "disabled:opacity-50 disabled:cursor-not-allowed transition-colors",
            )}
            onClick={() => onMove(card, ctaTarget.columnId, ctaTarget.label)}
          >
            {ctaTarget.label}
          </button>
        )}

        {/* Non-milestone move buttons (wide only) */}
        {!isMilestone && !isMobile && allowedTargets.length > 0 && (
          <div class="flex flex-wrap gap-1 mt-[8px]">
            {allowedTargets.map((target) => (
              <button
                key={`${card.id}-${target.columnId}`}
                type="button"
                disabled={card.pending}
                class={cx(
                  "font-mono text-micro rounded-badge border border-line bg-count",
                  "text-ink-muted px-[7px] py-0.5 hover:text-ink transition-colors",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
                aria-label={t("kanban.card.aria_move", {
                  title: card.title,
                  label: target.label,
                })}
                onClick={() => onMove(card, target.columnId, target.label)}
              >
                {target.color && (
                  <span
                    aria-hidden="true"
                    class="inline-block mr-[5px] rounded-full"
                    style={{
                      width: 6,
                      height: 6,
                      background: target.color,
                    }}
                  />
                )}
                {target.label}
              </button>
            ))}
          </div>
        )}
      </article>
    </div>
  );
}

/* ────────────────────────────── KanbanColumn (wide) ────────────────────────────── */

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
  onDropCard: (toColumn: string, event: KanbanDragEvent) => void;
  onDragStart: (card: KanbanCardData, event: KanbanDragEvent) => void;
  onDragEnd: () => void;
  onDragOverColumn: (columnId: string, event: KanbanDragEvent) => void;
  onTitleClick?: (card: KanbanCardData) => void;
}) {
  const t = useT();
  const dropping = activeDropColumn === column.id;
  return (
    <section
      class="flex flex-col bg-surface"
      style={{
        outline: dropping ? "2px solid var(--color-accent)" : undefined,
        outlineOffset: dropping ? -2 : undefined,
      }}
      onDragOver={(event) =>
        onDragOverColumn(column.id, event as unknown as KanbanDragEvent)}
      onDrop={(event) =>
        onDropCard(column.id, event as unknown as KanbanDragEvent)}
    >
      {/* Column header */}
      <div class="flex items-center justify-between border-b border-line bg-sunken px-3 py-[9px]">
        <div class="flex items-center gap-[7px]">
          <span
            aria-hidden="true"
            class="shrink-0 rounded-full"
            style={{ width: 5, height: 5, background: column.color }}
          />
          <span class="font-mono text-chip uppercase tracking-[0.08em] text-ink-2">
            {column.label}
          </span>
        </div>
        <span class="font-mono text-chip text-ink-faint">{column.count}</span>
      </div>

      {/* Cards */}
      <div class="flex flex-col gap-2 p-[10px]">
        {cards.map((card) => (
          <KanbanCard
            key={card.id}
            card={card}
            isMobile={false}
            allowedTargets={getAvailableTargets(board, card.columnId)}
            onMove={onMove}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onTitleClick={onTitleClick}
          />
        ))}
        {cards.length === 0 && (
          <p class="text-center text-data text-ink-faint py-4">
            {t("kanban.column.empty", { label: column.label })}
          </p>
        )}
      </div>
    </section>
  );
}

/* ────────────────────────────── MobileColumnNavWrapper ────────────────────────────── */
/**
 * Wrapper stateful pour MobileColumnNav : gère focusIndex et les boutons ‹/›.
 * Séparé de MobileColumnNav pour éviter de passer onSelect à travers deux
 * niveaux de composant.
 */
function MobileColumnNavWrapper({
  board,
  layout,
  onMove,
  onDragStart,
  onDragEnd,
  onTitleClick,
}: {
  board: KanbanBoardData;
  layout: ViewerLayout;
  onMove: (card: KanbanCardData, toColumn: string, label: string) => void;
  onDragStart: (card: KanbanCardData, event: KanbanDragEvent) => void;
  onDragEnd: () => void;
  onTitleClick?: (card: KanbanCardData) => void;
}) {
  const t = useT();
  const [focusIndex, setFocusIndex] = useState(0);
  const columns = board.columns;
  const isMobile = layout === "mobile";
  const safe = clampKanbanFocusIndex(focusIndex, columns.length);
  const column = columns[safe];
  const cards = board.cards.filter((c) => c.columnId === column.id);

  return (
    <div>
      {/* Nav row */}
      <div
        class="flex items-center justify-between gap-2 border-b border-line bg-sunken"
        style={{ padding: "9px 12px" }}
      >
        <button
          type="button"
          aria-label={t("kanban.nav.prev_column")}
          disabled={safe === 0}
          class={cx(
            "flex items-center justify-center rounded-touch border border-line bg-control",
            "font-mono text-data text-ink-faint",
            "disabled:opacity-40 transition-colors hover:text-ink",
          )}
          style={{ width: 32, height: 32 }}
          onClick={() => setFocusIndex((i) => Math.max(0, i - 1))}
        >
          ‹
        </button>
        <div class="flex items-center gap-[7px]">
          <span
            aria-hidden="true"
            class="shrink-0 rounded-full"
            style={{ width: 5, height: 5, background: column.color }}
          />
          <span
            class={cx(
              "font-mono uppercase tracking-[0.08em] text-ink",
              isMobile ? "text-meta" : "text-chip",
            )}
          >
            {column.label}
          </span>
          <span class="font-mono text-meta text-ink-faint">
            {column.count}
          </span>
        </div>
        <button
          type="button"
          aria-label={t("kanban.nav.next_column")}
          disabled={safe >= columns.length - 1}
          class={cx(
            "flex items-center justify-center rounded-touch border border-line bg-control",
            "font-mono text-data text-ink-muted",
            "disabled:opacity-40 transition-colors hover:text-ink",
          )}
          style={{ width: 32, height: 32 }}
          onClick={() =>
            setFocusIndex((i) => Math.min(columns.length - 1, i + 1))}
        >
          ›
        </button>
      </div>

      {/* Dot progress indicator */}
      <div class="flex gap-1" style={{ padding: "8px 12px 0" }}>
        {columns.map((col, i) => (
          <div
            key={col.id}
            class={cx("flex-1 rounded-[1px]", i !== safe ? "bg-line" : "")}
            style={{
              height: 2,
              background: i === safe ? column.color : undefined,
            }}
          />
        ))}
      </div>

      {/* Cards */}
      <div
        class="flex flex-col gap-2"
        style={{ padding: "10px 12px 12px" }}
        id={`kanban-panel-${column.id}`}
        role="tabpanel"
        aria-label={column.label}
      >
        {cards.map((card) => (
          <KanbanCard
            key={card.id}
            card={card}
            isMobile={isMobile}
            allowedTargets={getAvailableTargets(board, card.columnId)}
            onMove={onMove}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onTitleClick={onTitleClick}
            enableDrag={false}
          />
        ))}
        {cards.length === 0 && (
          <p class="text-center text-data text-ink-faint py-4">
            {t("kanban.column.empty", { label: column.label })}
          </p>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────── Types locaux ────────────────────────────── */

/** Extension runtime de KanbanBoardData : le serveur injecte ce champ via withUiRefreshRequest. */
type BoardWithHints = KanbanBoardData & {
  _sendMessageHints?: NavHint[];
};

/* ────────────────────────────── KanbanBoardWithNav ─────────────────────── */

/**
 * Vue principale du tableau kanban avec pile de navigation.
 *
 * Séparé de KanbanViewer pour que useNavStack soit toujours initialisé
 * avec un board.title disponible (le parent garantit board non-null).
 *
 * Quand l'hôte relaie les outils (`jumpsEnabled`) et que le tableau
 * porte `_sendMessageHints`, les boutons du panneau de détail deviennent
 * des sauts qui empilent un niveau dans la vue.
 * Sans serverTools, le comportement actuel (sendMessage) est strictement préservé.
 */
function KanbanBoardWithNav({
  board,
  detail,
  fixture,
  containerRef,
  layout,
  liveMessage,
  inlineError,
  activeDropColumn,
  onMove,
  onDropCard,
  onDragStart,
  onDragEnd,
  onDragOverColumn,
  onTitleClick,
  onClose,
  onNavigate,
  onSave,
  onAssign,
  onUnassign,
  onLoadUsers,
  onError,
}: {
  board: KanbanBoardData;
  detail: CardDetailState;
  fixture: boolean;
  containerRef: Ref<HTMLDivElement>;
  layout: ViewerLayout;
  liveMessage: string;
  inlineError: string | null;
  activeDropColumn: string | null;
  onMove: (card: KanbanCardData, toColumn: string, label: string) => void;
  onDropCard: (toColumn: string, event: KanbanDragEvent) => void;
  onDragStart: (card: KanbanCardData, event: KanbanDragEvent) => void;
  onDragEnd: () => void;
  onDragOverColumn: (columnId: string, event: KanbanDragEvent) => void;
  onTitleClick: (card: KanbanCardData) => void;
  onClose: () => void;
  onNavigate: (message: string) => Promise<void>;
  onSave: (
    doctype: string,
    name: string,
    data: Record<string, string>,
  ) => Promise<void>;
  onAssign: (
    doctype: string,
    name: string,
    assignTo: string,
  ) => Promise<void>;
  onUnassign: (
    doctype: string,
    name: string,
    assignee: string,
  ) => Promise<void>;
  onLoadUsers: () => Promise<Array<{ name: string; full_name?: string }>>;
  onError: (msg: string) => void;
}) {
  const t = useT();
  // La pile : racine = le tableau, niveaux empilés = résultats d'outils (listes, fiches, graphiques).
  const viewerNav = useViewerNav(app, {
    title: board.title,
    kind: "root",
    origin: "list",
  }, { fixture });
  const nav = viewerNav.nav;
  // Liste du niveau courant (racine → vide ; niveau empilé liste → payload de l'outil).
  const { list } = viewerNav;

  // Sauts disponibles uniquement quand l'hôte relaie les outils serveur.
  const { jumpsEnabled } = viewerNav;
  const boardHints = (board as BoardWithHints)._sendMessageHints;
  const hasHints = jumpsEnabled && !!boardHints && boardHints.length > 0;

  const narrow = layout !== "wide";
  const useFocusMode = narrow && board.columns.length > 1;

  // Compte affiché dans l'en-tête : cartes au niveau racine, count du niveau empilé sinon.
  const headerCount: number | undefined = nav.isRoot
    ? board.cards.length
    : nav.current.kind === "list"
    ? nav.current.count
    : undefined;

  /** Envoie une question au modèle (fallback quand l'hôte ne relaie pas les outils). */
  const { ask } = viewerNav;

  /**
   * Ferme la modale de détail puis empile le niveau correspondant au hint.
   * Appelé uniquement quand jumpsEnabled && hasHints.
   */
  function handleModalJump(hint: NavHint, cardId: string): void {
    const jump = jumpFromHint(
      hint,
      kanbanNavVars(cardId, board.doctype),
      t("nav.linked_to", { id: cardId }),
    );
    // La popin fait partie de l'état du niveau : on ne la ferme pas, elle
    // disparaît tant qu'on est plus bas et rouvre à l'identique au retour.
    if (jump) void nav.jump(jump);
  }

  return (
    <>
      <div aria-live="polite" style={hiddenLiveRegionStyle()}>
        {liveMessage}
      </div>
      <ViewerShell containerRef={containerRef}>
        {/* En-tête : titre du niveau courant + count */}
        <header
          class={cx(
            "flex shrink-0 items-center justify-between border-b border-line",
            narrow ? "px-3 py-[11px] gap-[10px]" : "px-4 py-[13px] gap-3",
          )}
        >
          <div class={cx("flex items-center", narrow ? "gap-2" : "gap-3")}>
            <h2
              class={cx(
                "m-0 font-display font-semibold text-ink",
                narrow ? "text-card-title" : "text-title tracking-title",
              )}
            >
              {nav.isRoot ? board.title : nav.current.title}
            </h2>
            {headerCount !== undefined && (
              <CountBadge narrow={narrow}>{headerCount}</CountBadge>
            )}
          </div>
          {!narrow && nav.isRoot && (
            <span class="font-mono text-chip text-ink-faint shrink-0">
              {board.moveToolName}
            </span>
          )}
        </header>

        {/* Fil de navigation — invisible au niveau 1, visible dès le premier saut */}
        <PathBar
          layout={layout}
          stack={nav.stack}
          onBack={nav.pop}
          onJump={nav.popTo}
          loading={nav.current.loading}
        />

        {/* Corps du niveau courant : niveau 1 → tableau kanban ; autres → liste/fiche/barres */}
        <LevelBody
          level={nav.current}
          app={app}
          list={list}
          layout={layout}
          fixture={fixture}
          onJump={jumpsEnabled ? nav.jump : undefined}
          onAsk={ask}
          onError={(msg) => {
            if (msg !== null) onError(msg);
          }}
          onMutated={nav.markStale}
          onRefresh={() => void nav.refreshLevel()}
        >
          {/* Contenu racine : le tableau kanban lui-même */}
          {inlineError && <StateMessage tone="bad">{inlineError}</StateMessage>}
          {useFocusMode
            ? (
              <MobileColumnNavWrapper
                board={board}
                layout={layout}
                onMove={onMove}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onTitleClick={onTitleClick}
              />
            )
            : (
              <DragScrollContainer
                style={{ overflowX: "auto", cursor: "grab" }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      `repeat(${board.columns.length}, minmax(220px, 1fr))`,
                    gap: 1,
                    background: "var(--color-line)",
                  }}
                >
                  {board.columns.map((column) => (
                    <KanbanColumn
                      key={column.id}
                      column={column}
                      board={board}
                      cards={board.cards.filter((card) =>
                        card.columnId === column.id
                      )}
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
              </DragScrollContainer>
            )}
        </LevelBody>

        {/* Pied de page — depuis un niveau, le chemin court vers la carte ouverte */}
        <footer class="flex shrink-0 items-center justify-end gap-3 border-t border-line px-4 py-[9px]">
          {!nav.isRoot && detail.selectedCardId && (
            <button
              type="button"
              onClick={() => nav.popTo(0)}
              class="mr-auto font-mono text-[11px] text-ink-muted transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
            >
              {t("kanban.nav.edit_card", { id: detail.selectedCardId })}
            </button>
          )}
          <CasysCredit compact={narrow} />
        </footer>
      </ViewerShell>

      {/* Panneau de détail de la carte sélectionnée */}
      {detail.selectedCardId && nav.isRoot && (
        <CardDetailModal
          detail={detail}
          board={board}
          onClose={onClose}
          onMove={onMove}
          onSave={onSave}
          onAssign={onAssign}
          onUnassign={onUnassign}
          onLoadUsers={onLoadUsers}
          hints={hasHints ? boardHints : undefined}
          onJump={hasHints ? handleModalJump : undefined}
          onNavigate={!fixture ? onNavigate : undefined}
        />
      )}
    </>
  );
}

/* ────────────────────────────── parseBoard ────────────────────────────── */

function parseBoard(text: string): KanbanBoardData {
  return JSON.parse(text) as KanbanBoardData;
}

type ToolResultPayload = {
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
};

/* ────────────────────────────── KanbanViewer ────────────────────────────── */

export function KanbanViewer() {
  const t = useT();
  const fixture = isFixtureMode();
  const { ref: containerRef, layout } = useViewerLayout<HTMLDivElement>();
  const {
    state,
    hydrateBoard,
    setError,
    startLoading,
    selectCard,
    hydrateDetail,
    closeDetail,
    setDetailError,
  } = useKanbanBoard(fixture ? KANBAN_FIXTURE : undefined);
  const [liveMessage, setLiveMessage] = useState("");
  const [activeDropColumn, setActiveDropColumn] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const queueRef = useRef<QueuedKanbanMove[]>([]);
  const snapshotsRef = useRef<Record<string, KanbanBoardData>>({});
  const processingRef = useRef(false);
  const boardRef = useRef<KanbanBoardData | null>(
    fixture ? KANBAN_FIXTURE : null,
  );
  const draggedCardIdRef = useRef<string | null>(null);
  const draggingRef = useRef(false);
  const refreshRequestRef = useRef<KanbanRefreshRequestData | null>(null);
  const refreshInFlightRef = useRef(false);
  const refreshAfterMutationRef = useRef(false);
  const lastRefreshStartedAtRef = useRef(0);
  const detailFetchCardIdRef = useRef<string | null>(null);
  const fixtureDetailsRef = useRef<Record<string, Record<string, unknown>>>({
    ...KANBAN_FIXTURE_DETAILS,
  });

  function updateBoard(board: KanbanBoardData) {
    boardRef.current = board;
    hydrateBoard(board);
  }

  function parseToolCallResult(
    result: ToolResultPayload,
  ): Record<string, unknown> {
    const text = extractTextContent(result);
    if (!text) {
      throw new Error(t("common.error.no_payload"));
    }
    return JSON.parse(text) as Record<string, unknown>;
  }

  function extractToolError(result: ToolResultPayload): string {
    const text = extractTextContent(result);
    if (!text) return t("common.error.tool_failed");
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      return String(parsed.errorMessage ?? parsed.message ?? text);
    } catch {
      return text;
    }
  }

  async function requestBoardRefresh(
    options: { ignoreInterval?: boolean } = {},
  ) {
    if (fixture) return false;
    const board = boardRef.current;
    const request = resolveKanbanRefreshRequest(
      board,
      refreshRequestRef.current,
    );

    if (
      !canRequestBoardRefresh({
        board,
        request,
        visibilityState: typeof document === "undefined"
          ? "visible"
          : document.visibilityState,
        dragging: draggingRef.current,
        processingMove: processingRef.current,
        queuedMoves: queueRef.current.length,
        refreshInFlight: refreshInFlightRef.current,
        now: Date.now(),
        lastRefreshStartedAt: lastRefreshStartedAtRef.current,
        minIntervalMs: AUTO_REFRESH_INTERVAL_MS,
      }, options)
    ) {
      return false;
    }

    if (!request || !app.getHostCapabilities()?.serverTools) {
      return false;
    }

    refreshInFlightRef.current = true;
    lastRefreshStartedAtRef.current = Date.now();
    setRefreshing(true);

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
      setRefreshing(false);
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
        throw new Error(t("common.error.no_proxy"));
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
          const message = normalizeMoveFailureMessage(
            String(parsed.errorMessage ?? t("kanban.error.move_failed")),
          );
          if (snapshot) {
            updateBoard(
              rollbackMoveFailure(snapshot, { errorMessage: message }),
            );
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
          const destinationLabel = reconciled.columns.find((column) =>
            column.id === nextMove.toColumn
          )?.label ??
            nextMove.toColumn;
          setLiveMessage(
            t("kanban.live.moved", {
              title: nextMove.cardId,
              label: destinationLabel,
            }),
          );
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
      const message = t("kanban.live.move_not_allowed", { label });
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

    if (fixture) {
      const optimistic = applyOptimisticMove(board, queuedMove);
      const reconciled = reconcileMoveSuccess(optimistic.board, {
        cardId: queuedMove.cardId,
        toColumn: queuedMove.toColumn,
      });
      updateBoard(reconciled);
      setLiveMessage(t("kanban.live.moved", { title: card.title, label }));
      return;
    }

    const shouldStartImmediately = !processingRef.current &&
      queueRef.current.length === 0;
    if (shouldStartImmediately) {
      const optimistic = applyOptimisticMove(board, queuedMove);
      snapshotsRef.current[queuedMove.queueId ?? queuedMove.cardId] =
        optimistic.snapshot;
      updateBoard(optimistic.board);
      setLiveMessage(t("kanban.live.moving", { title: card.title, label }));
    } else {
      setLiveMessage(t("kanban.live.queued", { title: card.title, label }));
    }

    queueRef.current = enqueueMove(queueRef.current, queuedMove);
    void processQueue();
  }

  useEffect(() => {
    if (fixture) return;
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
        setError(t("kanban.error.no_payload"));
        return;
      }

      try {
        updateBoard(parseBoard(text));
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : t("kanban.error.parse_failed"),
        );
      }
    };

    app.ontoolinputpartial = () => {
      if (!boardRef.current) {
        startLoading();
      }
    };

    app.connect().then(() => bindHostContext(app)).catch(() => {
      setError(t("kanban.error.connect_failed"));
    });
  }, [fixture]);

  useEffect(() => {
    if (fixture) return;
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
  }, [fixture]);

  useEffect(() => {
    boardRef.current = state.board;
  }, [state.board]);

  useEffect(() => {
    if (!fixture) return;
    const id = state.detail.selectedCardId;
    if (!id || !state.detail.detailLoading) return;
    const detail = fixtureDetailsRef.current[id] ?? {
      name: id,
      subject: boardRef.current?.cards.find((card) => card.id === id)?.title ??
        id,
    };
    hydrateDetail(detail);
  }, [fixture, state.detail.selectedCardId, state.detail.detailLoading]);

  function handleDragStart(
    card: KanbanCardData,
    event: KanbanDragEvent,
  ) {
    draggedCardIdRef.current = card.id;
    draggingRef.current = true;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(
        "application/json",
        JSON.stringify({
          cardId: card.id,
          fromColumn: card.columnId,
          title: card.title,
        }),
      );
    }
  }

  function handleDragEnd() {
    draggedCardIdRef.current = null;
    draggingRef.current = false;
    setActiveDropColumn(null);
  }

  function handleDragOverColumn(
    columnId: string,
    event: KanbanDragEvent,
  ) {
    const board = boardRef.current;
    const draggedCardId = draggedCardIdRef.current;
    if (
      !board || !draggedCardId ||
      !canDropCardInColumn(board, draggedCardId, columnId)
    ) {
      setActiveDropColumn(null);
      return;
    }
    event.preventDefault();
    setActiveDropColumn(columnId);
  }

  function handleDropCard(toColumn: string, event: KanbanDragEvent) {
    event.preventDefault();
    setActiveDropColumn(null);

    try {
      const raw = event.dataTransfer?.getData("application/json");
      if (!raw || !boardRef.current) return;
      const payload = JSON.parse(raw) as { cardId: string; fromColumn: string };
      const card = boardRef.current.cards.find((candidate) =>
        candidate.id === payload.cardId
      );
      const label = boardRef.current.columns.find((column) =>
        column.id === toColumn
      )?.label ??
        toColumn;
      if (card) {
        requestMove(card, toColumn, label);
      }
    } catch {
      setError(t("kanban.error.drag_drop"));
    }
  }

  function handleCardTitleClick(card: KanbanCardData) {
    if (!boardRef.current) return;
    const cardId = card.id;
    detailFetchCardIdRef.current = cardId;
    selectCard(cardId);

    if (fixture) return;

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
          setDetailError(t("kanban.error.detail_no_payload"));
          return;
        }

        hydrateDetail(unwrapDoc(JSON.parse(text) as Record<string, unknown>));
      } catch (error) {
        if (detailFetchCardIdRef.current !== cardId) return;
        setDetailError(
          error instanceof Error
            ? error.message
            : t("kanban.error.detail_fetch_failed"),
        );
      }
    })();
  }

  async function handleNavigate(message: string): Promise<void> {
    if (fixture) return;
    try {
      await app.sendMessage({
        role: "user",
        content: [{ type: "text", text: message }],
      });
    } catch {
      // Best-effort: host may not support sendMessage
    }
  }

  async function handleSaveDetail(
    doctype: string,
    name: string,
    data: Record<string, string>,
  ) {
    if (fixture) {
      const next = { ...fixtureDetailsRef.current[name], ...data, name };
      fixtureDetailsRef.current[name] = next;
      hydrateDetail(next);
      return;
    }
    if (!app.getHostCapabilities()?.serverTools) {
      throw new Error(t("common.error.no_proxy"));
    }

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

    void requestBoardRefresh({ ignoreInterval: true });
  }

  async function handleLoadAssignableUsers(): Promise<
    Array<{ name: string; full_name?: string }>
  > {
    if (fixture) return KANBAN_FIXTURE_USERS;
    if (!app.getHostCapabilities()?.serverTools) {
      throw new Error(t("common.error.no_proxy"));
    }
    const result = await app.callServerTool({
      name: "erpnext_user_list",
      arguments: { limit: 100 },
    }, { timeout: TOOL_CALL_TIMEOUT_MS });
    if (result.isError) {
      throw new Error(extractToolError(result));
    }
    const text = extractTextContent(result);
    if (!text) return [];
    let payload: { data?: Array<{ name: string; full_name?: string }> };
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(t("kanban.error.user_list"));
    }
    return payload.data ?? [];
  }

  async function handleAssignDetail(
    doctype: string,
    name: string,
    assignTo: string,
  ) {
    if (fixture) {
      const current = fixtureDetailsRef.current[name] ?? { name };
      let assignees: string[] = [];
      try {
        const parsed = JSON.parse(String(current._assign ?? "[]"));
        if (Array.isArray(parsed)) {
          assignees = parsed.filter((entry): entry is string =>
            typeof entry === "string"
          );
        }
      } catch {
        assignees = [];
      }
      if (!assignees.includes(assignTo)) assignees.push(assignTo);
      const next = { ...current, _assign: JSON.stringify(assignees) };
      fixtureDetailsRef.current[name] = next;
      hydrateDetail(next);
      return;
    }
    if (!app.getHostCapabilities()?.serverTools) {
      throw new Error(t("common.error.no_proxy"));
    }
    const result = await app.callServerTool({
      name: "erpnext_doc_assign",
      arguments: { doctype, name, assign_to: assignTo },
    }, { timeout: TOOL_CALL_TIMEOUT_MS });
    if (result.isError) {
      throw new Error(extractToolError(result));
    }

    const text = extractTextContent(result);
    if (text) {
      try {
        const payload = JSON.parse(text) as Record<string, unknown>;
        const doc = unwrapDoc(payload);
        if (!doc._assign) {
          const assignment = payload.assignment as
            | { assignees?: string[] }
            | undefined;
          if (assignment?.assignees?.length) {
            doc._assign = JSON.stringify(assignment.assignees);
          }
        }
        hydrateDetail(doc);
      } catch (error) {
        console.warn(
          "[handleAssignDetail] Could not hydrate the assigned doc:",
          error,
        );
      }
    }
    void requestBoardRefresh({ ignoreInterval: true });
  }

  async function handleUnassignDetail(
    doctype: string,
    name: string,
    assignee: string,
  ) {
    if (fixture) {
      const current = fixtureDetailsRef.current[name] ?? { name };
      let assignees: string[] = [];
      try {
        const parsed = JSON.parse(String(current._assign ?? "[]"));
        if (Array.isArray(parsed)) {
          assignees = parsed.filter((entry): entry is string =>
            typeof entry === "string"
          );
        }
      } catch {
        assignees = [];
      }
      const next = {
        ...current,
        _assign: JSON.stringify(
          assignees.filter((email) => email !== assignee),
        ),
      };
      fixtureDetailsRef.current[name] = next;
      hydrateDetail(next);
      return;
    }
    if (!app.getHostCapabilities()?.serverTools) {
      throw new Error(t("common.error.no_proxy"));
    }
    const result = await app.callServerTool({
      name: "erpnext_doc_unassign",
      arguments: { doctype, name, assign_to: assignee },
    }, { timeout: TOOL_CALL_TIMEOUT_MS });
    if (result.isError) {
      throw new Error(extractToolError(result));
    }

    const text = extractTextContent(result);
    if (text) {
      try {
        const payload = JSON.parse(text) as Record<string, unknown>;
        const doc = unwrapDoc(payload);
        if (!doc._assign) {
          const assignment = payload.assignment as
            | { remaining?: Array<{ owner?: string }> }
            | undefined;
          doc._assign = JSON.stringify(
            (assignment?.remaining ?? [])
              .map((todo) => todo.owner)
              .filter(Boolean),
          );
        }
        hydrateDetail(doc);
      } catch (error) {
        console.warn(
          "[handleUnassignDetail] Could not hydrate the doc:",
          error,
        );
      }
    }
    void requestBoardRefresh({ ignoreInterval: true });
  }

  // ── Render ──

  if (state.loading) {
    return (
      <ViewerShell containerRef={containerRef}>
        <p class="m-4 text-center text-data text-ink-muted">
          {t("kanban.loading")}
        </p>
      </ViewerShell>
    );
  }

  const errorPresentation = getErrorPresentation(state);

  if (errorPresentation.blockingError) {
    return (
      <ViewerShell containerRef={containerRef}>
        <StateMessage tone="bad">
          {errorPresentation.blockingError}
        </StateMessage>
      </ViewerShell>
    );
  }

  if (!state.board) {
    return (
      <ViewerShell containerRef={containerRef}>
        <StateMessage>{t("kanban.no_data")}</StateMessage>
      </ViewerShell>
    );
  }

  return (
    <KanbanBoardWithNav
      board={state.board}
      detail={state.detail}
      fixture={fixture}
      containerRef={containerRef}
      layout={layout}
      liveMessage={liveMessage}
      inlineError={errorPresentation.inlineError}
      activeDropColumn={activeDropColumn}
      onMove={requestMove}
      onDropCard={handleDropCard}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOverColumn={handleDragOverColumn}
      onTitleClick={handleCardTitleClick}
      onClose={closeDetail}
      onNavigate={handleNavigate}
      onSave={handleSaveDetail}
      onAssign={handleAssignDetail}
      onUnassign={handleUnassignDetail}
      onLoadUsers={handleLoadAssignableUsers}
      onError={setError}
    />
  );
}
