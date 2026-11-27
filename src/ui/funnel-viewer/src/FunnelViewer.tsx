/** @jsxImportSource preact */
/**
 * Funnel viewer — Direction B v2.
 * Horizontal bar chart replacing the old trapezoid layout.
 * Handshake stays on ext-apps (refresh / callServerTool / sendMessage).
 *
 * A stage previews its figures locally. Its detail action can open ERPNext
 * records or ask the host, and its pin independently shares the stage.
 */
import { useViewerApp } from "~/shared/viewer-app";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { bindHostContext } from "~/shared/host-context-hook";
import {
  CasysCredit,
  ContextChipRow,
  cx,
  StateMessage,
  ViewerShell,
} from "~/shared/ui";
import { useViewerLayout } from "~/shared/useViewerLayout";
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
import { FUNNEL_FIXTURE, isFixtureMode } from "./fixture.ts";
import type { FunnelData, FunnelStage } from "./types.ts";
import { type TFunction, useT } from "~/shared/i18n-hook";
import { type DrillDownChannel, sharedLabel } from "~/shared/drill-down";
import { useViewerNav } from "~/shared/useViewerNav";
import { viewerRootKey } from "~/shared/nav-stack.ts";
import { PathBar } from "~/shared/PathBar";
import { jumpFromHint } from "~/shared/jumps";
import { canCallViewerTool, readAvailableTools } from "~/shared/viewer-tools";
import { LevelBody } from "~/shared/levels/LevelBody";
import {
  funnelStageValueText,
  stageIsJumpable,
  stageNavHint,
} from "./funnel-nav.ts";
import { ActiveContextChip } from "~/shared/ActiveContextChip.tsx";
import { DetailToggleButton } from "~/shared/DetailToggleButton.tsx";
import { useActiveContext } from "~/shared/useActiveContext.ts";
import { ContextPinButton, DisclosureChevron } from "@mcpview/components/preact/controls";
import { acceptsDetailToggleClick } from "~/shared/detail-toggle.ts";
import {
  canShareActiveContextResource,
  type ContextSelectionItem,
} from "~/shared/active-context.ts";
import type { DocumentContextController } from "~/shared/document/context-interaction.ts";

const standaloneApp = /* @__PURE__ */ new App({
  name: "Funnel Viewer",
  version: "1.0.0",
});
const FUNNEL_REFRESH_INTERVAL_MS = 15_000;
const TOOL_CALL_TIMEOUT_MS = 10_000;

/** Maps ERPNext stage labels (data) to i18n keys for the drill-down message. */
const STAGE_DRILL_DOWN_KEY: Record<string, string> = {
  "Leads": "funnel.drill_down.leads",
  "Lead": "funnel.drill_down.leads",
  "Opportunities": "funnel.drill_down.opportunities",
  "Opportunity": "funnel.drill_down.opportunities",
  "Quotations": "funnel.drill_down.quotations",
  "Quotation": "funnel.drill_down.quotations",
  "Sales Orders": "funnel.drill_down.orders",
  "Sales Order": "funnel.drill_down.orders",
  "Orders": "funnel.drill_down.orders",
};

function getStageDrillDown(label: string, tf: TFunction): string | undefined {
  const key = STAGE_DRILL_DOWN_KEY[label];
  return key ? tf(key) : undefined;
}

function funnelStageContext(
  data: FunnelData,
  stage: FunnelStage,
): ContextSelectionItem {
  return {
    id: `funnel:${data.title}:${stage.label}`,
    view: data.title,
    label: stage.label,
    value: String(stage.count),
  };
}

interface FunnelChartProps {
  stages: FunnelStage[];
  currency?: string;
  activeStage: string | null;
  onInspect: (label: string) => void;
  contextEnabled: boolean;
  isPinned: (stage: FunnelStage) => boolean;
  onTogglePin: (stage: FunnelStage) => void;
  hasNavJump: (label: string) => boolean;
  hasDetail: (stage: FunnelStage) => boolean;
  onOpenDetail: (stage: FunnelStage) => Promise<DrillDownChannel>;
}

