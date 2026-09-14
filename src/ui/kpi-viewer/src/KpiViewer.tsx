/** @jsxImportSource preact */
/**
 * KPI viewer — Direction B v2.
 * Pile de navigation câblée : sauts « › » quand l'hôte relaie les outils,
 * comportement drillDown inchangé sinon.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { JSX } from "preact";
import { App } from "@modelcontextprotocol/ext-apps";
import { bindHostContext } from "~/shared/host-context-hook";
import {
  CasysCredit,
  cx,
  Skeleton,
  ViewerHeader,
  ViewerShell,
} from "~/shared/ui";
import { useViewerLayout } from "~/shared/useViewerLayout";
import { useViewerNav } from "~/shared/useViewerNav";
import { viewerRootKey } from "~/shared/nav-stack";
import { PathBar } from "~/shared/PathBar";
import { type Jump } from "~/shared/jumps";
import { canCallViewerTool, readAvailableTools } from "~/shared/viewer-tools";
import { LevelBody } from "~/shared/levels/LevelBody";
import {
  beginUiRefresh,
  canRequestUiRefresh,
  completeUiRefresh,
  createUiRefreshSequence,
  extractToolResultText,
  invalidateUiRefresh,
  normalizeUiRefreshFailureMessage,
  resolveUiRefreshRequest,
  type ToolResultPayload,
  type UiRefreshRequestData,
} from "~/shared/refresh";
import { isFixtureMode, KPI_FIXTURE } from "./fixture.ts";
import type { KpiData } from "./types.ts";
import { currentLocale, formatNumber, toNumber } from "~/shared/format";
import { t } from "~/shared/i18n.ts";
import { type TFunction, useT } from "~/shared/i18n-hook.ts";
import { type DrillDownChannel, sharedLabel } from "~/shared/drill-down";
import {
  kpiInteractionPlan,
  kpiNumberAction,
  kpiTrendAction,
} from "./kpi-jumps.ts";
import {
  kpiSparklinePeriod,
  type KpiSparklinePoint,
  kpiSparklinePoints,
  kpiTrendContextResource,
} from "./kpi-sparkline.ts";
import { ActiveContextChip } from "~/shared/ActiveContextChip.tsx";
import { useActiveContext } from "~/shared/useActiveContext.ts";
import { useClickIntent } from "~/shared/useClickIntent.ts";
import {
  canShareActiveContextResource,
  type ContextSelectionItem,
} from "~/shared/active-context.ts";
import type { DocumentContextController } from "~/shared/document/context-interaction.ts";

const app = new App({ name: "KPI Viewer", version: "1.0.0" });
const KPI_REFRESH_INTERVAL_MS = 15_000;
const TOOL_CALL_TIMEOUT_MS = 10_000;

/* ── Formatage ────────────────────────────────────────────────────── */

/**
 * Retourne le montant et l'unité séparément pour permettre le rendu
 * bipolaire 46px/26px (montant gros, unité faufilée à droite).
 */
function formatKpiParts(data: KpiData): { amount: string; unit: string } {
  // Normalise la valeur — null, undefined, NaN sont traités comme 0, jamais une exception.
  const v = toNumber(data.value) ?? 0;
  if (data.currency) {
    const amount = formatNumber(v, 2);
    // Extraire le symbole monétaire depuis Intl sans le chiffre.
    const symbol = new Intl.NumberFormat(currentLocale(), {
      style: "currency",
      currency: data.currency,
    })
      .formatToParts(0)
      .find((p) => p.type === "currency")?.value ?? data.currency;
    return { amount, unit: symbol };
  }
  if (data.unit === "%") {
    const decimals = v % 1 === 0 ? 0 : 1;
    return { amount: formatNumber(v, decimals), unit: "%" };
  }
  const decimals = v % 1 === 0 ? 0 : 2;
  return { amount: formatNumber(v, decimals), unit: data.unit ?? "" };
}

/**
 * Formate la valeur de comparaison (deltaValue) de la même manière
 * que la valeur principale, mais sans scinder en deux éléments.
 */
function formatDeltaValue(data: KpiData): string {
  // Garde == null (double égal) : capture à la fois null et undefined.
  if (data.deltaValue == null) return "";
  const v = toNumber(data.deltaValue) ?? 0;
  if (data.currency) {
    const amount = formatNumber(v, 2);
    const symbol = new Intl.NumberFormat(currentLocale(), {
      style: "currency",
      currency: data.currency,
    })
      .formatToParts(0)
      .find((p) => p.type === "currency")?.value ?? data.currency;
    return `${amount} ${symbol}`;
  }
  return formatNumber(v, 2);
}

function kpiNumberContext(data: KpiData): ContextSelectionItem {
  const { amount, unit } = formatKpiParts(data);
  return {
    id: `kpi:${data.label}:value`,
    view: "KPI",
    label: data.label,
    value: [amount, unit].filter(Boolean).join(" "),
  };
}

function kpiTrendContext(
  data: KpiData,
  tf: TFunction,
): ContextSelectionItem {
  const sparkline = data.sparkline && data.sparkline.length >= 2
    ? data.sparkline
    : undefined;
  const points = kpiSparklinePoints(data);
  const period = kpiSparklinePeriod(points);
  const lastValue = sparkline?.length
    ? formatKpiParts({ ...data, value: sparkline[sparkline.length - 1] })
    : undefined;
  const resource = kpiTrendContextResource(data);
  return {
    id: `kpi:${data.label}:trend`,
    view: "KPI",
    label: `${data.label} · ${tf("kpi.sparkline.trend_label")}`,
    value: [
      period,
      lastValue
        ? [lastValue.amount, lastValue.unit].filter(Boolean).join(" ")
        : undefined,
    ].filter(Boolean).join(" · ") || undefined,
    resource,
  };
}

