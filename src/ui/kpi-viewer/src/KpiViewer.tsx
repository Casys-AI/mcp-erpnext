/** @jsxImportSource preact */
/**
 * KPI viewer — Direction B v2.
 * Pile de navigation câblée : sauts « › » quand l'hôte relaie les outils,
 * comportement drillDown inchangé sinon.
 */
import { useEffect, useRef, useState } from "preact/hooks";
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
import { PathBar } from "~/shared/PathBar";
import { type Jump } from "~/shared/jumps";
import { LevelBody } from "~/shared/levels/LevelBody";
import { useDoclist } from "~/shared/doclist/useDoclist";
import {
  canRequestUiRefresh,
  extractToolResultText,
  normalizeUiRefreshFailureMessage,
  resolveUiRefreshRequest,
  type ToolResultPayload,
  type UiRefreshRequestData,
} from "~/shared/refresh";
import { isFixtureMode, KPI_FIXTURE } from "./fixture.ts";
import type { KpiData } from "./types.ts";
import { currentLocale, formatNumber, toNumber } from "~/shared/format";
import { t } from "~/shared/i18n.ts";
import { useT } from "~/shared/i18n-hook.ts";
import {
  type DrillDownChannel,
  drillDownChannel,
  sharedLabel,
  shareSelection,
} from "~/shared/drill-down";
import { kpiNumberAction, kpiTrendAction } from "./kpi-jumps.ts";

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

/* ── Accessibilité clavier ────────────────────────────────────────── */

/** Rend un élément cliquable accessible au clavier (Entrée / Espace). */
function activationHandlers(onActivate?: () => void) {
  if (!onActivate) return {};
  return {
    role: "button" as const,
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      onActivate();
    },
  };
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

