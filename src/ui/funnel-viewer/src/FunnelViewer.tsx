/** @jsxImportSource preact */
/**
 * Funnel viewer — Direction B v2.
 * Horizontal bar chart replacing the old trapezoid layout.
 * Handshake stays on ext-apps (refresh / callServerTool / sendMessage).
 */
import { useEffect, useRef, useState } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { bindHostContext } from "~/shared/host-context-hook";
import { CasysCredit, cx, StateMessage, ViewerShell } from "~/shared/ui";
import { useViewerLayout } from "~/shared/useViewerLayout";
import {
  canRequestUiRefresh,
  extractToolResultText,
  normalizeUiRefreshFailureMessage,
  resolveUiRefreshRequest,
  type ToolResultPayload,
  type UiRefreshRequestData,
} from "~/shared/refresh";
import {
  beginUiRefresh,
  completeUiRefresh,
  createUiRefreshSequence,
  invalidateUiRefresh,
} from "~/shared/refresh-sequence.ts";
import { FUNNEL_FIXTURE, isFixtureMode } from "./fixture.ts";
import type { FunnelData, FunnelStage } from "./types.ts";
import { type TFunction, useT } from "~/shared/i18n-hook";
import { type DrillDownChannel, sharedLabel } from "~/shared/drill-down";
import { viewerRootKey } from "~/shared/viewer-root-key.ts";
import { canSendTextMessage } from "~/shared/host-message";
import {
  canRefreshFunnel,
  createFunnelStageIntent,
  funnelStageValueText,
  sendFunnelMessage,
  stageMessage,
} from "./funnel-nav.ts";
import { ActiveContextChip } from "~/shared/ActiveContextChip.tsx";
import { DetailToggleButton } from "~/shared/DetailToggleButton.tsx";
import { useActiveContext } from "~/shared/useActiveContext.ts";
import { useClickIntent } from "~/shared/useClickIntent.ts";
import type { ContextSelectionItem } from "~/shared/active-context.ts";
import type { ClickIntentSingleResult } from "~/shared/click-intent.ts";

const app = new App({ name: "Funnel Viewer", version: "1.0.0" });
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
  const key = Object.hasOwn(STAGE_DRILL_DOWN_KEY, label)
    ? STAGE_DRILL_DOWN_KEY[label]
    : undefined;
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