function kpiTrendPointContext(
  data: KpiData,
  point: KpiSparklinePoint,
): ContextSelectionItem {
  const { amount, unit } = formatKpiParts({ ...data, value: point.value });
  return {
    id: `kpi:${data.label}:trend:${encodeURIComponent(point.label)}`,
    view: "KPI",
    label: `${data.label} · ${point.label}`,
    value: [amount, unit].filter(Boolean).join(" "),
  };
}

function kpiContextCandidates(
  data: KpiData,
  tf: TFunction,
): ContextSelectionItem[] {
  if (!data.sparkline || data.sparkline.length < 2) return [];
  const pointContexts = kpiSparklinePoints(data).map((point) =>
    kpiTrendPointContext(data, point)
  );
  return [
    kpiNumberContext(data),
    kpiTrendContext(data, tf),
    ...pointContexts,
  ];
}

/* ── Ramp chromatique sparkline ───────────────────────────────────── */

/**
 * Répartit les barres en 4 niveaux de luminosité (chart-4 → chart-1)
 * en suivant la ramp de la maquette pour n=8 barres.
 *
 * Les classes sont énumérées statiquement ici pour que Tailwind les
 * détecte au scan (règle : jamais de classe composée à l'exécution).
 */
const _SPARKLINE_CLASSES_ANCHOR = "bg-chart-1 bg-chart-2 bg-chart-3 bg-chart-4";

function sparklineBarClass(idx: number, total: number): string {
  if (total <= 1) return "bg-chart-1";
  const ratio = idx / (total - 1); // 0 = plus vieux, 1 = plus récent
  if (ratio < 0.25) return "bg-chart-4";
  if (ratio < 0.625) return "bg-chart-3";
  if (ratio < 0.875) return "bg-chart-2";
  return "bg-chart-1";
}

/* ── Calcul de la hauteur d'une barre ────────────────────────────── */

function sparklineHeights(values: number[]): number[] {
  const max = Math.max(...values);
  if (max === 0) return values.map(() => 0);
  return values.map((v) => Math.round((v / max) * 100));
}

/* ── Dot de statut (pastille colorée dans le label) ──────────────── */

function StatusDot({ trend, trendIsGood }: {
  trend?: KpiData["trend"];
  trendIsGood?: boolean;
}) {
  // Vert = ok (up+good ou down+mauvais attendu mais bon), orange/rouge sinon.
  const isGood = trendIsGood === undefined
    ? true
    : trendIsGood
    ? trend === "up"
    : trend === "down";

  return (
    <span
      aria-hidden="true"
      class={cx(
        "inline-block size-[5px] shrink-0 rounded-full",
        trend === "flat" || trendIsGood === undefined
          ? "bg-ok"
          : isGood
          ? "bg-ok"
          : "bg-bad",
      )}
    />
  );
}

/* ── Barres sparkline ─────────────────────────────────────────────── */