function StageActions({ stage, chart, onDetail, touch = false }: {
  stage: FunnelStage;
  chart: FunnelChartProps;
  onDetail?: () => void;
  touch?: boolean;
}) {
  const t = useT();
  const pinned = chart.isPinned(stage);
  const local = chart.hasNavJump(stage.label);
  return (
    <div class="flex shrink-0 items-center justify-end">
      {onDetail && chart.hasDetail(stage) && (
        <DetailToggleButton
          label={stage.label}
          actionLabel={t(
            local ? "interaction.detail.open" : "interaction.detail.ask",
            { label: stage.label },
          )}
          hint={t(local ? "interaction.detail.button_hint" : "nav.ask")}
          onToggle={onDetail}
          touch={touch}
        />
      )}
      {chart.contextEnabled && (
        <ContextPinButton
          label={t(pinned ? "context.pin.remove" : "context.pin.add", {
            label: stage.label,
          })}
          pressed={pinned}
          onToggle={() => chart.onTogglePin(stage)}
        />
      )}
    </div>
  );
}

/* ── Palette positionnelle ────────────────────────────────────────────
   Les couleurs dépendent de la position dans le funnel, pas du serveur.
   Le dernier stage reçoit toujours la brand color.
──────────────────────────────────────────────────────────────────────── */
/**
 * Couleurs des étapes, en tokens plutôt qu'en hex.
 *
 * Un entonnoir descend : ses étapes encodent une grandeur, pas des identités.
 * On prend donc l'échelle séquentielle teal — une seule teinte, du plus fort au
 * plus faible — et la couleur de marque pour la dernière étape, qui est
 * l'aboutissement et mérite de se détacher.
 *
 * Ces valeurs partent en style inline parce que la hauteur des barres est
 * calculée : c'est un des cas légitimes. La garde `@source inline` de
 * tokens.css empêche Tailwind de les élaguer.
 */
const STAGE_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
] as const;

const FINAL_STAGE_COLOR = "var(--color-brand)";

function getBarColor(index: number, total: number): string {
  if (index === total - 1) return FINAL_STAGE_COLOR;
  return STAGE_COLORS[Math.min(index, STAGE_COLORS.length - 1)];
}

function getBarRadius(index: number, total: number): string {
  if (total === 1) return "2px";
  if (index === 0) return "2px 0 0 2px";
  if (index === total - 1) return "0 2px 2px 0";
  return "2px";
}

/**
 * Tonalité du taux de conversion.
 *
 * ARBITRAGE OUVERT : la maquette montre 76 % en ambre alors que ce seuil rend
 * « bon » tout ce qui dépasse 20 %. On applique le comportement du code, pas
 * les valeurs de la maquette — le seuil est une décision métier, pas graphique.
 */
function conversionColor(rate: number): string {
  if (rate > 20) return "var(--color-ok)";
  if (rate > 5) return "var(--color-warn-text)";
  return "var(--color-bad)";
}

/* ── Connecteur (wide) ───────────────────────────────────────────────── */

function WideConnector({ rate }: { rate: number }) {
  const color = conversionColor(rate);
  const arrowColor = "var(--color-line-hover)";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-end",
        width: 52,
        paddingBottom: 22,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10.5,
          color,
          lineHeight: 1.2,
        }}
      >
        {rate} %
      </span>
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        style={{ color: arrowColor }}
        aria-hidden="true"
      >
        <path
          d="M2 7h10M12 7l-3.2-3.2M12 7l-3.2 3.2"
          stroke="currentColor"
          stroke-width="1.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </div>
  );
}

/* ── Wide layout ─────────────────────────────────────────────────────── */