function funnelStageAriaLabel(
  stage: FunnelStage,
  contextEnabled: boolean,
  tf: TFunction,
): string {
  const key = contextEnabled
    ? "funnel.stage.aria_context"
    : "funnel.stage.aria_ask";
  return tf(key, { label: stage.label, count: stage.count });
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

function WideFunnelChart(
  {
    stages,
    currency,
    contextEnabled,
    hasDetail,
    onToggleContext,
    runConversation,
    onOpenDetail,
    isContextActive,
  }: {
    stages: FunnelStage[];
    currency?: string;
    contextEnabled: boolean;
    hasDetail: (stage: FunnelStage) => boolean;
    onToggleContext: (stage: FunnelStage) => ClickIntentSingleResult;
    runConversation: ReturnType<typeof useActiveContext>["runConversation"];
    onOpenDetail: (stage: FunnelStage) => Promise<DrillDownChannel>;
    /** Le contour ne reflète que le panier confirmé par l'hôte. */
    isContextActive: (stage: FunnelStage) => boolean;
  },
) {
  const t = useT();
  const clickIntent = useClickIntent();
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
          height: 120,
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
          const detailAvailable = hasDetail(stage);
          const interactive = contextEnabled || detailAvailable;
          const isSelected = isContextActive(stage);
          const keyShortcuts = detailAvailable
            ? contextEnabled ? "Space Enter" : "Enter"
            : contextEnabled
            ? "Space"
            : undefined;
          const intent = createFunnelStageIntent({
            key: `funnel-stage:${stage.label}`,
            contextSupported: contextEnabled,
            messageSupported: detailAvailable,
            onContext: () => onToggleContext(stage),
            runConversation,
            onConversation: () => {
              void onOpenDetail(stage);
            },
          });

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
                <div
                  role={interactive ? "button" : undefined}
                  tabIndex={interactive ? 0 : undefined}
                  class={cx(
                    "flex flex-col justify-end gap-2 rounded-[3px]",
                    interactive &&
                      "cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  )}
                  onClick={interactive
                    ? (event) => clickIntent.click(intent, event.detail)
                    : undefined}
                  onDblClick={detailAvailable
                    ? () => clickIntent.doubleClick(intent)
                    : undefined}
                  onKeyDown={interactive
                    ? (event) => {
                      if (
                        detailAvailable || (contextEnabled && event.key === " ")
                      ) {
                        clickIntent.keyDown(intent, event);
                      }
                    }
                    : undefined}
                  aria-label={interactive
                    ? funnelStageAriaLabel(stage, contextEnabled, t)
                    : undefined}
                  aria-pressed={contextEnabled ? isSelected : undefined}
                  aria-keyshortcuts={keyShortcuts}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 22,
                      fontWeight: 600,
                      color: "var(--color-ink)",
                      fontVariantNumeric: "tabular-nums",
                      lineHeight: 1,
                      paddingRight: detailAvailable ? 30 : undefined,
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
                </div>
                {detailAvailable && (
                  <DetailToggleButton
                    label={stage.label}
                    actionLabel={t("funnel.stage.aria_ask", {
                      label: stage.label,
                      count: stage.count,
                    })}
                    hint={t("nav.ask")}
                    onToggle={() => {
                      void runConversation(() => {
                        void onOpenDetail(stage);
                      }, Promise.resolve(true));
                    }}
                    class="absolute right-0 top-0"
                  />
                )}
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
                style={{ display: "flex", flexDirection: "column", gap: 2 }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10.5,
                    letterSpacing: "var(--tracking-chip)",
                    textTransform: "uppercase",
                    color: "var(--color-ink-muted)",
                  }}
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

function MobileFunnelChart(
  {
    stages,
    contextEnabled,
    hasDetail,
    onToggleContext,
    runConversation,
    onOpenDetail,
    isContextActive,
    touch,
  }: {
    stages: FunnelStage[];
    contextEnabled: boolean;
    hasDetail: (stage: FunnelStage) => boolean;
    onToggleContext: (stage: FunnelStage) => ClickIntentSingleResult;
    runConversation: ReturnType<typeof useActiveContext>["runConversation"];
    onOpenDetail: (stage: FunnelStage) => Promise<DrillDownChannel>;
    /** Les surbrillances reflètent uniquement le panier confirmé par l'hôte. */
    isContextActive: (stage: FunnelStage) => boolean;
    /** true = pointeur grossier → cibles tactiles min-height:40px */
    touch: boolean;
  },
) {
  const t = useT();
  const clickIntent = useClickIntent();
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
        const isSelected = isContextActive(stage);
        // Truncate long labels to fit 132px column (~13 chars)
        const label = stage.label.length > 12
          ? stage.label.slice(0, 11) + "."
          : stage.label;

        // Pourcentage du total (1ère étape = 100 %)
        const totalPct = firstCount > 0
          ? Math.round((stage.count / firstCount) * 100)
          : 0;

        const detailAvailable = hasDetail(stage);
        const interactive = contextEnabled || detailAvailable;
        const keyShortcuts = detailAvailable
          ? contextEnabled ? "Space Enter" : "Enter"
          : contextEnabled
          ? "Space"
          : undefined;
        const intent = createFunnelStageIntent({
          key: `funnel-stage:${stage.label}`,
          contextSupported: contextEnabled,
          messageSupported: detailAvailable,
          onContext: () => onToggleContext(stage),
          runConversation,
          onConversation: () => {
            void handleRowDetail(stage, idx);
          },
        });

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
                gridTemplateColumns: "minmax(0, 1fr) 40px",
                gap: 4,
              }}
            >
              <div
                role={interactive ? "button" : undefined}
                tabIndex={interactive ? 0 : undefined}
                class={cx(
                  "grid items-center rounded-[5px]",
                  interactive && "cursor-pointer hover:bg-row-hover",
                  interactive &&
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                )}
                style={{
                  gridTemplateColumns: touch
                    ? "96px minmax(32px, 1fr) 44px 42px"
                    : "112px minmax(32px, 1fr) 48px 48px",
                  gap: touch ? 6 : 7,
                  minHeight: touch ? 40 : undefined,
                }}
                onClick={interactive
                  ? (event) => clickIntent.click(intent, event.detail)
                  : undefined}
                onDblClick={detailAvailable
                  ? () => clickIntent.doubleClick(intent)
                  : undefined}
                onKeyDown={interactive
                  ? (event) => {
                    if (
                      detailAvailable || (contextEnabled && event.key === " ")
                    ) {
                      clickIntent.keyDown(intent, event);
                    }
                  }
                  : undefined}
                aria-label={interactive
                  ? funnelStageAriaLabel(stage, contextEnabled, t)
                  : undefined}
                aria-pressed={contextEnabled ? isSelected : undefined}
                aria-keyshortcuts={keyShortcuts}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10.5,
                    textTransform: "uppercase",
                    color: "var(--color-ink-muted)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {label}
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
              </div>
              {detailAvailable && (
                <DetailToggleButton
                  label={stage.label}
                  actionLabel={t("funnel.stage.aria_ask", {
                    label: stage.label,
                    count: stage.count,
                  })}
                  hint={t("nav.ask")}
                  onToggle={() => {
                    void runConversation(() => {
                      void handleRowDetail(stage, idx);
                    }, Promise.resolve(true));
                  }}
                  touch={touch}
                />
              )}
              {!detailAvailable && <span aria-hidden="true" />}
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
    onRefresh,
  }: {
    data: FunnelData;
    error: string | null;
    refreshing: boolean;
    fixture: boolean;
    rootRefreshRequest: UiRefreshRequestData | null;
    onRefresh: () => void;
  },
) {
  const t = useT();
  const { ref: containerRef, layout } = useViewerLayout<HTMLDivElement>();
  const rootKey = viewerRootKey("funnel", rootRefreshRequest ?? undefined, {
    title: data.title,
  });
  const stages = data.stages ?? [];
  const activeContext = useActiveContext(app, rootKey);
  const contextEnabled = !fixture && activeContext.supported;
  const messagesEnabled = !fixture &&
    canSendTextMessage(app.getHostCapabilities());
  const canRefresh = !fixture && canRefreshFunnel(
    data,
    rootRefreshRequest,
    app.getHostCapabilities()?.serverTools,
  );
  const [messageState, setMessageState] = useState<
    "idle" | "pending" | "error"
  >(
    "idle",
  );
  const rootKeyRef = useRef(rootKey);
  rootKeyRef.current = rootKey;

  useEffect(() => setMessageState("idle"), [rootKey]);

  useEffect(() => {
    void activeContext.reconcileView(
      data.title,
      stages.map((stage) => funnelStageContext(data, stage)),
    );
  }, [data, activeContext.reconcileView]);

  function detailMessage(stage: FunnelStage): string | undefined {
    return stageMessage(stage, (label) => getStageDrillDown(label, t));
  }

  function hasStageDetail(stage: FunnelStage): boolean {
    return messagesEnabled && detailMessage(stage) !== undefined;
  }

  function activateStageContext(stage: FunnelStage): ClickIntentSingleResult {
    if (!contextEnabled) return;
    return activeContext.toggleReversible(funnelStageContext(data, stage));
  }

  async function openStageDetail(
    stage: FunnelStage,
  ): Promise<DrillDownChannel> {
    const message = detailMessage(stage);
    if (!messagesEnabled || !message) return "none";
    setMessageState("pending");
    const result = await sendFunnelMessage(app, message);
    if (rootKeyRef.current !== rootKey) return "none";
    setMessageState(result === "error" ? "error" : "idle");
    return result === "message" ? "message" : "none";
  }

  const firstCount = stages[0]?.count ?? 0;
  const lastCount = stages[stages.length - 1]?.count ?? 0;
  const totalConversion = firstCount > 0
    ? Math.round((lastCount / firstCount) * 100)
    : 0;

  const isWide = layout === "wide";
  const isMobile = layout === "mobile";
  const headerPadding = isWide ? "13px 16px" : "11px 12px";
  const titleSize = isWide ? 17 : 15.5;
  const badgeText = isWide
    ? t("funnel.conversion.end_to_end", { rate: totalConversion })
    : `${totalConversion} %`;
  const badgeBg = "color-mix(in srgb, var(--color-ok) 14%, transparent)";
  const badgeColor = "var(--color-ok)";

  return (
    <ViewerShell containerRef={containerRef}>
      {error && (
        <div
          role="status"
          class="border-l-2 border-bad pl-[10px] mx-3 mt-2 flex items-center gap-1.5"
        >
          <span class="size-[5px] shrink-0 rounded-full bg-bad" />
          <span class="font-mono text-[10.5px] text-ink">{error}</span>
        </div>
      )}
      {messageState !== "idle" && (
        <div
          role="status"
          class={cx(
            "border-l-2 pl-[10px] mx-3 mt-2 font-mono text-[10.5px] text-ink",
            messageState === "error" ? "border-bad" : "border-accent",
          )}
        >
          {t(
            messageState === "error" ? "message.send_error" : "message.sending",
          )}
        </div>
      )}
      <header
        aria-busy={refreshing}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: headerPadding,
          borderBottom: "1px solid var(--color-line)",
          flexShrink: 0,
        }}
      >
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
          {canRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              aria-label={t(
                refreshing ? "common.refreshing" : "common.refresh",
              )}
              title={t(refreshing ? "common.refreshing" : "common.refresh")}
              class="inline-flex size-7 shrink-0 items-center justify-center rounded-chip text-ink-faint hover:bg-control hover:text-accent focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
            >
              <span aria-hidden="true">{refreshing ? "…" : "↻"}</span>
            </button>
          )}
          <ActiveContextChip
            compact={!isWide}
            selections={activeContext.selections}
            failed={activeContext.failed}
            pending={activeContext.pending}
            evictedLabel={activeContext.evictedLabel}
            onRemove={(selection) => activeContext.remove(selection)}
            onClear={() => activeContext.clear()}
          />
          {stages.length > 0 && (
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
          )}
        </div>
      </header>
      {stages.length === 0
        ? <StateMessage>{t("funnel.empty")}</StateMessage>
        : isWide
        ? (
          <WideFunnelChart
            stages={stages}
            currency={data.currency}
            contextEnabled={contextEnabled}
            hasDetail={hasStageDetail}
            onToggleContext={activateStageContext}
            runConversation={activeContext.runConversation}
            onOpenDetail={openStageDetail}
            isContextActive={(stage) =>
              activeContext.isSelected(funnelStageContext(data, stage))}
          />
        )
        : (
          <MobileFunnelChart
            stages={stages}
            contextEnabled={contextEnabled}
            hasDetail={hasStageDetail}
            onToggleContext={activateStageContext}
            runConversation={activeContext.runConversation}
            onOpenDetail={openStageDetail}
            isContextActive={(stage) =>
              activeContext.isSelected(funnelStageContext(data, stage))}
            touch={isMobile}
          />
        )}
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
  const t = useT();
  const fixture = isFixtureMode();
  const [data, setData] = useState<FunnelData | null>(
    fixture ? FUNNEL_FIXTURE : null,
  );
  const [loading, setLoading] = useState(!fixture);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dataRef = useRef<FunnelData | null>(fixture ? FUNNEL_FIXTURE : null);
  const refreshRequestRef = useRef<UiRefreshRequestData | null>(null);
  const refreshSequenceRef = useRef(createUiRefreshSequence());
  const lastRefreshStartedAtRef = useRef(0);

  function hydrateData(nextData: FunnelData) {
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
      !canRefreshFunnel(
        dataRef.current,
        request,
        app.getHostCapabilities()?.serverTools,
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

  return (
    <FunnelContent
      data={data}
      error={error}
      refreshing={refreshing}
      fixture={fixture}
      rootRefreshRequest={rootRefreshRequest}
      onRefresh={() =>
        void requestRefresh({ ignoreInterval: true, force: true })}
    />
  );
}