function SparklineBars({
  values,
  labels,
  ariaLabels,
  height,
  gap,
  contextEnabled,
  isSelected,
  ariaKeyShortcuts,
  onClick,
  onDoubleClick,
  onKeyDown,
}: {
  values: number[];
  labels?: string[];
  /** Month and exact value announced for each graphical bar. */
  ariaLabels?: string[];
  /** Hauteur totale du conteneur en px. */
  height: number;
  gap: number;
  contextEnabled?: boolean;
  isSelected?: (index: number) => boolean;
  ariaKeyShortcuts?: string;
  onClick?: (
    index: number,
    event: JSX.TargetedMouseEvent<HTMLButtonElement>,
  ) => void;
  onDoubleClick?: (
    index: number,
    event: JSX.TargetedMouseEvent<HTMLButtonElement>,
  ) => void;
  onKeyDown?: (
    index: number,
    event: JSX.TargetedKeyboardEvent<HTMLButtonElement>,
  ) => void;
}) {
  const pcts = sparklineHeights(values);
  const interactive = labels?.length === values.length &&
    Boolean(onClick || onDoubleClick || onKeyDown);
  return (
    <div class="min-w-0">
      <div
        class="flex items-end rounded-bar"
        style={{ height: `${height}px`, gap: `${gap}px` }}
      >
        {pcts.map((barHeight, index) => {
          const selected = interactive && Boolean(isSelected?.(index));
          const style = { height: `${Math.max(barHeight, 4)}%` };
          return interactive
            ? (
              <button
                key={index}
                type="button"
                class="group pointer-events-auto flex h-full min-w-0 flex-1 items-end border-0 bg-transparent p-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                aria-label={ariaLabels?.[index] ?? labels![index]}
                title={ariaLabels?.[index] ?? labels![index]}
                aria-pressed={contextEnabled ? selected : undefined}
                aria-keyshortcuts={ariaKeyShortcuts}
                onClick={(event) => {
                  event.stopPropagation();
                  onClick?.(index, event);
                }}
                onDblClick={(event) => {
                  event.stopPropagation();
                  onDoubleClick?.(index, event);
                }}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  onKeyDown?.(index, event);
                }}
              >
                <span
                  aria-hidden="true"
                  class={cx(
                    "block w-full rounded-bar transition-[opacity,box-shadow] group-hover:opacity-100",
                    sparklineBarClass(index, values.length),
                    selected &&
                      "ring-1 ring-accent ring-offset-1 ring-offset-sunken",
                  )}
                  style={style}
                />
              </button>
            )
            : (
              <span
                key={index}
                class={cx(
                  "min-w-0 flex-1 self-end rounded-bar",
                  sparklineBarClass(index, values.length),
                )}
                style={style}
                aria-hidden="true"
              />
            );
        })}
      </div>
      {labels?.length === values.length && (
        <div
          class="mt-1.5 flex border-t border-line-soft pt-1"
          style={{ gap: `${gap}px` }}
          aria-hidden="true"
        >
          {labels.map((label, index) => (
            <span
              key={`${label}-${index}`}
              title={label}
              class={cx(
                "min-w-0 flex-1 whitespace-nowrap text-center font-mono text-[8.5px]",
                isSelected?.(index) ? "text-accent" : "text-ink-faint",
              )}
            >
              {label.replace(/\s+\d{2,4}$/, "")}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Badge delta ──────────────────────────────────────────────────── */

function DeltaBadge({ delta, trend, trendIsGood }: {
  delta: number;
  trend?: KpiData["trend"];
  trendIsGood?: boolean;
}) {
  const direction = trend ?? (delta > 0 ? "up" : delta < 0 ? "down" : "flat");
  const arrow = direction === "up" ? "↑" : direction === "down" ? "↓" : "—";
  // delta est un ratio : 2.83 → 283 %.
  const pct = Math.round(Math.abs(delta) * 100);
  const isGood = trendIsGood === undefined
    ? true
    : trendIsGood
    ? direction === "up"
    : direction === "down";
  const tone = direction === "flat" || trendIsGood === undefined
    ? "neutral"
    : isGood
    ? "ok"
    : "bad";

  return (
    <span
      class={cx(
        "inline-flex font-mono text-[12px] font-medium px-2 py-[3px] rounded-badge",
        tone === "ok" && "bg-ok/[.14] text-ok",
        tone === "bad" && "bg-bad/[.14] text-bad",
        tone === "neutral" && "bg-ink-ghost/20 text-ink-muted",
      )}
    >
      {arrow} {pct} %
    </span>
  );
}

/* ── Bloc d'erreur inline ─────────────────────────────────────────── */

/**
 * Erreur inline (quand des données sont déjà affichées).
 * Doctrine : bande gauche border-l-2 border-bad, jamais un StateMessage cadré.
 */
function InlineError({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  const t = useT();
  return (
    <div class="flex flex-col gap-[6px] border-l-2 border-bad pl-[10px]">
      <div class="flex items-center gap-[5px]">
        <span class="inline-block size-[5px] shrink-0 rounded-full bg-bad" />
        <span class="text-[12.5px] text-ink leading-snug">{message}</span>
      </div>
      {onRetry && (
        <button
          type="button"
          class="self-start rounded-control border border-line bg-surface px-[10px] py-[5px] font-mono text-[10.5px] text-ink-muted hover:border-line-hover hover:text-ink"
          onClick={onRetry}
        >
          {t("common.retry")}
        </button>
      )}
    </div>
  );
}

/* ── Confirmation visuelle après drill-down ───────────────────────── */

function DrillDownConfirm({ channel }: { channel: DrillDownChannel }) {
  return (
    <div class="flex items-center gap-[5px] mt-[4px]">
      {/* Arc SVG → signal d'envoi vers la conversation */}
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        fill="none"
        class="shrink-0"
      >
        <path
          d="M1 9 Q5 1 9 5"
          stroke="var(--color-accent-edge)"
          stroke-width="1.2"
          stroke-linecap="round"
          fill="none"
        />
        <path
          d="M9 5 L7.5 3.5 M9 5 L7.5 6.5"
          stroke="var(--color-accent-edge)"
          stroke-width="1.2"
          stroke-linecap="round"
          fill="none"
        />
      </svg>
      <span class="font-mono text-[10.5px] text-ink-faint">
        {sharedLabel(channel)}
      </span>
    </div>
  );
}

/* ── État chargement KPI ──────────────────────────────────────────── */

function KpiLoadingSkeleton() {
  const t = useT();
  return (
    <>
      <div class="flex flex-col gap-[10px] p-[18px_16px]">
        {/* Label skeleton */}
        <div class="flex items-center gap-2">
          <span class="font-mono text-micro uppercase tracking-eyebrow text-ink-faint">
            {t("kpi.skeleton.label")}
          </span>
          <span class="inline-block size-[5px] shrink-0 rounded-full bg-amber-400/70" />
        </div>
        {/* Valeur principale skeleton (deux lignes : 70% et 38%) */}
        <Skeleton class="h-[14px] rounded-bar" style={{ width: "70%" }} />
        <Skeleton class="h-[14px] rounded-bar" style={{ width: "38%" }} />
        {/* Lignes fines (4) */}
        <div class="flex flex-col gap-[5px] mt-[4px]">
          <Skeleton class="h-[9px] rounded-bar w-full" />
          <Skeleton class="h-[9px] rounded-bar w-full" />
          <Skeleton class="h-[9px] rounded-bar w-full" />
          <Skeleton class="h-[9px] rounded-bar" style={{ width: "60%" }} />
        </div>
      </div>
      <footer class="flex justify-end border-t border-line px-4 py-[9px]">
        <CasysCredit />
      </footer>
    </>
  );
}

/* ── État vide KPI ────────────────────────────────────────────────── */

function KpiEmptyState() {
  const t = useT();
  return (
    <>
      <div class="flex flex-col items-center gap-2 p-[34px_24px]">
        {/* Mini-barres fantômes */}
        <div class="flex items-end gap-[4px] h-[28px]">
          <div
            class="w-[7px] bg-chart-3 opacity-40 rounded-bar"
            style={{ height: "40%" }}
          />
          <div
            class="w-[7px] bg-chart-3 opacity-40 rounded-bar"
            style={{ height: "70%" }}
          />
          <div
            class="w-[7px] bg-chart-3 opacity-40 rounded-bar"
            style={{ height: "55%" }}
          />
        </div>
        <span class="text-[12.5px] text-ink-muted text-center leading-snug">
          {t("kpi.empty.title")}
        </span>
        <span class="font-mono text-[10.5px] text-ink-faint text-center leading-relaxed">
          {t("kpi.empty.hint")}
        </span>
      </div>
      <footer class="flex justify-end border-t border-line px-4 py-[9px]">
        <CasysCredit />
      </footer>
    </>
  );
}

/* ── Carte KPI ───────────────────────────────────────────────────── */

/**
 * La carte proprement dite — niveau racine de la vue.
 * Câble les sauts de pile (jumpsEnabled) et conserve le comportement
 * drillDown inchangé quand les outils ne sont pas relayés.
 */
function KpiCard({
  data,
  error,
  layout,
  jumpsEnabled,
  activeContext,
  onOpenJump,
  onAsk,
  onRefresh,
}: {
  data: KpiData;
  error: string | null;
  layout: "wide" | "panel" | "mobile";
  jumpsEnabled: boolean;
  activeContext: ReturnType<typeof useActiveContext>;
  onOpenJump?: (jump: Jump) => void;
  onAsk?: (message: string) => Promise<boolean>;
  onRefresh?: () => void;
}) {
  const t = useT();
  const clickIntent = useClickIntent();
  const sparkline = data.sparkline && data.sparkline.length >= 2
    ? data.sparkline
    : undefined;
  const contextEnabled = activeContext.supported && sparkline !== undefined;
  const sparklinePoints = kpiSparklinePoints(data);
  const sparklineLabels = sparklinePoints.length > 0
    ? sparklinePoints.map((point) => point.label)
    : undefined;
  const { amount, unit } = formatKpiParts(data);
  const periodLabel = kpiSparklinePeriod(sparklinePoints);

  const [shared, setShared] = useState<DrillDownChannel | null>(null);

  // ── Actions de clic (logique pure déléguée à kpi-jumps.ts) ───────
  const numberAction = kpiNumberAction(
    data._jumps,
    data._drillDown,
    jumpsEnabled,
  );
  const trendAction = kpiTrendAction(
    data._jumps,
    data._trendDrillDown,
    jumpsEnabled,
  );

  async function legacyDrillDown(message: string) {
    if (!onAsk || !await onAsk(message)) return;
    setShared("message");
    setTimeout(() => setShared(null), 1500);
  }

  const numberContext = kpiNumberContext(data);
  const trendContext = kpiTrendContext(data, t);
  const trendPointContexts = sparklinePoints.map((point) =>
    kpiTrendPointContext(data, point)
  );

  function activateContext(
    selection: ContextSelectionItem,
  ) {
    const plan = kpiInteractionPlan(
      "context",
      false,
      contextEnabled,
      false,
    );
    if (!plan.updateContext) return;
    return activeContext.toggleReversible(selection);
  }

  function canOpenDetail(action: ReturnType<typeof kpiNumberAction>): boolean {
    return action?.kind === "jump"
      ? onOpenJump !== undefined
      : action?.kind === "drill" && onAsk !== undefined;
  }

  function toggleDetail(
    action: ReturnType<typeof kpiNumberAction>,
  ) {
    const hasJump = action?.kind === "jump" && onOpenJump !== undefined;
    const hasMessage = action?.kind === "drill" && onAsk !== undefined;
    const plan = kpiInteractionPlan(
      "detail",
      hasJump,
      contextEnabled,
      hasMessage,
    );
    if (plan.toggleLevel && action?.kind === "jump") {
      onOpenJump?.(action.jump);
    } else if (plan.sendMessage && action?.kind === "drill") {
      void legacyDrillDown(action.message);
    }
  }

  function interactionIntent(
    selection: ContextSelectionItem,
    action: ReturnType<typeof kpiNumberAction>,
  ) {
    return {
      key: selection.id,
      onSingle: () => activateContext(selection),
      onDouble: () => toggleDetail(action),
      runConversation: activeContext.runConversation,
      doublePolicy: action?.kind === "jump"
        ? "local" as const
        : "after-context" as const,
    };
  }

  function pointerClick(
    selection: ContextSelectionItem,
    action: ReturnType<typeof kpiNumberAction>,
    clickCount: number,
  ) {
    if (canOpenDetail(action)) {
      clickIntent.click(interactionIntent(selection, action), clickCount);
    } else if (contextEnabled && clickCount < 2) {
      void activeContext.toggle(selection);
    }
  }

  function pointerDoubleClick(
    selection: ContextSelectionItem,
    action: ReturnType<typeof kpiNumberAction>,
  ) {
    if (canOpenDetail(action)) {
      clickIntent.doubleClick(interactionIntent(selection, action));
    }
  }

  function keyDown(
    selection: ContextSelectionItem,
    action: ReturnType<typeof kpiNumberAction>,
    event: JSX.TargetedKeyboardEvent<HTMLElement>,
  ) {
    if (canOpenDetail(action)) {
      clickIntent.keyDown(interactionIntent(selection, action), event);
      return;
    }
    if (
      !contextEnabled || event.repeat ||
      (event.key !== " " && event.key !== "Enter")
    ) return;
    event.preventDefault();
    void activeContext.toggle(selection);
  }

  const numberHasDetail = canOpenDetail(numberAction);
  const trendHasDetail = canOpenDetail(trendAction);
  const numberInteractive = contextEnabled || numberHasDetail;
  const trendInteractive = contextEnabled || trendHasDetail;
  const numberSelected = contextEnabled &&
    activeContext.isSelected(numberContext);
  const trendSelected = activeContext.isSelected(trendContext);
  const trendPointAriaLabels = trendPointContexts.map((selection) =>
    [selection.label, selection.value].filter(Boolean).join(" · ")
  );
  const numberAriaLabel = numberInteractive
    ? contextEnabled
      ? t("context.active.select", { label: numberContext.label })
      : t("kpi.drilldown.aria_detail", { label: data.label })
    : undefined;
  const trendAriaLabel = trendInteractive
    ? contextEnabled
      ? t("context.active.select", { label: trendContext.label })
      : t("kpi.drilldown.aria_trend", { label: data.label })
    : undefined;
  const numberKeyShortcuts = numberHasDetail
    ? contextEnabled ? "Space Enter" : "Enter"
    : contextEnabled
    ? "Space Enter"
    : undefined;
  const trendKeyShortcuts = trendHasDetail
    ? contextEnabled ? "Space Enter" : "Enter"
    : contextEnabled
    ? "Space Enter"
    : undefined;
  const compact = layout !== "wide";

  /* ── Layout mobile / panel ─────────────────────────────────────── */
  if (compact) {
    return (
      <>
        <div class="flex flex-col gap-[10px] p-[14px_12px]">
          {/* Label + dot */}
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <span class="font-mono text-nano uppercase tracking-eyebrow text-ink-faint">
              {data.label}
            </span>
            {data.trend !== undefined && (
              <StatusDot trend={data.trend} trendIsGood={data.trendIsGood} />
            )}
            <ActiveContextChip
              compact
              selections={activeContext.selections}
              failed={activeContext.failed}
              pending={activeContext.pending}
              evictedLabel={activeContext.evictedLabel}
              popoverAlign="start"
              onRemove={(selection) => activeContext.remove(selection)}
              onClear={() => activeContext.clear()}
            />
          </div>

          {/* Valeur principale — double-clic / Entree ouvrent le detail. */}
          <div class="flex min-w-0 items-center justify-between gap-2">
            <span
              class={cx(
                "rounded-[4px] font-display font-semibold text-ink tabular-nums leading-none tracking-metric",
                "text-[length:var(--text-metric-compact)]",
                numberInteractive &&
                  "cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-edge",
                numberSelected &&
                  "bg-sunken outline outline-1 outline-accent-edge",
              )}
              role={numberInteractive ? "button" : undefined}
              tabIndex={numberInteractive ? 0 : undefined}
              aria-label={numberAriaLabel}
              aria-pressed={contextEnabled ? numberSelected : undefined}
              aria-keyshortcuts={numberKeyShortcuts}
              onClick={numberInteractive
                ? (event) =>
                  pointerClick(numberContext, numberAction, event.detail)
                : undefined}
              onDblClick={numberHasDetail
                ? () => pointerDoubleClick(numberContext, numberAction)
                : undefined}
              onKeyDown={numberInteractive
                ? (event) => keyDown(numberContext, numberAction, event)
                : undefined}
            >
              {amount}{" "}
              <span class="text-[length:var(--text-metric-unit)] text-ink-faint">
                {unit}
              </span>
            </span>
          </div>

          {/* Delta */}
          {data.delta !== undefined && (
            <div class="flex items-center gap-2">
              <DeltaBadge
                delta={data.delta}
                trend={data.trend}
                trendIsGood={data.trendIsGood}
              />
              {data.deltaValue != null && (
                <span class="text-[11.5px] text-ink-muted">
                  {t("kpi.delta.vs_label")} {formatDeltaValue(data)}
                </span>
              )}
              {data.deltaValue == null && data.deltaLabel && (
                <span class="text-[11.5px] text-ink-muted">
                  {data.deltaLabel}
                </span>
              )}
            </div>
          )}

          {/* Confirmation drill-down */}
          {shared && <DrillDownConfirm channel={shared} />}

          {/* Sparkline inline : surface de contexte et chevron independants. */}
          {sparkline && (
            <div
              class={cx(
                "relative border-t border-line-soft pt-1.5",
                trendSelected &&
                  "bg-sunken outline outline-1 outline-accent-edge",
              )}
            >
              {trendInteractive && (
                <button
                  type="button"
                  class="absolute inset-x-0 bottom-0 top-1.5 z-0 rounded-[4px] border-0 bg-transparent p-0 hover:bg-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-edge"
                  aria-label={trendAriaLabel}
                  aria-pressed={contextEnabled ? trendSelected : undefined}
                  aria-keyshortcuts={trendKeyShortcuts}
                  onClick={(event) =>
                    pointerClick(trendContext, trendAction, event.detail)}
                  onDblClick={trendHasDetail
                    ? () => pointerDoubleClick(trendContext, trendAction)
                    : undefined}
                  onKeyDown={(event) =>
                    keyDown(trendContext, trendAction, event)}
                />
              )}
              <div class="pointer-events-none relative z-10">
                <SparklineBars
                  values={sparkline}
                  labels={sparklineLabels}
                  ariaLabels={trendPointAriaLabels}
                  height={44}
                  gap={4}
                  contextEnabled={contextEnabled}
                  isSelected={(index) =>
                    activeContext.isSelected(trendPointContexts[index])}
                  ariaKeyShortcuts={trendKeyShortcuts}
                  onClick={trendInteractive
                    ? (index, event) =>
                      pointerClick(
                        trendPointContexts[index] ?? trendContext,
                        trendAction,
                        event.detail,
                      )
                    : undefined}
                  onDoubleClick={trendHasDetail
                    ? (index) =>
                      pointerDoubleClick(
                        trendPointContexts[index] ?? trendContext,
                        trendAction,
                      )
                    : undefined}
                  onKeyDown={trendInteractive
                    ? (index, event) =>
                      keyDown(
                        trendPointContexts[index] ?? trendContext,
                        trendAction,
                        event,
                      )
                    : undefined}
                />
              </div>
            </div>
          )}

          {/* Erreur inline — doctrine : bloc border-l-2, pas un StateMessage */}
          {error && <InlineError message={error} onRetry={onRefresh} />}
        </div>

        {/* Pied de marque — présent dans toutes les mises en page. */}
        <footer class="flex justify-end border-t border-line px-3 py-[9px]">
          <CasysCredit compact />
        </footer>
      </>
    );
  }

  /* ── Layout wide ──────────────────────────────────────────────── */
  return (
    <>
      {/* Grille 2 colonnes */}
      <div
        class="grid min-h-0"
        style={{ gridTemplateColumns: "1fr 300px" }}
      >
        {/* Colonne gauche */}
        <div class="flex flex-col gap-[10px] p-[18px_16px]">
          {/* Label + dot */}
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <span class="font-mono text-micro uppercase tracking-eyebrow text-ink-faint">
              {data.label}
            </span>
            {data.trend !== undefined && (
              <StatusDot trend={data.trend} trendIsGood={data.trendIsGood} />
            )}
            <ActiveContextChip
              selections={activeContext.selections}
              failed={activeContext.failed}
              pending={activeContext.pending}
              evictedLabel={activeContext.evictedLabel}
              popoverAlign="start"
              onRemove={(selection) => activeContext.remove(selection)}
              onClear={() => activeContext.clear()}
            />
          </div>

          {/* Valeur principale — double-clic / Entree ouvrent le detail. */}
          <div class="flex min-w-0 items-center gap-2">
            <span
              class={cx(
                "rounded-[4px] font-display font-semibold text-ink tabular-nums leading-none tracking-metric",
                "text-[length:var(--text-metric)]",
                numberInteractive &&
                  "cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-edge",
                numberSelected &&
                  "bg-sunken outline outline-1 outline-accent-edge",
              )}
              role={numberInteractive ? "button" : undefined}
              tabIndex={numberInteractive ? 0 : undefined}
              aria-label={numberAriaLabel}
              aria-pressed={contextEnabled ? numberSelected : undefined}
              aria-keyshortcuts={numberKeyShortcuts}
              onClick={numberInteractive
                ? (event) =>
                  pointerClick(numberContext, numberAction, event.detail)
                : undefined}
              onDblClick={numberHasDetail
                ? () => pointerDoubleClick(numberContext, numberAction)
                : undefined}
              onKeyDown={numberInteractive
                ? (event) => keyDown(numberContext, numberAction, event)
                : undefined}
            >
              {amount} <span class="text-[26px] text-ink-faint">{unit}</span>
            </span>
          </div>

          {/* Delta */}
          {data.delta !== undefined && (
            <div class="flex items-center gap-[9px]">
              <DeltaBadge
                delta={data.delta}
                trend={data.trend}
                trendIsGood={data.trendIsGood}
              />
              <span class="text-[12px] text-ink-muted">
                {data.deltaValue != null
                  ? `${t("kpi.delta.vs_label")} ${formatDeltaValue(data)}${
                    data.deltaLabel ? ` ${data.deltaLabel}` : ""
                  }`
                  : data.deltaLabel}
              </span>
            </div>
          )}

          {/* Confirmation drill-down — H7 */}
          {shared && <DrillDownConfirm channel={shared} />}

          {/* Erreur inline — H5 : bloc border-l-2, pas une simple ligne colorée */}
          {error && <InlineError message={error} onRetry={onRefresh} />}
        </div>

        {/* Colonne droite — panneau sunken avec sparkline — H2 */}
        {sparkline && (
          <div
            class={cx(
              "relative border-l border-line bg-sunken p-[18px_16px]",
              trendSelected && "outline outline-1 outline-accent-edge",
            )}
            style={{ outlineOffset: "-1px" }}
          >
            <div class="relative h-full rounded-[4px]">
              {trendInteractive && (
                <button
                  type="button"
                  class="absolute inset-0 z-0 rounded-[4px] border-0 bg-transparent p-0 hover:outline hover:outline-1 hover:outline-accent-edge focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-edge"
                  aria-label={trendAriaLabel}
                  aria-pressed={contextEnabled ? trendSelected : undefined}
                  aria-keyshortcuts={trendKeyShortcuts}
                  onClick={(event) =>
                    pointerClick(trendContext, trendAction, event.detail)}
                  onDblClick={trendHasDetail
                    ? () => pointerDoubleClick(trendContext, trendAction)
                    : undefined}
                  onKeyDown={(event) =>
                    keyDown(trendContext, trendAction, event)}
                />
              )}
              <div class="pointer-events-none relative z-10 flex h-full flex-col justify-between gap-[10px]">
                {/* Label periode + tendance → — H2 */}
                <div class="flex items-center justify-between">
                  {periodLabel && (
                    <span class="font-mono text-micro uppercase tracking-label text-ink-faint">
                      {periodLabel}
                    </span>
                  )}
                  <span class="font-mono text-micro text-accent">
                    {t("kpi.sparkline.trend_label")}
                  </span>
                </div>
                <SparklineBars
                  values={sparkline}
                  labels={sparklineLabels}
                  ariaLabels={trendPointAriaLabels}
                  height={56}
                  gap={5}
                  contextEnabled={contextEnabled}
                  isSelected={(index) =>
                    activeContext.isSelected(trendPointContexts[index])}
                  ariaKeyShortcuts={trendKeyShortcuts}
                  onClick={trendInteractive
                    ? (index, event) =>
                      pointerClick(
                        trendPointContexts[index] ?? trendContext,
                        trendAction,
                        event.detail,
                      )
                    : undefined}
                  onDoubleClick={trendHasDetail
                    ? (index) =>
                      pointerDoubleClick(
                        trendPointContexts[index] ?? trendContext,
                        trendAction,
                      )
                    : undefined}
                  onKeyDown={trendInteractive
                    ? (index, event) =>
                      keyDown(
                        trendPointContexts[index] ?? trendContext,
                        trendAction,
                        event,
                      )
                    : undefined}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer flush */}
      <footer class="flex justify-end border-t border-line px-4 py-[9px]">
        <CasysCredit />
      </footer>
    </>
  );
}

/* ── Inner viewer — nav, layout, rendu ───────────────────────────── */

/**
 * Composant interne : tient la pile de navigation, le layout et les hooks
 * qui doivent rester inconditionnels. Rendu uniquement quand `data` existe.
 */
function KpiViewerContent({
  data,
  error,
  fixture,
  refreshing,
  rootRefreshRequest,
  rootFreshEvent,
  rootMutationEvent,
  canRefreshRoot,
  onError,
  onRefresh,
  onMutationInvalidate,
  onMutationRefresh,
}: {
  data: KpiData;
  error: string | null;
  fixture: boolean;
  refreshing: boolean;
  rootRefreshRequest: UiRefreshRequestData | null;
  rootFreshEvent: number;
  rootMutationEvent: number;
  canRefreshRoot: boolean;
  onError: (msg: string | null) => void;
  onRefresh: () => void;
  onMutationInvalidate: () => void;
  onMutationRefresh?: () => void;
}) {
  const { ref: shellRef, layout, boundsStyle } = useViewerLayout<
    HTMLDivElement
  >();
  const t = useT();
  const rootKey = viewerRootKey("kpi", rootRefreshRequest ?? undefined, {
    label: data.label,
  });
  const activeContext = useActiveContext(app, rootKey);
  const hostCapabilities = fixture ? undefined : app.getHostCapabilities();
  const documentContext: DocumentContextController = {
    supported: !fixture && activeContext.supported,
    activate: activeContext.activate,
    activateReversible: activeContext.activateReversible,
    toggle: activeContext.toggle,
    toggleReversible: activeContext.toggleReversible,
    reconcileView: activeContext.reconcileView,
    reconcileDocument: activeContext.reconcileDocument,
    isSelected: activeContext.isSelected,
    canShareResource: (resource) =>
      canShareActiveContextResource(hostCapabilities, resource),
  };
  useEffect(() => {
    void activeContext.reconcileView("KPI", kpiContextCandidates(data, t));
  }, [data, activeContext.reconcileView]);
  const viewerNav = useViewerNav(app, {
    title: data.label,
    kind: "root",
    origin: "chart",
    key: rootKey,
  }, { fixture });
  const nav = viewerNav.nav;
  const { current, isRoot } = nav;
  useLayoutEffect(() => {
    const root = nav.stack.levels[0];
    if (rootFreshEvent > rootMutationEvent && root?.stale) {
      nav.clearStale(root.id);
    }
  }, [rootFreshEvent, rootMutationEvent]);
  // jumpsEnabled : les sauts sont désactivés en mode fixture (pas d'outils).
  const { jumpsEnabled } = viewerNav;
  // useDoclist tenu inconditionnellement : il retournera EMPTY_LIST à la racine.
  const { list } = viewerNav;

  /** Envoie une question au modèle (fallback « ~ » des niveaux empilés). */
  const { ask } = viewerNav;

  return (
    <ViewerShell containerRef={shellRef} style={boundsStyle}>
      {/* Aux niveaux empilés, un en-tête nomme le niveau ; le fil vient dessous. */}
      {!isRoot && (
        <ViewerHeader
          title={nav.current.title}
          count={nav.current.count}
          layout={layout}
          actions={
            <ActiveContextChip
              compact={layout !== "wide"}
              selections={activeContext.selections}
              failed={activeContext.failed}
              pending={activeContext.pending}
              evictedLabel={activeContext.evictedLabel}
              onRemove={(selection) => activeContext.remove(selection)}
              onClear={() => activeContext.clear()}
            />
          }
        />
      )}
      {/* PathBar : null au niveau 1, visible dès le 2e niveau */}
      <PathBar
        layout={layout}
        stack={nav.stack}
        onBack={nav.pop}
        onJump={nav.popTo}
        loading={current.loading}
      />
      {
        /*
         * LevelBody :
         *   - niveau 1 (root) → rend les enfants (KpiCard)
         *   - niveaux empilés → skeleton, erreur, BarsLevel, RecordLevel, DoclistBody
         */
      }
      <div class="scroll-slim flex min-h-0 flex-1 flex-col overflow-y-auto">
        <LevelBody
          level={current}
          app={app}
          list={list}
          layout={layout}
          fixture={fixture}
          onJump={jumpsEnabled ? nav.jump : undefined}
          onAsk={ask}
          onError={onError}
          onMutated={nav.markStale}
          onDocumentChanged={nav.reportDocumentChange}
          onMutationInvalidate={onMutationInvalidate}
          onMutationRefresh={onMutationRefresh}
          onRefresh={() => void nav.refreshLevel()}
          context={documentContext}
          contextView={data.label}
        >
          <>
            {isRoot && current.stale && (
              <div
                role="status"
                title={t("nav.stale_title")}
                class="flex shrink-0 items-center justify-end gap-1.5 px-3 pt-1 font-mono text-[9.5px] text-warn"
              >
                <span
                  aria-hidden="true"
                  class="size-[5px] rounded-full bg-warn"
                />
                <span>{t("nav.stale_values", { at: current.stale.at })}</span>
                {canRefreshRoot && (
                  <button
                    type="button"
                    disabled={refreshing}
                    onClick={onRefresh}
                    aria-label={t("nav.refresh")}
                    title={t("nav.refresh")}
                    class="rounded-[3px] px-1 text-[12px] leading-none text-warn hover:bg-warn/10 disabled:opacity-50"
                  >
                    {refreshing ? "…" : "↻"}
                  </button>
                )}
              </div>
            )}
            <KpiCard
              data={data}
              error={error}
              layout={layout}
              jumpsEnabled={jumpsEnabled}
              activeContext={activeContext}
              onOpenJump={jumpsEnabled
                ? (jump) => {
                  void nav.jump(jump);
                }
                : undefined}
              onAsk={ask}
              onRefresh={onRefresh}
            />
          </>
        </LevelBody>
      </div>
    </ViewerShell>
  );
}

/* ── Outer viewer — connexion et états vide/chargement ────────────── */

export function KpiViewer() {
  const fixture = isFixtureMode();

  const [data, setData] = useState<KpiData | null>(
    fixture ? KPI_FIXTURE : null,
  );
  const [loading, setLoading] = useState(!fixture);
  const [refreshing, setRefreshing] = useState(false);
  const [rootFreshEvent, setRootFreshEvent] = useState(0);
  const [rootMutationEvent, setRootMutationEvent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const dataRef = useRef<KpiData | null>(fixture ? KPI_FIXTURE : null);
  const refreshRequestRef = useRef<UiRefreshRequestData | null>(null);
  const refreshSequenceRef = useRef(createUiRefreshSequence());
  const rootEventRef = useRef(0);
  const lastRefreshStartedAtRef = useRef(0);

  function hydrateData(nextData: KpiData) {
    dataRef.current = nextData;
    refreshRequestRef.current = resolveUiRefreshRequest(
      nextData,
      refreshRequestRef.current,
    );
    setData(nextData);
    setRootFreshEvent(++rootEventRef.current);
  }

  function consumeToolResult(result: ToolResultPayload): boolean {
    const text = extractToolResultText(result);
    if (!text) return false;
    try {
      hydrateData(JSON.parse(text) as KpiData);
      setError(null);
      setLoading(false);
      return true;
    } catch (cause) {
      console.error("Parse error:", cause);
      setError(t("common.error.parse_failed"));
      setLoading(false);
      return false;
    }
  }

  async function requestRefresh(
    options: { ignoreInterval?: boolean; force?: boolean } = {},
  ) {
    if (fixture) return false;
    const request = resolveUiRefreshRequest(
      dataRef.current,
      refreshRequestRef.current,
    );
    if (
      !request ||
      !canCallViewerTool(
        app.getHostCapabilities()?.serverTools,
        readAvailableTools(dataRef.current),
        request.toolName,
      )
    ) {
      return false;
    }

    const sequence = refreshSequenceRef.current;
    if (sequence.inFlight !== null) {
      if (options.force) {
        refreshSequenceRef.current = beginUiRefresh(sequence, {
          force: true,
        }).state;
      }
      return false;
    }
    const forced = Boolean(options.force || sequence.pendingForced);
    if (
      !canRequestUiRefresh({
        request,
        visibilityState: typeof document === "undefined"
          ? "visible"
          : document.visibilityState,
        refreshInFlight: false,
        now: Date.now(),
        lastRefreshStartedAt: lastRefreshStartedAtRef.current,
        minIntervalMs: KPI_REFRESH_INTERVAL_MS,
      }, { ignoreInterval: options.ignoreInterval || forced })
    ) {
      return false;
    }

    const started = beginUiRefresh(sequence, { force: forced });
    if (started.generation === null) return false;
    refreshSequenceRef.current = started.state;
    lastRefreshStartedAtRef.current = Date.now();
    setRefreshing(true);

    let result: ToolResultPayload | null = null;
    let failure: { cause: unknown } | null = null;
    try {
      result = await app.callServerTool({
        name: request.toolName,
        arguments: request.arguments,
      }, { timeout: TOOL_CALL_TIMEOUT_MS });
    } catch (cause) {
      failure = { cause };
    }

    const completed = completeUiRefresh(
      refreshSequenceRef.current,
      started.generation,
    );
    refreshSequenceRef.current = completed.state;
    let succeeded = false;
    if (completed.accept) {
      if (failure) {
        setError(normalizeUiRefreshFailureMessage(failure.cause));
      } else if (result?.isError) {
        setError(t("common.error.refresh_failed"));
      } else if (result && consumeToolResult(result)) {
        succeeded = true;
      } else {
        setError(t("common.error.refresh_no_data"));
      }
    }
    setRefreshing(false);
    if (completed.runPending) {
      void requestRefresh({ ignoreInterval: true, force: true });
    }
    return succeeded;
  }

  useEffect(() => {
    if (fixture) return;
    app.ontoolresult = (result: ToolResultPayload) => {
      refreshSequenceRef.current = invalidateUiRefresh(
        refreshSequenceRef.current,
      );
      consumeToolResult(result);
    };
    app.ontoolinputpartial = () => {
      if (!dataRef.current) setLoading(true);
    };
    app.connect().then(() => bindHostContext(app)).catch(() => {});
  }, [fixture]);

  useEffect(() => {
    if (fixture) return;
    function handleWindowFocus() {
      void requestRefresh({ ignoreInterval: true });
    }
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void requestRefresh({ ignoreInterval: true });
      }
    }
    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fixture]);

  /* ── État chargement — H3 : skeleton KPI-shaped, pas un StateMessage ── */
  if (loading) {
    return (
      <ViewerShell>
        <KpiLoadingSkeleton />
      </ViewerShell>
    );
  }

  /* ── État vide — H4 : mini-barres fantômes, pas un StateMessage ── */
  if (!data) {
    return (
      <ViewerShell>
        <KpiEmptyState />
      </ViewerShell>
    );
  }

  const rootRefreshRequest = resolveUiRefreshRequest(
    data,
    refreshRequestRef.current,
  );
  const canRefreshRoot = Boolean(
    !fixture &&
      rootRefreshRequest &&
      app.getHostCapabilities()?.serverTools &&
      readAvailableTools(data)?.includes(rootRefreshRequest.toolName),
  );

  return (
    <KpiViewerContent
      data={data}
      error={error}
      fixture={fixture}
      refreshing={refreshing}
      rootRefreshRequest={rootRefreshRequest}
      rootFreshEvent={rootFreshEvent}
      rootMutationEvent={rootMutationEvent}
      canRefreshRoot={canRefreshRoot}
      onError={setError}
      onRefresh={() =>
        void requestRefresh({ ignoreInterval: true, force: true })}
      onMutationInvalidate={() => {
        setRootMutationEvent(++rootEventRef.current);
        refreshSequenceRef.current = invalidateUiRefresh(
          refreshSequenceRef.current,
        );
      }}
      onMutationRefresh={canRefreshRoot
        ? () => void requestRefresh({ ignoreInterval: true, force: true })
        : undefined}
    />
  );
}