function SparklineBars({ values, height, gap }: {
  values: number[];
  /** Hauteur totale du conteneur en px. */
  height: number;
  gap: number;
}) {
  const pcts = sparklineHeights(values);
  return (
    <div
      class="flex items-end rounded-bar"
      style={{ height: `${height}px`, gap: `${gap}px` }}
    >
      {pcts.map((h, i) => (
        <div
          key={i}
          class={cx("flex-1 rounded-bar", sparklineBarClass(i, values.length))}
          style={{ height: `${Math.max(h, 4)}%` }}
        />
      ))}
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
  onJump,
  onRefresh,
}: {
  data: KpiData;
  error: string | null;
  layout: "wide" | "panel" | "mobile";
  jumpsEnabled: boolean;
  onJump?: (jump: Jump) => void;
  onRefresh?: () => void;
}) {
  const t = useT();
  const canDrill = drillDownChannel(app.getHostCapabilities()) !== "none";
  const sparkline = data.sparkline && data.sparkline.length >= 2
    ? data.sparkline
    : undefined;

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

  async function drillDown(message: string) {
    if (!canDrill) return;
    const { amount, unit } = formatKpiParts(data);
    const channel = await shareSelection(app, {
      view: "KPI",
      label: data.label,
      value: [amount, unit].filter(Boolean).join(" "),
      suggested: message,
    });
    if (channel === "none") return;
    setShared(channel);
    setTimeout(() => setShared(null), 1500);
  }

  // La couleur du chevron annonce le niveau qui arrive : accent pour une
  // liste, brand pour un graphique.
  const numberChevron = data._jumps?.number?.kind === "chart"
    ? "text-brand"
    : "text-accent";
  const trendChevron = data._jumps?.trend?.kind === "chart"
    ? "text-brand"
    : "text-accent";
  const handleNumber: (() => void) | undefined = numberAction?.kind === "jump"
    ? () => onJump?.(numberAction.jump)
    : numberAction?.kind === "drill" && canDrill
    ? () => void drillDown(numberAction.message)
    : undefined;

  const handleTrend: (() => void) | undefined = trendAction?.kind === "jump"
    ? () => onJump?.(trendAction.jump)
    : trendAction?.kind === "drill" && canDrill
    ? () => void drillDown(trendAction.message)
    : undefined;

  const { amount, unit } = formatKpiParts(data);
  const compact = layout !== "wide";
  const periodLabel = sparkline
    ? t("kpi.sparkline.weeks", { n: sparkline.length })
    : undefined;

  /* ── Layout mobile / panel ─────────────────────────────────────── */
  if (compact) {
    return (
      <>
        <div class="flex flex-col gap-[10px] p-[14px_12px]">
          {/* Label + dot */}
          <div class="flex items-center gap-2">
            <span class="font-mono text-nano uppercase tracking-eyebrow text-ink-faint">
              {data.label}
            </span>
            {data.trend !== undefined && (
              <StatusDot trend={data.trend} trendIsGood={data.trendIsGood} />
            )}
          </div>

          {/* Valeur principale */}
          <span
            class={cx(
              "font-display font-semibold text-ink tabular-nums leading-none tracking-metric",
              "text-[length:var(--text-metric-compact)]",
              numberAction?.kind === "jump" &&
                "group/num cursor-pointer hover:underline decoration-dotted underline-offset-[6px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-edge",
              numberAction?.kind === "drill" && canDrill &&
                "cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-edge",
            )}
            style={numberAction?.kind === "drill" && canDrill
              ? {
                borderBottom: "1px dashed var(--color-accent-edge)",
                paddingBottom: "1px",
              }
              : undefined}
            aria-label={handleNumber
              ? t("kpi.drilldown.aria_detail", { label: data.label })
              : undefined}
            {...activationHandlers(handleNumber)}
          >
            {amount}
            {numberAction?.kind === "jump" && (
              <span
                aria-hidden="true"
                class={`select-none opacity-0 group-hover/num:opacity-100 group-focus-visible/num:opacity-100 ml-0.5 text-[0.5em] align-middle ${numberChevron}`}
              >
                {" "}›
              </span>
            )}{" "}
            <span class="text-[length:var(--text-metric-unit)] text-ink-faint">
              {unit}
            </span>
          </span>

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

          {/* Sparkline inline — cliquable si handleTrend est défini */}
          {sparkline && (
            <div
              class={cx(
                "border-t border-line-soft pt-1.5",
                trendAction?.kind === "jump" &&
                  "group/trend cursor-pointer rounded-[4px] hover:bg-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-edge",
                trendAction?.kind === "drill" && canDrill &&
                  "cursor-pointer rounded-[4px] hover:bg-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-edge",
              )}
              aria-label={handleTrend
                ? t("kpi.drilldown.aria_trend", { label: data.label })
                : undefined}
              {...activationHandlers(handleTrend)}
            >
              {trendAction?.kind === "jump" && (
                <div class="flex justify-end mb-0.5">
                  <span
                    aria-hidden="true"
                    class={`font-mono text-micro opacity-0 group-hover/trend:opacity-100 group-focus-visible/trend:opacity-100 select-none ${trendChevron}`}
                  >
                    ›
                  </span>
                </div>
              )}
              <SparklineBars values={sparkline} height={44} gap={4} />
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
          <div class="flex items-center gap-2">
            <span class="font-mono text-micro uppercase tracking-eyebrow text-ink-faint">
              {data.label}
            </span>
            {data.trend !== undefined && (
              <StatusDot trend={data.trend} trendIsGood={data.trendIsGood} />
            )}
          </div>

          {/* Valeur principale — H1 : jump › ou soulignement pointillé au survol */}
          <span
            class={cx(
              "font-display font-semibold text-ink tabular-nums leading-none tracking-metric",
              "text-[length:var(--text-metric)]",
              numberAction?.kind === "jump" &&
                "group/num cursor-pointer hover:underline decoration-dotted underline-offset-[6px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-edge",
              numberAction?.kind === "drill" && canDrill &&
                "cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-edge",
            )}
            style={numberAction?.kind === "drill" && canDrill
              ? {
                /* style inline légal : valeur de layout/interaction, pas une couleur brute */
                borderBottom: "1px dashed var(--color-accent-edge)",
                paddingBottom: "1px",
              }
              : undefined}
            aria-label={handleNumber
              ? t("kpi.drilldown.aria_detail", { label: data.label })
              : undefined}
            {...activationHandlers(handleNumber)}
          >
            {amount}
            {numberAction?.kind === "jump" && (
              <span
                aria-hidden="true"
                class={`select-none opacity-0 group-hover/num:opacity-100 group-focus-visible/num:opacity-100 ml-0.5 text-[0.5em] align-middle ${numberChevron}`}
              >
                {" "}›
              </span>
            )} <span class="text-[26px] text-ink-faint">{unit}</span>
          </span>

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
              "flex flex-col justify-between gap-[10px] border-l border-line bg-sunken p-[18px_16px]",
              "hover:outline hover:outline-1 hover:outline-accent-edge",
              trendAction?.kind === "jump" &&
                "group/trend cursor-pointer rounded-[4px] hover:bg-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-edge",
              trendAction?.kind === "drill" && canDrill &&
                "cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-edge",
            )}
            style={{ outlineOffset: "-1px" }}
            aria-label={handleTrend
              ? t("kpi.drilldown.aria_trend", { label: data.label })
              : undefined}
            {...activationHandlers(handleTrend)}
          >
            {/* Label période + tendance → — H2 */}
            <div class="flex items-center justify-between">
              {periodLabel && (
                <span class="font-mono text-micro uppercase tracking-label text-ink-faint">
                  {periodLabel}
                </span>
              )}
              <span class="font-mono text-micro text-accent flex items-center gap-1">
                {t("kpi.sparkline.trend_label")}
                {trendAction?.kind === "jump" && (
                  <span
                    aria-hidden="true"
                    class={`select-none opacity-0 group-hover/trend:opacity-100 group-focus-visible/trend:opacity-100 ${trendChevron}`}
                  >
                    {" "}›
                  </span>
                )}
              </span>
            </div>
            <SparklineBars values={sparkline} height={56} gap={5} />
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
  onError,
  onRefresh,
}: {
  data: KpiData;
  error: string | null;
  fixture: boolean;
  onError: (msg: string | null) => void;
  onRefresh: () => void;
}) {
  const { ref: shellRef, layout } = useViewerLayout<HTMLDivElement>();
  const viewerNav = useViewerNav(app, {
    title: data.label,
    kind: "root",
    origin: "chart",
  }, { fixture });
  const nav = viewerNav.nav;
  const { current, isRoot } = nav;
  // jumpsEnabled : les sauts sont désactivés en mode fixture (pas d'outils).
  const { jumpsEnabled } = viewerNav;
  // useDoclist tenu inconditionnellement : il retournera EMPTY_LIST à la racine.
  const { list } = viewerNav;

  /** Envoie une question au modèle (fallback « ~ » des niveaux empilés). */
  const { ask } = viewerNav;

  return (
    <ViewerShell
      class={cx(!isRoot && "h-screen")}
      containerRef={shellRef}
    >
      {/* Aux niveaux empilés, un en-tête nomme le niveau ; le fil vient dessous. */}
      {!isRoot && (
        <ViewerHeader
          title={nav.current.title}
          count={nav.current.count}
          layout={layout}
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
        onRefresh={() => void nav.refreshLevel()}
      >
        <KpiCard
          data={data}
          error={error}
          layout={layout}
          jumpsEnabled={jumpsEnabled}
          onJump={jumpsEnabled ? nav.jump : undefined}
          onRefresh={onRefresh}
        />
      </LevelBody>
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
  const [error, setError] = useState<string | null>(null);
  const dataRef = useRef<KpiData | null>(fixture ? KPI_FIXTURE : null);
  const refreshRequestRef = useRef<UiRefreshRequestData | null>(null);
  const refreshInFlightRef = useRef(false);
  const lastRefreshStartedAtRef = useRef(0);

  function hydrateData(nextData: KpiData) {
    dataRef.current = nextData;
    refreshRequestRef.current = resolveUiRefreshRequest(
      nextData,
      refreshRequestRef.current,
    );
    setData(nextData);
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

  async function requestRefresh(options: { ignoreInterval?: boolean } = {}) {
    if (fixture) return false;
    const request = resolveUiRefreshRequest(
      dataRef.current,
      refreshRequestRef.current,
    );
    if (
      !canRequestUiRefresh({
        request,
        visibilityState: typeof document === "undefined"
          ? "visible"
          : document.visibilityState,
        refreshInFlight: refreshInFlightRef.current,
        now: Date.now(),
        lastRefreshStartedAt: lastRefreshStartedAtRef.current,
        minIntervalMs: KPI_REFRESH_INTERVAL_MS,
      }, options)
    ) {
      return false;
    }
    if (!request || !app.getHostCapabilities()?.serverTools) return false;

    refreshInFlightRef.current = true;
    lastRefreshStartedAtRef.current = Date.now();
    try {
      const result = await app.callServerTool({
        name: request.toolName,
        arguments: request.arguments,
      }, { timeout: TOOL_CALL_TIMEOUT_MS });
      if (result.isError) {
        setError(t("common.error.refresh_failed"));
        return false;
      }
      if (!consumeToolResult(result)) {
        setError(t("common.error.refresh_no_data"));
        return false;
      }
      return true;
    } catch (cause) {
      setError(normalizeUiRefreshFailureMessage(cause));
      return false;
    } finally {
      refreshInFlightRef.current = false;
    }
  }

  useEffect(() => {
    if (fixture) return;
    app.ontoolresult = (result: ToolResultPayload) => {
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

  return (
    <KpiViewerContent
      data={data}
      error={error}
      fixture={fixture}
      onError={setError}
      onRefresh={() => void requestRefresh({ ignoreInterval: true })}
    />
  );
}