function WideFunnelChart(chart: FunnelChartProps) {
  const { stages, currency, activeStage, onInspect, onOpenDetail } = chart;
  const maxCount = Math.max(1, ...stages.map((s) => s.count));
  const MAX_BAR_H = 64;
  const MIN_BAR_H = 4;

  // Dynamic grid template: 1fr per stage, 52px per connector
  const colParts: string[] = [];
  stages.forEach((_, i) => {
    colParts.push("1fr");
    if (i < stages.length - 1) colParts.push("52px");
  });
  const gridCols = colParts.join(" ");

  return (
    <>
      {/* Chart area */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          padding: "22px 16px 0",
          minHeight: 142,
        }}
      >
        {stages.map((stage, idx) => {
          const barH = Math.max(
            MIN_BAR_H,
            Math.round((stage.count / maxCount) * MAX_BAR_H),
          );
          const color = getBarColor(idx, stages.length);
          const radius = getBarRadius(idx, stages.length);
          const nextStage = stages[idx + 1];
          const hasConnector = nextStage?.conversionRate != null;
          const isSelected = activeStage === stage.label;

          return (
            <>
              <div
                key={`stage-${idx}`}
                class={cx(
                  "relative flex flex-1 flex-col justify-end rounded-[3px]",
                  isSelected &&
                    "bg-sunken outline outline-1 outline-accent-edge outline-offset-0",
                )}
              >
                <StageActions
                  stage={stage}
                  chart={chart}
                  onDetail={() => void onOpenDetail(stage)}
                />
                <button
                  type="button"
                  class="flex w-full cursor-pointer flex-col justify-end gap-2 rounded-[3px] text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  onClick={() => onInspect(stage.label)}
                  onDblClick={chart.hasNavJump(stage.label)
                    ? () => void onOpenDetail(stage)
                    : undefined}
                  aria-label={`${stage.label} · ${stage.count}`}
                  aria-pressed={isSelected}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 22,
                      fontWeight: 600,
                      color: "var(--color-ink)",
                      fontVariantNumeric: "tabular-nums",
                      lineHeight: 1,
                    }}
                  >
                    {stage.count}
                  </span>
                  <div
                    style={{
                      height: barH,
                      background: color,
                      borderRadius: radius,
                      opacity: isSelected ? 1 : 0.9,
                    }}
                  />
                </button>
              </div>
              {hasConnector && (
                <WideConnector
                  key={`conn-${idx}`}
                  rate={nextStage.conversionRate!}
                />
              )}
            </>
          );
        })}
      </div>

      {/* Label / value grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: gridCols,
          padding: "10px 16px 16px",
        }}
      >
        {stages.map((stage, idx) => {
          const hasValue = stage.value != null && stage.value > 0;
          const valueText = funnelStageValueText(stage.value, currency);
          return (
            <>
              <div
                key={`label-${idx}`}
                style={{
                  minWidth: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                <span
                  class="min-w-0 truncate font-mono text-chip uppercase text-ink-muted"
                  title={stage.label}
                >
                  {stage.label}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    fontVariantNumeric: hasValue ? "tabular-nums" : undefined,
                    color: hasValue
                      ? "var(--color-ink-muted)"
                      : "var(--color-ink-ghost)",
                  }}
                >
                  {valueText}
                </span>
              </div>
              {idx < stages.length - 1 && <span key={`gap-${idx}`} />}
            </>
          );
        })}
      </div>
    </>
  );
}

/* ── Mobile / Panel layout ───────────────────────────────────────────── */
/* Panel = mobile sans min-height tactile                                 */

/** SVG arc → flèche indiquant qu'un message a été envoyé. */
function SentArc() {
  return (
    /* couleur de donnée UI (accent-edge) : justifié car c'est un retour
       visuel dynamique lié au clic, pas une couleur statique de mise en page */
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      class="text-accent-edge shrink-0"
      aria-hidden="true"
    >
      <path
        d="M1 1 Q1 8 8 5"
        stroke="currentColor"
        stroke-width="1.2"
        stroke-linecap="round"
        fill="none"
      />
      <path
        d="M8 5 L6 3 M8 5 L6 7"
        stroke="currentColor"
        stroke-width="1.2"
        stroke-linecap="round"
      />
    </svg>
  );
}

function MobileFunnelChart(chart: FunnelChartProps & { touch: boolean }) {
  const { stages, activeStage, onInspect, onOpenDetail, touch } = chart;
  const t = useT();
  const maxCount = Math.max(1, ...stages.map((s) => s.count));
  const firstCount = stages[0]?.count ?? 1;

  const [sentStage, setSentStage] = useState<
    { idx: number; label: string } | null
  >(null);

  // Le message legacy reste transitoire ; la sélection vient du contexte actif.
  useEffect(() => {
    setSentStage(null);
  }, [stages]);

  async function handleRowDetail(stage: FunnelStage, idx: number) {
    const label = sharedLabel(await onOpenDetail(stage));
    if (!label) return;
    setSentStage({ idx, label });
    setTimeout(() => setSentStage(null), 1500);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", padding: 12 }}>
      {stages.map((stage, idx) => {
        const color = getBarColor(idx, stages.length);
        const barWidthPct = Math.max(
          4,
          Math.round((stage.count / maxCount) * 100),
        );
        const nextStage = stages[idx + 1];
        const hasConnector = nextStage?.conversionRate != null;
        const isSelected = activeStage === stage.label;
        const opensDetail = chart.hasNavJump(stage.label);
        const summary = `${stage.label} · ${stage.count}`;

        // Pourcentage du total (1ère étape = 100 %)
        const totalPct = firstCount > 0
          ? Math.round((stage.count / firstCount) * 100)
          : 0;

        return (
          <>
            <div
              key={`row-${idx}`}
              class={cx(
                "grid items-center rounded-[5px]",
                isSelected &&
                  "bg-sunken outline outline-1 outline-accent-edge outline-offset-0",
              )}
              style={{
                gridTemplateColumns: "minmax(0, 1fr) auto",
                gap: 4,
              }}
            >
              <button
                type="button"
                class="grid min-w-0 cursor-pointer items-center rounded-[5px] text-left hover:bg-row-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                style={{
                  gridTemplateColumns:
                    "minmax(0, 1.6fr) minmax(18px, 1fr) auto auto",
                  gap: touch ? 6 : 7,
                  minHeight: touch ? 44 : 36,
                }}
                onClick={(event) => {
                  if (!acceptsDetailToggleClick(event.detail)) return;
                  if (opensDetail) void handleRowDetail(stage, idx);
                  else onInspect(stage.label);
                }}
                aria-label={opensDetail
                  ? t("interaction.detail.open", { label: summary })
                  : summary}
                aria-pressed={opensDetail ? undefined : isSelected}
              >
                <span class="flex min-w-0 items-center gap-1 font-mono text-[10.5px] uppercase text-ink-muted">
                  {opensDetail && <DisclosureChevron expanded={false} />}
                  <span class="truncate">{stage.label}</span>
                </span>
                {/* Barre avec track de fond — hauteur 26px, overflow hidden */}
                <div class="h-[26px] w-full rounded-[3px] bg-sunken overflow-hidden">
                  <div
                    style={{
                      height: "100%",
                      width: `${barWidthPct}%`,
                      background: color,
                      borderRadius: 2,
                      opacity: isSelected ? 1 : 0.85,
                    }}
                  />
                </div>
                {/* Count : accent + gras sur la ligne sélectionnée */}
                <span
                  class={cx(
                    "font-mono text-[12.5px] text-right tabular-nums",
                    isSelected ? "text-accent font-[500]" : "text-ink",
                  )}
                >
                  {stage.count}
                </span>
                {/* Pourcentage du total */}
                <span class="font-mono text-[10.5px] text-ink-faint text-right tabular-nums">
                  {totalPct} %
                </span>
              </button>
              <StageActions
                stage={stage}
                chart={chart}
                onDetail={opensDetail
                  ? undefined
                  : () => void handleRowDetail(stage, idx)}
                touch={touch}
              />
            </div>

            {/* Ligne de confirmation du partage */}
            {sentStage?.idx === idx && (
              <div
                key={`sent-${idx}`}
                class="flex items-center gap-1.5 px-[9px] py-[3px]"
              >
                <SentArc />
                <span class="font-mono text-[10.5px] text-ink-faint">
                  {sentStage.label}
                </span>
              </div>
            )}

            {hasConnector && (
              <div
                key={`conn-${idx}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: touch
                    ? "96px minmax(32px, 1fr) 44px 42px 40px"
                    : "112px minmax(32px, 1fr) 48px 48px 40px",
                  gap: touch ? 6 : 7,
                }}
              >
                <span />
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9.5,
                    color: conversionColor(nextStage.conversionRate!),
                    padding: "1px 0",
                  }}
                >
                  ↓ {nextStage.conversionRate} %
                </span>
                <span />
                <span />
                <span />
              </div>
            )}
          </>
        );
      })}
    </div>
  );
}

/* ── FunnelContent ───────────────────────────────────────────────────── */

function FunnelContent(
  {
    data,
    error,
    refreshing,
    fixture,
    rootRefreshRequest,
    rootFreshEvent,
    rootMutationEvent,
    canRefreshRoot,
    onRefresh,
    onMutationInvalidate,
    onMutationRefresh,
    onError,
  }: {
    data: FunnelData;
    error: string | null;
    refreshing: boolean;
    fixture: boolean;
    rootRefreshRequest: UiRefreshRequestData | null;
    rootFreshEvent: number;
    rootMutationEvent: number;
    canRefreshRoot: boolean;
    onRefresh: () => void;
    onMutationInvalidate: () => void;
    onMutationRefresh?: () => void;
    onError: (msg: string | null) => void;
  },
) {
  const app = useViewerApp(standaloneApp);
  const t = useT();
  const { ref: containerRef, layout } = useViewerLayout<HTMLDivElement>();

  // ── Navigation (pile de niveaux) ──────────────────────────────────────
  const rootKey = viewerRootKey("funnel", rootRefreshRequest ?? undefined, {
    title: data.title,
  });
  const viewerNav = useViewerNav(app, {
    title: data.title,
    kind: "root",
    origin: "chart",
    key: rootKey,
  }, { fixture });
  const nav = viewerNav.nav;
  const { current: navCurrent, isRoot } = nav;
  useLayoutEffect(() => {
    const root = nav.stack.levels[0];
    if (rootFreshEvent > rootMutationEvent && root?.stale) {
      nav.clearStale(root.id);
    }
  }, [rootFreshEvent, rootMutationEvent]);

  // Les deux canaux sont independants : outils pour le niveau, message pour le repli.
  const { jumpsEnabled, messagesEnabled, ask } = viewerNav;

  // list doit être déclaré inconditionnellement avant tout return (règle hooks).
  const { list } = viewerNav;

  const stages = data.stages ?? [];
  const activeContext = useActiveContext(app, rootKey);
  const hostCapabilities = fixture ? undefined : app.getHostCapabilities();
  const documentContext: DocumentContextController = {
    supported: !fixture && activeContext.supported,
    activate: activeContext.activate,
    activateReversible: activeContext.activateReversible,
    toggle: activeContext.toggle,
    toggleReversible: activeContext.toggleReversible,
    reconcileView: activeContext.reconcileView,
    pending: activeContext.pending,
    selection: activeContext.selection,
    recordPins: activeContext.recordPins,
    toggleGroupMember: activeContext.toggleGroupMember,
    setGroupMembers: activeContext.setGroupMembers,
    addGroupMembers: activeContext.addGroupMembers,
    removeGroupMembers: activeContext.removeGroupMembers,
    reconcileGroup: activeContext.reconcileGroup,
    isGroupMemberSelected: activeContext.isGroupMemberSelected,
    reconcileDocument: activeContext.reconcileDocument,
    isSelected: activeContext.isSelected,
    canShareResource: (resource) =>
      canShareActiveContextResource(hostCapabilities, resource),
  };
  useEffect(() => {
    void activeContext.reconcileView(
      data.title,
      stages.map((stage) => funnelStageContext(data, stage)),
    );
  }, [data, activeContext.reconcileView]);
  /** Indique si une étape a un saut serveur disponible. */
  const availableTools = readAvailableTools(data);
  const hasNavJump = (label: string): boolean => stageJump(label) !== null;

  function stageMessage(stage: FunnelStage): string | undefined {
    return stage._drillDown ?? getStageDrillDown(stage.label, t);
  }

  function stageJump(label: string) {
    const navJumpHint = stageNavHint(data._stageJumps, label);
    return navJumpHint &&
        stageIsJumpable(data._stageJumps, label, jumpsEnabled, availableTools)
      ? jumpFromHint(
        navJumpHint,
        {},
        t("nav.linked_to", { id: label }),
      )
      : null;
  }

  function hasStageDetail(stage: FunnelStage): boolean {
    return stageJump(stage.label) !== null ||
      (messagesEnabled && stageMessage(stage) !== undefined);
  }

  const [inspection, setInspection] = useState<
    { root: string; label: string } | null
  >(null);
  const inspected = inspection?.root === rootKey
    ? stages.find((stage) => stage.label === inspection.label)
    : undefined;

  useEffect(() => {
    if (inspection && !inspected) setInspection(null);
  }, [inspection, inspected]);

  async function openStageDetail(
    stage: FunnelStage,
  ): Promise<DrillDownChannel> {
    const jump = stageJump(stage.label);
    const message = stageMessage(stage);
    if (jump) {
      await nav.jump(jump);
      return "none";
    }
    if (message && ask) {
      let reply: Promise<boolean> | undefined;
      await activeContext.runConversation(() => {
        reply = ask(message);
      }, Promise.resolve(true));
      if (await reply) return "message";
    }
    return "none";
  }

  if (stages.length === 0) {
    return (
      <ViewerShell containerRef={containerRef}>
        <StateMessage>{t("funnel.empty")}</StateMessage>
      </ViewerShell>
    );
  }

  const firstCount = stages[0].count;
  const lastCount = stages[stages.length - 1].count;
  const totalConversion = firstCount > 0
    ? Math.round((lastCount / firstCount) * 100)
    : 0;

  const chart: FunnelChartProps = {
    stages,
    currency: data.currency,
    activeStage: inspected?.label ?? null,
    onInspect: (label) => setInspection({ root: rootKey, label }),
    contextEnabled: documentContext.supported,
    isPinned: (stage) =>
      activeContext.isSelected(funnelStageContext(data, stage)),
    onTogglePin: (stage) =>
      void activeContext.toggle(funnelStageContext(data, stage)),
    hasNavJump,
    hasDetail: hasStageDetail,
    onOpenDetail: openStageDetail,
  };

  const isWide = layout === "wide";
  const isMobile = layout === "mobile";

  const headerPadding = isWide ? "13px 16px" : "11px 12px";
  const titleSize = isWide ? 17 : 15.5;
  const badgeText = isWide
    ? t("funnel.conversion.end_to_end", { rate: totalConversion })
    : `${totalConversion} %`;
  // color-mix suit le token : la teinte change avec le thème, pas l'opacité.
  const badgeBg = "color-mix(in srgb, var(--color-ok) 14%, transparent)";
  const badgeColor = "var(--color-ok)";

  return (
    <ViewerShell containerRef={containerRef}>
      {
        /* Erreur inline (données déjà présentes) — bande latérale, pas StateMessage.
          Doctrine G/H : StateMessage tone="bad" est réservé aux vides absolus. */
      }
      {error && (
        <div class="border-l-2 border-bad pl-[10px] mx-3 mt-2 flex items-center gap-1.5">
          <span class="size-[5px] shrink-0 rounded-full bg-bad" />
          <span class="font-mono text-[10.5px] text-ink">{error}</span>
        </div>
      )}

      {/* Header — adapte le titre et le badge selon le niveau de navigation */}
      <header
        style={{
          display: "flex",
          flexDirection: "column",
          padding: headerPadding,
          borderBottom: "1px solid var(--color-line)",
          flexShrink: 0,
        }}
      >
        <div class="flex min-w-0 items-center justify-between gap-3">
          {isRoot
            ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <h2
                    style={{
                      margin: 0,
                      fontFamily: "var(--font-display)",
                      fontSize: titleSize,
                      fontWeight: 600,
                      color: "var(--color-ink)",
                      lineHeight: 1.2,
                    }}
                  >
                    {data.title}
                  </h2>
                  {data.subtitle && (
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10.5,
                        letterSpacing: "var(--tracking-chip)",
                        textTransform: "uppercase",
                        color: "var(--color-ink-faint)",
                      }}
                    >
                      {data.subtitle}
                    </span>
                  )}
                </div>
                <div class="flex min-w-0 shrink-0 items-center gap-2">
                  {navCurrent.stale && (
                    <div
                      role="status"
                      title={t("nav.stale_title")}
                      class="flex items-center gap-1.5 font-mono text-[9.5px] text-warn"
                    >
                      <span
                        aria-hidden="true"
                        class="size-[5px] rounded-full bg-warn"
                      />
                      {isWide && (
                        <span>
                          {t("nav.stale_values", { at: navCurrent.stale.at })}
                        </span>
                      )}
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
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: isWide ? 11.5 : 10.5,
                      padding: isWide ? "3px 8px" : "2px 7px",
                      borderRadius: 3,
                      background: badgeBg,
                      color: badgeColor,
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    {badgeText}
                  </span>
                </div>
              </>
            )
            : (
              /* Niveau de navigation empilé : titre du niveau + compte si liste */
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <h2
                    style={{
                      margin: 0,
                      fontFamily: "var(--font-display)",
                      fontSize: titleSize,
                      fontWeight: 600,
                      color: "var(--color-ink)",
                      lineHeight: 1.2,
                    }}
                  >
                    {navCurrent.title}
                  </h2>
                  {navCurrent.count !== undefined &&
                    navCurrent.kind === "list" && (
                    <span class="rounded-[3px] bg-count px-[7px] py-0.5 font-mono text-[11px] text-ink-muted">
                      {navCurrent.count}
                    </span>
                  )}
                </div>
              </>
            )}
        </div>
        <ContextChipRow reserve={activeContext.supported}>
          <ActiveContextChip
            compact={!isWide}
            selections={activeContext.selections}
            selection={activeContext.selection}
            onRemoveGroup={activeContext.removeGroup}
            failed={activeContext.failed}
            pending={activeContext.pending}
            evictedLabel={activeContext.evictedLabel}
            onRemove={(selection) => activeContext.remove(selection)}
            onClear={() => activeContext.clear()}
          />
        </ContextChipRow>
      </header>

      {/* PathBar — visible uniquement en profondeur (renvoie null au niveau 1) */}
      <PathBar
        layout={layout}
        stack={nav.stack}
        onBack={nav.pop}
        onJump={nav.popTo}
        loading={navCurrent.loading}
      />

      {
        /* Corps : LevelBody rend les enfants au niveau racine, et les niveaux
          empilés (DoclistBody, RecordLevel, BarsLevel) dans les autres cas. */
      }
      <LevelBody
        level={navCurrent}
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
        contextView={data.title}
      >
        {/* Contenu racine — funnel chart */}
        {isWide
          ? <WideFunnelChart {...chart} />
          : <MobileFunnelChart {...chart} touch={isMobile} />}
        {inspected && (
          <div
            role="status"
            class="flex items-baseline gap-3 border-t border-line px-4 py-2 text-cell"
          >
            <strong>{inspected.label}</strong>
            <span class="font-mono tabular-nums">{inspected.count}</span>
            {inspected.value != null && inspected.value > 0 && (
              <span class="font-mono tabular-nums text-ink-muted">
                {funnelStageValueText(inspected.value, data.currency)}
              </span>
            )}
          </div>
        )}
      </LevelBody>

      {/* Footer */}
      <footer
        style={{
          display: "flex",
          justifyContent: "flex-end",
          padding: "9px 16px",
          borderTop: "1px solid var(--color-line)",
          flexShrink: 0,
        }}
      >
        <CasysCredit compact={!isWide} />
      </footer>
    </ViewerShell>
  );
}

/* ── FunnelViewer ─────────────────────────────────────────────────────── */

export function FunnelViewer() {
  const app = useViewerApp(standaloneApp);
  const t = useT();
  const fixture = isFixtureMode();
  const [data, setData] = useState<FunnelData | null>(
    fixture ? FUNNEL_FIXTURE : null,
  );
  const [loading, setLoading] = useState(!fixture);
  const [connectFailed, setConnectFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [rootFreshEvent, setRootFreshEvent] = useState(0);
  const [rootMutationEvent, setRootMutationEvent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const dataRef = useRef<FunnelData | null>(fixture ? FUNNEL_FIXTURE : null);
  const refreshRequestRef = useRef<UiRefreshRequestData | null>(null);
  const refreshSequenceRef = useRef(createUiRefreshSequence());
  const rootEventRef = useRef(0);
  const lastRefreshStartedAtRef = useRef(0);

  function hydrateData(nextData: FunnelData) {
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
      hydrateData(JSON.parse(text) as FunnelData);
      setError(null);
      setLoading(false);
      return true;
    } catch (cause) {
      console.error("Parse error:", cause);
      setError(t("funnel.error.parse_failed"));
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
        minIntervalMs: FUNNEL_REFRESH_INTERVAL_MS,
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
      if (!dataRef.current) {
        setLoading(true);
      }
    };

    app.connect().then(() => bindHostContext(app)).catch(() =>
      setConnectFailed(true)
    );
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

  if (connectFailed && !data) {
    return (
      <ViewerShell>
        <StateMessage tone="bad">
          {t("common.error.connect_failed")}
        </StateMessage>
      </ViewerShell>
    );
  }

  if (loading) {
    return (
      <ViewerShell>
        <StateMessage>{t("funnel.loading")}</StateMessage>
      </ViewerShell>
    );
  }

  if (!data) {
    return (
      <ViewerShell>
        <StateMessage>{t("funnel.empty")}</StateMessage>
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
    <FunnelContent
      data={data}
      error={error}
      refreshing={refreshing}
      fixture={fixture}
      rootRefreshRequest={rootRefreshRequest}
      rootFreshEvent={rootFreshEvent}
      rootMutationEvent={rootMutationEvent}
      canRefreshRoot={canRefreshRoot}
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
      onError={setError}
    />
  );
}
