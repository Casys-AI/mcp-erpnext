/** @jsxImportSource preact */
/**
 * Chart viewer — Direction B v2 chrome; Recharts stays the domain renderer.
 * Handshake stays on ext-apps (refresh / callServerTool / sendMessage).
 */

import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { JSX, Ref } from "preact";
import { App } from "@modelcontextprotocol/ext-apps";
import { bindHostContext } from "~/shared/host-context-hook";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  Rectangle,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  Treemap,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import type { BarShapeProps } from "recharts";

import { formatCurrency, formatNumber, formatPercent } from "~/shared/format";
import { useT } from "~/shared/i18n-hook";
import { type DrillDownChannel, sharedLabel } from "~/shared/drill-down";
import {
  cx,
  LiveDot,
  StateMessage,
  ViewerFooter,
  ViewerShell,
} from "~/shared/ui";
import { useViewerLayout, type ViewerLayout } from "~/shared/useViewerLayout";
import { useViewerNav } from "~/shared/useViewerNav";
import { useClickIntent } from "~/shared/useClickIntent.ts";
import { viewerRootKey } from "~/shared/nav-stack";
import { PathBar } from "~/shared/PathBar";
import { LevelBody } from "~/shared/levels/LevelBody";
import { chartSeriesFormat } from "~/shared/levels/bodies";
import { type Jump, jumpFromHint } from "~/shared/jumps";
import { canCallViewerTool, readAvailableTools } from "~/shared/viewer-tools";
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
import { fixtureFromSearch, isFixtureMode } from "./fixture.ts";
import type { ChartData, Dataset, ScatterSeries, TreeNode } from "./types.ts";
import { ActiveContextChip } from "~/shared/ActiveContextChip.tsx";
import { DetailToggleButton } from "~/shared/DetailToggleButton.tsx";
import { useActiveContext } from "~/shared/useActiveContext.ts";
import {
  canShareActiveContextResource,
  type ContextSelectionItem,
} from "~/shared/active-context.ts";
import type { DocumentContextController } from "~/shared/document/context-interaction.ts";
import {
  type ChartCursor,
  chartCursorCounts,
  type ChartCursorMove,
  chartDetailHintPlacement,
  chartJumpHint,
  chartNavigationGroups,
  chartPointActionPlan,
  type ChartPointActivation,
  chartPointExpansionState,
  chartPointLabel,
  chartScatterPointLabel,
  chartSelectionAt,
  chartSeriesFromTarget,
  moveChartCursor,
  resolveChartStageHeight,
} from "./chart-interactions.ts";

const app = new App({ name: "Chart Viewer", version: "3.0.0" });

/**
 * Recharts pose ses polices en props SVG, pas en classes : il lui faut la
 * chaîne CSS. On lit le token plutôt que de redire la pile de polices.
 *
 * Déclarée APRÈS `app`, et séparée d'elle : le minifieur fusionne les `const`
 * adjacents en une seule déclaration, et viewer_handshake_test.ts cherche
 * `const <id>=new App(` au mot près pour vérifier l'ordre handlers/connect.
 */
const MONO_FONT = "var(--font-mono)";
const fonts = { mono: MONO_FONT } as const;
const CHART_REFRESH_INTERVAL_MS = 15_000;
const TOOL_CALL_TIMEOUT_MS = 10_000;
const CHART_DETAIL_PANEL_ID = "chart-detail-panel";

interface ChartPointerAnchor {
  clientX: number;
  clientY: number;
}

interface ActiveChartPoint {
  label: string;
  series?: string;
  anchor?: {
    left: number;
    top: number;
    hintSide: "left" | "right";
    hintMaxWidth: number;
  };
}

type ChartDataClick = (
  label: string,
  series: string | undefined,
  activation: ChartPointActivation,
  clickCount?: number,
  anchor?: ChartPointerAnchor,
) => void;
type ChartSelectionPredicate = (label: string, series?: string) => boolean;

/**
 * Un clic de graphe catégoriel n'est traité qu'ici. La géométrie SVG porte
 * éventuellement sa série ; un clic dans la colonne seule reste générique.
 */
function activateCategoricalPoint(
  data: ChartData,
  onDataClick: ChartDataClick,
  state: Record<string, unknown> | null | undefined,
  target: unknown,
  activation: ChartPointActivation,
  clickCount: number,
  anchor: ChartPointerAnchor,
) {
  const label = chartPointLabel(data.labels, state);
  if (!label) return;
  const series = chartSeriesFromTarget(
    target,
    data.datasets.flatMap((dataset) => dataset.label ? [dataset.label] : []),
  );
  onDataClick(label, series, activation, clickCount, anchor);
}

/**
 * Palette catégorielle, en variables plutôt qu'en hex.
 *
 * Recharts ne lit pas les classes Tailwind, mais il pose ses couleurs en
 * attributs SVG — et `fill="var(--color-cat-1)"` y fonctionne. Le thème suit
 * donc tout seul, sans dupliquer la table de tokens en TypeScript ni observer
 * `data-theme` à la main.
 *
 * L'ordre est fixe : on assigne le slot 1 à la première série, jamais en
 * cycle, pour qu'un filtre qui retire une série ne repeigne pas les autres.
 * Au-delà de huit, on replie sur « Autres » plutôt que de générer une teinte.
 */
const CATEGORICAL = [
  "var(--color-cat-1)",
  "var(--color-cat-2)",
  "var(--color-cat-3)",
  "var(--color-cat-4)",
  "var(--color-cat-5)",
  "var(--color-cat-6)",
  "var(--color-cat-7)",
  "var(--color-cat-8)",
] as const;

/**
 * Une série seule n'a pas d'identité à distinguer : elle porte celle du
 * produit. La maquette la montre en teal accent, pas en première couleur
 * catégorielle — le bleu ne dirait rien de plus et coûterait la charte.
 */
const SOLO = "var(--color-accent)";

/**
 * Couleur d'une série.
 *
 * Le serveur peut imposer la sienne (`ds.color`) ; sinon on prend le slot
 * correspondant à la position de la série. Pas de modulo cyclique au-delà de
 * huit : une neuvième série reprendrait la couleur de la première et deux
 * entités porteraient la même identité. On replie sur le dernier slot, et le
 * cas se traite en amont par un regroupement « Autres ».
 */
function dsColor(ds: Dataset | ScatterSeries, i: number, total = 2) {
  if (ds.color) return ds.color;
  if (total === 1) return SOLO;
  return CATEGORICAL[Math.min(i, CATEGORICAL.length - 1)];
}

function toRows(data: ChartData) {
  return data.labels.map((label, i) => {
    const row: Record<string, string | number> = { name: label };
    for (const ds of data.datasets) {
      row[ds.label] = ds.values[i] ?? 0;
    }
    return row;
  });
}

interface ChartDotShapeProps {
  cx?: number;
  cy?: number;
  index?: number;
  payload?: { name?: unknown };
}

/** Une sélection garde une bordure visible après la disparition du tooltip. */
function selectedBarShape(
  rows: Array<Record<string, string | number>>,
  series: string | undefined,
  opacityAt: (index: number) => number,
  isSelected?: ChartSelectionPredicate,
) {
  return (props: BarShapeProps) => {
    const index = typeof props.index === "number" ? props.index : -1;
    const label = String(rows[index]?.name ?? "");
    const selected = label !== "" && isSelected?.(label, series) === true;
    return (
      <g data-chart-series={series}>
        <Rectangle
          {...props}
          data-chart-series={series}
          opacity={selected ? 1 : opacityAt(index)}
          stroke={selected ? "var(--color-accent)" : "none"}
          strokeWidth={selected ? 6 : 0}
          style={selected
            ? { filter: "drop-shadow(0 0 2.5px var(--color-accent))" }
            : undefined}
        />
        {selected && (
          <Rectangle
            {...props}
            data-chart-series={series}
            fill="none"
            opacity={1}
            pointerEvents="none"
            stroke="var(--color-surface)"
            strokeWidth={2}
          />
        )}
      </g>
    );
  };
}

/** Point persistant entouré pour les courbes et aires sélectionnées. */
function selectedPointShape(
  rows: Array<Record<string, string | number>>,
  series: string | undefined,
  color: string,
  showBase: boolean,
  isSelected?: ChartSelectionPredicate,
) {
  return (props: ChartDotShapeProps) => {
    const index = typeof props.index === "number" ? props.index : -1;
    const label = String(props.payload?.name ?? rows[index]?.name ?? "");
    const selected = label !== "" && isSelected?.(label, series) === true;
    if (!showBase && !selected) return <g />;
    const cx = props.cx ?? 0;
    const cy = props.cy ?? 0;
    return (
      <g data-chart-series={series}>
        {selected && (
          <circle
            cx={cx}
            cy={cy}
            r={7.5}
            fill="var(--color-surface)"
            stroke="var(--color-accent)"
            strokeWidth={3}
          />
        )}
        <circle cx={cx} cy={cy} r={selected ? 3.2 : 2.6} fill={color} />
      </g>
    );
  };
}

function fmtValue(v: number, data: ChartData, dataset?: Dataset) {
  const format = dataset
    ? chartSeriesFormat(data, dataset)
    : { currency: data.currency, unit: data.unit };
  if (format.currency) return formatCurrency(v, format.currency);
  if (format.unit === "%") return formatPercent(v, v % 1 === 0 ? 0 : 1);
  return `${formatNumber(v, v % 1 === 0 ? 0 : 1)}${
    format.unit ? " " + format.unit : ""
  }`;
}

/** Libellés de catégorie (barres horizontales) — mono, 10 px, estompé. */
const TICK_X = {
  fontSize: 10,
  fill: "var(--color-ink-muted)",
  fontFamily: fonts.mono,
};
/** Libellés de l'axe X — mono, 9 px, plus discret encore. Au-delà de trois
 *  points, premier / milieu / dernier, comme la carte « survol » de la maquette. */
const TICK_X_FAINT = {
  fontSize: 9,
  fill: "var(--color-ink-faint)",
  fontFamily: fonts.mono,
};
const MAX_X_TICKS = 3;
/** Grille interne : trait subtil --color-line-soft, pas le trait de section. */
const GRID = { strokeDasharray: "3 3", stroke: "var(--color-line-soft)" };
const CURSOR = { fill: "var(--color-row-hover)", opacity: 0.6 };
/** Point actif : anneau surface pour décoller le point de sa propre courbe. */
const ACTIVE_DOT_BASE = {
  r: 4.5,
  stroke: "var(--color-surface)",
  strokeWidth: 1.5,
};
/** Opacités des aires empilées : décroissant par palier 0.02. */
const STACKED_AREA_OPACITY = [0.26, 0.24, 0.22, 0.20, 0.18, 0.16, 0.14, 0.12];
const MARGIN = { top: 8, right: 16, left: 12, bottom: 4 };
/**
 * La légende, en HTML de la charte — jamais celle de Recharts.
 *
 * La `<Legend>` de la lib est la seule pièce d'un graphe rendue HORS du SVG,
 * en HTML à elle : ses icônes, sa casse, son ordre. C'est pour ça qu'elle
 * jure partout où on la laisse. La maquette ne l'emploie nulle part : elle
 * dessine un carré de 7 px et le nom en mono 10,5 px. On fait pareil, une
 * fois, pour les douze types.
 */
interface LegendItem {
  name: string;
  color: string;
  /** Série pointillée : la légende montre un tiret 7×2, pas un carré. */
  dashed?: boolean;
}
function ChartLegend({ items }: { items: LegendItem[] }) {
  if (items.length < 2) return null;
  return (
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
      {items.map((it) => (
        <span
          key={it.name}
          class="inline-flex items-center gap-[5px] font-mono text-[10px] text-ink-muted"
        >
          {/* Couleur de série : donnée ou palette indexée, inline permis. */}
          <span
            class={it.dashed
              ? "h-[2px] w-[7px] shrink-0"
              : "size-[7px] shrink-0 rounded-[2px]"}
            style={{ background: it.color }}
          />
          {it.name}
        </span>
      ))}
    </div>
  );
}

/** Les entrées de légende d'un payload, dans l'ordre des séries. */
function legendItems(data: ChartData): LegendItem[] {
  if (data.type === "scatter") {
    const series = data.scatterData ?? [];
    return series.map((sr, i) => ({
      name: sr.label,
      color: sr.color ?? CATEGORICAL[Math.min(i, CATEGORICAL.length - 1)],
    }));
  }
  if (data.type === "pie" || data.type === "donut" || data.type === "treemap") {
    return []; // ces trois-là portent leur légende dans leur propre mise en page
  }
  return data.datasets.map((ds, i) => ({
    name: ds.label,
    color: dsColor(ds, i, data.datasets.length),
    dashed: ds.strokeStyle === "dashed",
  }));
}

/**
 * La bande de curseur de la maquette, pour les graphes à lignes.
 *
 * Recharts ne dessine un rectangle que sous les barres ; sur line, area et
 * composed son curseur est un trait vertical `#ccc`, que la galerie interdit.
 * Le rectangle couvre la colonne survolée : `points` donne l'abscisse et la
 * hauteur du tracé, `width` (l'offset du graphe, étalé par Recharts) divisé
 * par le nombre de catégories donne la largeur de colonne.
 */
function BandCursor(
  { points, width, count, className }: {
    points?: { x: number; y: number }[];
    width?: number;
    count: number;
    className?: string;
  },
) {
  if (!points || points.length < 2 || !width || count < 1) return null;
  const band = width / count;
  const [a, b] = points;
  return (
    <rect
      x={a.x - band / 2}
      y={Math.min(a.y, b.y)}
      width={band}
      height={Math.abs(b.y - a.y)}
      fill="var(--color-row-hover)"
      opacity={0.6}
      stroke="none"
      class={className}
      style={{ pointerEvents: "none" }}
    />
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  data,
  contextEnabled,
  canDrillDown,
}: {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    color: string;
    payload?: { label?: unknown };
  }>;
  label?: string;
  data: ChartData;
  contextEnabled?: boolean;
  canDrillDown?: ChartSelectionPredicate;
}) {
  const t = useT();
  if (!active || !payload?.length) return null;
  const pointLabel = label ?? chartScatterPointLabel(payload[0]);
  const drilldownEnabled = Boolean(
    pointLabel &&
      (canDrillDown?.(pointLabel) ||
        payload.some((point) =>
          canDrillDown?.(pointLabel, point.name) === true
        )),
  );
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 3,
        background: "var(--color-control)",
        border: "1px solid var(--color-line)",
        borderRadius: "var(--radius-chip)",
        padding: "8px 12px",
        fontSize: 11,
        fontFamily: fonts.mono,
        boxShadow: "var(--shadow-tooltip)",
      }}
    >
      {pointLabel && (
        <div
          style={{
            color: "var(--color-ink-faint)",
            fontSize: 11,
          }}
        >
          {pointLabel}
        </div>
      )}
      {payload.map((p, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              background:
                p.color, /* série — couleur venue des données, inline permis */
              flexShrink: 0,
            }}
          />
          <span style={{ color: "var(--color-ink-muted)" }}>{p.name}:</span>
          <span
            style={{
              color: "var(--color-ink)",
              fontFamily: fonts.mono,
              fontWeight: 600,
            }}
          >
            {fmtValue(
              p.value,
              data,
              data.datasets.find((dataset) => dataset.label === p.name),
            )}
          </span>
        </div>
      ))}
      {(contextEnabled || drilldownEnabled) && (
        <div
          style={{
            borderTop: "1px solid var(--color-line)",
            marginTop: 2,
            paddingTop: 4,
            fontSize: 10,
            color: "var(--color-accent-text)",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <span>
            {t(
              contextEnabled && drilldownEnabled
                ? "chart.tooltip.click_action_context"
                : contextEnabled
                ? "chart.tooltip.click_action_context_only"
                : "chart.tooltip.click_action_fallback",
            )}
          </span>
        </div>
      )}
    </div>
  );
}

function SharedXAxis(
  { data, isVerticalLayout }: { data: ChartData; isVerticalLayout?: boolean },
) {
  if (isVerticalLayout) {
    /* Axe des valeurs des barres horizontales : muet, comme la maquette.
       La valeur se lit à l'infobulle. */
    return (
      <XAxis
        type="number"
        tick={false}
        axisLine={false}
        tickLine={false}
        height={0}
      />
    );
  }
  const labels = data.labels ?? [];
  const sparse = labels.length > MAX_X_TICKS;
  const mid = labels[Math.floor((labels.length - 1) / 2)];
  return (
    <XAxis
      dataKey="name"
      tick={TICK_X_FAINT}
      axisLine={{ stroke: "var(--color-line)" }}
      tickLine={false}
      interval={0}
      ticks={sparse ? [labels[0], mid, labels[labels.length - 1]] : undefined}
      tickMargin={6}
    />
  );
}

/**
 * Axe Y muet : aucune valeur, aucun trait — la maquette ne chiffre pas ses
 * graphes, elle donne trois lignes de grille pointillées et l'infobulle.
 * L'axe reste monté pour porter l'échelle, la grille et l'axe droit.
 */
function SharedYAxis(
  { yAxisId, orientation }: {
    yAxisId?: string;
    orientation?: "left" | "right";
  },
) {
  return (
    <YAxis
      yAxisId={yAxisId}
      orientation={orientation}
      tick={false}
      axisLine={false}
      tickLine={false}
      width={0}
      tickCount={4}
    />
  );
}

function VerticalBarChart(
  { data, onDataClick, isSelected, canDrillDown }: {
    data: ChartData;
    onDataClick?: ChartDataClick;
    isSelected?: ChartSelectionPredicate;
    canDrillDown?: ChartSelectionPredicate;
  },
) {
  const rows = toRows(data);
  const stacked = data.type === "stacked-bar";
  const single = !stacked && data.datasets.length === 1;
  /* Série seule : 0,85 partout, la dernière barre à 1 — la valeur du moment,
     que la maquette fait ressortir. Par `shape` et non par des <Cell> : sous
     Preact, des Cell enfants font disparaître les barres au premier survol. */

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={MARGIN} barCategoryGap="19%">
        <CartesianGrid {...GRID} vertical={false} />
        <SharedXAxis data={data} />
        <SharedYAxis />
        {data.showRightAxis && (
          <SharedYAxis yAxisId="right" orientation="right" />
        )}
        <Tooltip
          content={
            <ChartTooltip
              data={data}
              contextEnabled={isSelected !== undefined}
              canDrillDown={canDrillDown}
            />
          }
          cursor={CURSOR}
          isAnimationActive={false}
        />
        {data.datasets.map((ds, i) => (
          <Bar
            key={ds.label}
            dataKey={ds.label}
            fill={dsColor(ds, i, data.datasets.length)}
            /* Empilé : seul le segment du sommet est arrondi, comme la maquette. */
            radius={stacked && i < data.datasets.length - 1 ? 0 : [3, 3, 0, 0]}
            opacity={undefined}
            maxBarSize={40}
            stackId={stacked ? (ds.stack ?? "default") : undefined}
            yAxisId={ds.yAxisId}
            isAnimationActive={false}
            cursor={onDataClick ? "pointer" : undefined}
            onClick={onDataClick
              ? (entry, _index, event) =>
                onDataClick(
                  String(entry.payload?.name ?? ""),
                  ds.label || undefined,
                  "context",
                  event.detail,
                  event,
                )
              : undefined}
            onDoubleClick={onDataClick
              ? (entry, _index, event) =>
                onDataClick(
                  String(entry.payload?.name ?? ""),
                  ds.label || undefined,
                  "drilldown",
                  event.detail,
                  event,
                )
              : undefined}
            shape={selectedBarShape(
              rows,
              ds.label || undefined,
              (index) => single && index === rows.length - 1 ? 1 : 0.85,
              isSelected,
            )}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function HorizontalBarChart(
  { data, onDataClick, isSelected, canDrillDown }: {
    data: ChartData;
    onDataClick?: ChartDataClick;
    isSelected?: ChartSelectionPredicate;
    canDrillDown?: ChartSelectionPredicate;
  },
) {
  const rows = toRows(data);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={rows}
        layout="vertical"
        margin={{ ...MARGIN, left: 8 }}
        barCategoryGap="26%"
      >
        <SharedXAxis data={data} isVerticalLayout />
        <YAxis
          type="category"
          dataKey="name"
          width={80}
          tick={TICK_X}
          axisLine={{ stroke: "var(--color-line)" }}
          tickLine={false}
        />
        <Tooltip
          content={
            <ChartTooltip
              data={data}
              contextEnabled={isSelected !== undefined}
              canDrillDown={canDrillDown}
            />
          }
          cursor={CURSOR}
          isAnimationActive={false}
        />
        {data.datasets.map((ds, i) => (
          <Bar
            key={ds.label}
            dataKey={ds.label}
            fill={dsColor(ds, i, data.datasets.length)}
            radius={[0, 3, 3, 0]}
            opacity={undefined}
            maxBarSize={24}
            isAnimationActive={false}
            cursor={onDataClick ? "pointer" : undefined}
            onClick={onDataClick
              ? (entry, _index, event) =>
                onDataClick(
                  String(entry.payload?.name ?? ""),
                  ds.label || undefined,
                  "context",
                  event.detail,
                  event,
                )
              : undefined}
            onDoubleClick={onDataClick
              ? (entry, _index, event) =>
                onDataClick(
                  String(entry.payload?.name ?? ""),
                  ds.label || undefined,
                  "drilldown",
                  event.detail,
                  event,
                )
              : undefined}
            shape={selectedBarShape(
              rows,
              ds.label || undefined,
              () => 0.85,
              isSelected,
            )}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function LineChartView(
  { data, onDataClick, isSelected, canDrillDown }: {
    data: ChartData;
    onDataClick?: ChartDataClick;
    isSelected?: ChartSelectionPredicate;
    canDrillDown?: ChartSelectionPredicate;
  },
) {
  const rows = toRows(data);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={rows}
        margin={MARGIN}
        onClick={onDataClick
          ? (state, event) =>
            activateCategoricalPoint(
              data,
              onDataClick,
              state as unknown as Record<string, unknown>,
              event.target,
              "context",
              event.detail,
              event,
            )
          : undefined}
        onDoubleClick={onDataClick
          ? (state, event) =>
            activateCategoricalPoint(
              data,
              onDataClick,
              state as unknown as Record<string, unknown>,
              event.target,
              "drilldown",
              event.detail,
              event,
            )
          : undefined}
      >
        <CartesianGrid {...GRID} vertical={false} />
        <SharedXAxis data={data} />
        <SharedYAxis />
        {data.showRightAxis && (
          <SharedYAxis yAxisId="right" orientation="right" />
        )}
        <Tooltip
          content={
            <ChartTooltip
              data={data}
              contextEnabled={isSelected !== undefined}
              canDrillDown={canDrillDown}
            />
          }
          cursor={<BandCursor count={rows.length} />}
          isAnimationActive={false}
        />
        {data.datasets.map((ds, i) => {
          const marker = onDataClick && ds.label
            ? { "data-chart-series": ds.label }
            : {};
          return (
            <Line
              key={ds.label}
              type="linear"
              strokeLinecap="round"
              strokeLinejoin="round"
              dataKey={ds.label}
              stroke={dsColor(ds, i, data.datasets.length)}
              strokeWidth={2}
              strokeDasharray={ds.strokeStyle === "dashed" ? "6 3" : undefined}
              dot={selectedPointShape(
                rows,
                ds.label || undefined,
                dsColor(ds, i, data.datasets.length),
                ds.showDots !== false && ds.strokeStyle !== "dashed",
                isSelected,
              )}
              activeDot={onDataClick
                ? { ...ACTIVE_DOT_BASE, cursor: "pointer", ...marker }
                : ACTIVE_DOT_BASE}
              yAxisId={ds.yAxisId}
              isAnimationActive={false}
              {...marker}
            />
          );
        })}
      </LineChart>
    </ResponsiveContainer>
  );
}

function AreaChartView(
  { data, onDataClick, isSelected, canDrillDown }: {
    data: ChartData;
    onDataClick?: ChartDataClick;
    isSelected?: ChartSelectionPredicate;
    canDrillDown?: ChartSelectionPredicate;
  },
) {
  const rows = toRows(data);
  const stacked = data.type === "stacked-area";

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart
        data={rows}
        margin={MARGIN}
        onClick={onDataClick
          ? (state, event) =>
            activateCategoricalPoint(
              data,
              onDataClick,
              state as unknown as Record<string, unknown>,
              event.target,
              "context",
              event.detail,
              event,
            )
          : undefined}
        onDoubleClick={onDataClick
          ? (state, event) =>
            activateCategoricalPoint(
              data,
              onDataClick,
              state as unknown as Record<string, unknown>,
              event.target,
              "drilldown",
              event.detail,
              event,
            )
          : undefined}
      >
        <defs>
          {data.datasets.map((ds, i) => (
            <linearGradient
              key={ds.label}
              id={`grad-${i}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop
                offset="5%"
                stopColor={dsColor(ds, i, data.datasets.length)}
                stopOpacity={0.3}
              />
              <stop
                offset="95%"
                stopColor={dsColor(ds, i, data.datasets.length)}
                stopOpacity={0.02}
              />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid {...GRID} vertical={false} />
        <SharedXAxis data={data} />
        <SharedYAxis />
        <Tooltip
          content={
            <ChartTooltip
              data={data}
              contextEnabled={isSelected !== undefined}
              canDrillDown={canDrillDown}
            />
          }
          cursor={<BandCursor count={rows.length} />}
          isAnimationActive={false}
        />
        {data.datasets.map((ds, i) => {
          const color = dsColor(ds, i, data.datasets.length);
          const marker = onDataClick && ds.label
            ? { "data-chart-series": ds.label }
            : {};
          return (
            <Area
              key={ds.label}
              type="linear"
              strokeLinecap="round"
              strokeLinejoin="round"
              dataKey={ds.label}
              stroke={color}
              strokeWidth={2}
              /* stacked-area : opacité plate (pas de dégradé) ; area simple : dégradé 30% → 2% */
              fill={stacked ? color : `url(#grad-${i})`}
              fillOpacity={stacked
                ? STACKED_AREA_OPACITY[
                  Math.min(i, STACKED_AREA_OPACITY.length - 1)
                ]
                : undefined}
              dot={selectedPointShape(
                rows,
                ds.label || undefined,
                color,
                ds.showDots === true,
                isSelected,
              )}
              activeDot={onDataClick
                ? { ...ACTIVE_DOT_BASE, cursor: "pointer", ...marker }
                : ACTIVE_DOT_BASE}
              stackId={stacked ? (ds.stack ?? "default") : undefined}
              isAnimationActive={false}
              {...marker}
            />
          );
        })}
      </AreaChart>
    </ResponsiveContainer>
  );
}

function ComposedChartView(
  { data, onDataClick, isSelected, canDrillDown }: {
    data: ChartData;
    onDataClick?: ChartDataClick;
    isSelected?: ChartSelectionPredicate;
    canDrillDown?: ChartSelectionPredicate;
  },
) {
  const rows = toRows(data);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        data={rows}
        margin={MARGIN}
        onClick={onDataClick
          ? (state, event) =>
            activateCategoricalPoint(
              data,
              onDataClick,
              state as unknown as Record<string, unknown>,
              event.target,
              "context",
              event.detail,
              event,
            )
          : undefined}
        onDoubleClick={onDataClick
          ? (state, event) =>
            activateCategoricalPoint(
              data,
              onDataClick,
              state as unknown as Record<string, unknown>,
              event.target,
              "drilldown",
              event.detail,
              event,
            )
          : undefined}
      >
        <CartesianGrid {...GRID} vertical={false} />
        <SharedXAxis data={data} />
        <SharedYAxis />
        {data.showRightAxis && (
          <SharedYAxis yAxisId="right" orientation="right" />
        )}
        <Tooltip
          content={
            <ChartTooltip
              data={data}
              contextEnabled={isSelected !== undefined}
              canDrillDown={canDrillDown}
            />
          }
          cursor={<BandCursor count={rows.length} />}
          isAnimationActive={false}
        />
        {data.datasets.map((ds, i) => {
          const color = dsColor(ds, i, data.datasets.length);
          const dsType = ds.type ?? "bar";
          const marker = onDataClick && ds.label
            ? { "data-chart-series": ds.label }
            : {};
          if (dsType === "line") {
            return (
              <Line
                key={ds.label}
                type="linear"
                strokeLinecap="round"
                strokeLinejoin="round"
                dataKey={ds.label}
                stroke={color}
                strokeWidth={2}
                strokeDasharray={ds.strokeStyle === "dashed"
                  ? "6 3"
                  : undefined}
                dot={selectedPointShape(
                  rows,
                  ds.label || undefined,
                  color,
                  ds.showDots !== false && ds.strokeStyle !== "dashed",
                  isSelected,
                )}
                activeDot={onDataClick
                  ? { ...ACTIVE_DOT_BASE, cursor: "pointer", ...marker }
                  : ACTIVE_DOT_BASE}
                yAxisId={ds.yAxisId}
                isAnimationActive={false}
                {...marker}
              />
            );
          }
          if (dsType === "area") {
            return (
              <Area
                key={ds.label}
                type="linear"
                strokeLinecap="round"
                strokeLinejoin="round"
                dataKey={ds.label}
                stroke={color}
                fill={color}
                fillOpacity={0.15}
                dot={selectedPointShape(
                  rows,
                  ds.label || undefined,
                  color,
                  ds.showDots === true,
                  isSelected,
                )}
                yAxisId={ds.yAxisId}
                isAnimationActive={false}
                activeDot={onDataClick
                  ? { ...ACTIVE_DOT_BASE, cursor: "pointer", ...marker }
                  : ACTIVE_DOT_BASE}
                {...marker}
              />
            );
          }
          return (
            <Bar
              key={ds.label}
              dataKey={ds.label}
              fill={color}
              radius={[3, 3, 0, 0]}
              opacity={0.7}
              maxBarSize={40}
              stackId={ds.stack}
              yAxisId={ds.yAxisId}
              isAnimationActive={false}
              cursor={onDataClick ? "pointer" : undefined}
              onClick={onDataClick
                ? (entry, _index, event) => {
                  // Le graphique composé écoute aussi sa colonne entière. Un
                  // segment exact ne doit donc pas déclencher deux sélections.
                  event.stopPropagation();
                  onDataClick(
                    String(entry.payload?.name ?? ""),
                    ds.label || undefined,
                    "context",
                    event.detail,
                    event,
                  );
                }
                : undefined}
              onDoubleClick={onDataClick
                ? (entry, _index, event) => {
                  event.stopPropagation();
                  onDataClick(
                    String(entry.payload?.name ?? ""),
                    ds.label || undefined,
                    "drilldown",
                    event.detail,
                    event,
                  );
                }
                : undefined}
              shape={selectedBarShape(
                rows,
                ds.label || undefined,
                () => 0.7,
                isSelected,
              )}
            />
          );
        })}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function PieDonutChart(
  { data, isDonut, onDataClick, isSelected, canDrillDown }: {
    data: ChartData;
    isDonut: boolean;
    onDataClick?: ChartDataClick;
    isSelected?: ChartSelectionPredicate;
    canDrillDown?: ChartSelectionPredicate;
  },
) {
  const t = useT();
  const ds = data.datasets[0];
  if (!ds || ds.values.length === 0 || data.labels.length === 0) {
    return <StateMessage>{t("chart.pie.no_data")}</StateMessage>;
  }

  const total = ds.values.reduce((s, v) => s + v, 0);
  if (total === 0) {
    return <StateMessage>{t("chart.pie.all_zero")}</StateMessage>;
  }

  const pieData = data.labels.map((label, i) => ({
    name: label,
    value: ds.values[i] ?? 0,
  }));

  return (
    /* Layout maquette : disque 112×112 à gauche + colonne légende à droite */
    <div class="flex flex-row items-center gap-4 h-full px-4">
      {/* Disque 112×112 — min-width pour ne pas se rétrécir */}
      <div class="relative size-[112px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              /* Les % Recharts sont relatifs au rayon max (56 px), pas à la
                 largeur : 100 % = plein disque, 54 % = trou de 60 px, soit
                 l'anneau de 26 px de la maquette. */
              innerRadius={isDonut ? "54%" : 0}
              outerRadius="100%"
              /* Disque plein, comme le conic-gradient de la maquette : ni
                 fente ni liseré entre les parts. */
              stroke="none"
              paddingAngle={0}
              dataKey="value"
              isAnimationActive={false}
              cursor={onDataClick ? "pointer" : undefined}
              onClick={onDataClick
                ? (entry, _index, event) =>
                  onDataClick(
                    String(entry.name ?? ""),
                    ds.label || undefined,
                    "context",
                    event.detail,
                    event,
                  )
                : undefined}
              onDoubleClick={onDataClick
                ? (entry, _index, event) =>
                  onDataClick(
                    String(entry.name ?? ""),
                    ds.label || undefined,
                    "drilldown",
                    event.detail,
                    event,
                  )
                : undefined}
            >
              {pieData.map((item, i) => {
                const selected = isSelected?.(
                  item.name,
                  ds.label || undefined,
                ) === true;
                return (
                  <Cell
                    key={i}
                    fill={CATEGORICAL[Math.min(i, CATEGORICAL.length - 1)]}
                    stroke={selected ? "var(--color-accent)" : "none"}
                    strokeWidth={selected ? 4 : 0}
                    style={selected
                      ? {
                        filter: "drop-shadow(0 0 2.5px var(--color-accent))",
                      }
                      : undefined}
                  />
                );
              })}
            </Pie>
            <Tooltip
              content={
                <ChartTooltip
                  data={data}
                  contextEnabled={isSelected !== undefined}
                  canDrillDown={canDrillDown}
                />
              }
              isAnimationActive={false}
            />
          </PieChart>
        </ResponsiveContainer>
        {
          /* Le centre en HTML, posé par-dessus : le SVG ne sait pas composer
            deux lignes de texte proprement dans un anneau de 112 px. */
        }
        {isDonut && (
          <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span class="font-mono text-nano text-ink-muted">
              {t("chart.donut.total_label")}
            </span>
            {
              /* Chiffre seul, comme la maquette : la devise est dans l'infobulle
                et « 107 400 € » déborderait d'un trou de 60 px. */
            }
            <span class="font-mono text-[12px] font-semibold text-ink">
              {formatNumber(total, 0)}
            </span>
          </div>
        )}
      </div>

      {
        /* Légende latérale — le nom seul, comme la maquette ; la valeur est
          dans l'infobulle. Mêmes classes que ChartLegend, en colonne. */
      }
      <div class="flex min-w-0 flex-col gap-[7px]">
        {pieData.map((entry, i) => (
          <span
            key={i}
            class="inline-flex items-center gap-1.5 font-mono text-chip text-ink-2"
          >
            <span
              class="size-[7px] shrink-0 rounded-[2px]"
              style={{
                background: CATEGORICAL[Math.min(i, CATEGORICAL.length - 1)],
              }}
            />
            {entry.name}
            {/* Pie : la part ; donut : la valeur — en estompé, comme la maquette. */}
            <span class="text-ink-faint">
              {isDonut
                ? formatNumber(entry.value, 0)
                : `${Math.round((entry.value / total) * 100)} %`}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function RadarChartView(
  { data, onDataClick, isSelected, canDrillDown }: {
    data: ChartData;
    onDataClick?: ChartDataClick;
    isSelected?: ChartSelectionPredicate;
    canDrillDown?: ChartSelectionPredicate;
  },
) {
  const rows = toRows(data);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <RadarChart
        data={rows}
        cx="50%"
        cy="50%"
        outerRadius="70%"
        onClick={onDataClick
          ? (state, event) =>
            activateCategoricalPoint(
              data,
              onDataClick,
              state as unknown as Record<string, unknown>,
              event.target,
              "context",
              event.detail,
              event,
            )
          : undefined}
        onDoubleClick={onDataClick
          ? (state, event) =>
            activateCategoricalPoint(
              data,
              onDataClick,
              state as unknown as Record<string, unknown>,
              event.target,
              "drilldown",
              event.detail,
              event,
            )
          : undefined}
      >
        <PolarGrid stroke="var(--color-line-soft)" gridType="polygon" />
        <PolarAngleAxis
          dataKey="name"
          axisLine={false}
          tickLine={false}
          tick={{
            fontSize: 9,
            fill: "var(--color-ink-faint)",
            fontFamily: fonts.mono,
          }}
        />
        {
          /*
          Pas d'axe radial : la maquette n'affiche aucun « 25 50 75 100 » au
          centre. L'échelle se lit aux anneaux, et les valeurs à l'infobulle.
          L'axe reste présent mais muet, sans quoi Recharts perd son domaine.
        */
        }
        <PolarRadiusAxis tick={false} axisLine={false} tickCount={4} />
        <Tooltip
          content={
            <ChartTooltip
              data={data}
              contextEnabled={isSelected !== undefined}
              canDrillDown={canDrillDown}
            />
          }
          isAnimationActive={false}
        />
        {data.datasets.map((ds, i) => {
          const color = dsColor(ds, i, data.datasets.length);
          const marker = onDataClick && ds.label
            ? { "data-chart-series": ds.label }
            : {};
          return (
            <Radar
              key={ds.label}
              dataKey={ds.label}
              stroke={color}
              fill={color}
              fillOpacity={0.2}
              strokeWidth={2}
              dot={selectedPointShape(
                rows,
                ds.label || undefined,
                color,
                true,
                isSelected,
              )}
              style={onDataClick ? { cursor: "pointer" } : undefined}
              isAnimationActive={false}
              {...marker}
            />
          );
        })}
      </RadarChart>
    </ResponsiveContainer>
  );
}

interface ScatterShapeProps {
  cx?: number;
  cy?: number;
  payload?: { label?: unknown };
}

function scatterPointShape(
  series: string,
  color: string,
  interactive: boolean,
  isSelected?: ChartSelectionPredicate,
) {
  return (props: ScatterShapeProps) => {
    if (props.cx === undefined || props.cy === undefined) return <g />;
    const label = chartScatterPointLabel(props.payload);
    const selected = label !== undefined &&
      isSelected?.(label, series) === true;
    const cx = props.cx ?? 0;
    const cy = props.cy ?? 0;
    return (
      <g data-chart-series={series}>
        {selected && (
          <circle
            cx={cx}
            cy={cy}
            r={7.5}
            fill="var(--color-surface)"
            stroke="var(--color-accent)"
            strokeWidth={3}
          />
        )}
        <circle
          cx={cx}
          cy={cy}
          r={4}
          fill={color}
          opacity={0.75}
          style={{ cursor: interactive && label ? "pointer" : "default" }}
        />
      </g>
    );
  };
}

function ScatterChartView(
  { data, onDataClick, isSelected, canDrillDown }: {
    data: ChartData;
    onDataClick?: ChartDataClick;
    isSelected?: ChartSelectionPredicate;
    canDrillDown?: ChartSelectionPredicate;
  },
) {
  const t = useT();
  const series = data.scatterData ?? [];
  if (!series.length) {
    return <StateMessage>{t("chart.scatter.no_data")}</StateMessage>;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={MARGIN}>
        <CartesianGrid {...GRID} vertical={false} />
        {
          /* Axes muets, comme partout : une ligne de base, trois pointillés ;
            les libellés d'axes sont en légende au-dessus et sous le tracé. */
        }
        <XAxis
          type="number"
          dataKey="x"
          name="x"
          tick={false}
          axisLine={{ stroke: "var(--color-line)" }}
          tickLine={false}
          height={4}
        />
        <YAxis
          type="number"
          dataKey="y"
          name="y"
          tick={false}
          axisLine={false}
          tickLine={false}
          width={0}
          tickCount={4}
        />
        {/* Aire 50 → rayon 4, le point de la maquette. */}
        <ZAxis range={[50, 50]} />
        <Tooltip
          content={
            <ChartTooltip
              data={data}
              contextEnabled={isSelected !== undefined}
              canDrillDown={canDrillDown}
            />
          }
          cursor={false}
          isAnimationActive={false}
        />
        {series.map((s, i) => {
          const color = s.color ??
            CATEGORICAL[Math.min(i, CATEGORICAL.length - 1)];
          const interactive = Boolean(
            onDataClick && s.points.some((point) =>
              point.label?.trim() && Number.isFinite(point.x) &&
              Number.isFinite(point.y)
            ),
          );
          return (
            <Scatter
              key={s.label}
              name={s.label}
              data={s.points}
              fill={color}
              opacity={1}
              shape={scatterPointShape(
                s.label,
                color,
                interactive,
                isSelected,
              )}
              onClick={interactive
                ? (entry, _index, event) => {
                  const label = chartScatterPointLabel(entry);
                  if (!label) return;
                  onDataClick?.(
                    label,
                    s.label || undefined,
                    "context",
                    event.detail,
                    event,
                  );
                }
                : undefined}
              onDoubleClick={interactive
                ? (entry, _index, event) => {
                  const label = chartScatterPointLabel(entry);
                  if (!label) {
                    return;
                  }
                  onDataClick?.(
                    label,
                    s.label || undefined,
                    "drilldown",
                    event.detail,
                    event,
                  );
                }
                : undefined}
              isAnimationActive={false}
            />
          );
        })}
      </ScatterChart>
    </ResponsiveContainer>
  );
}

interface TreemapContentProps {
  x: number;
  y: number;
  width: number;
  height: number;
  name: string;
  value: number;
  index: number;
  depth?: number;
  colors: readonly string[];
  onDataClick?: ChartDataClick;
  isSelected?: ChartSelectionPredicate;
}

function TreemapContent(props: TreemapContentProps) {
  const {
    x,
    y,
    width,
    height,
    name,
    index,
    depth,
    colors: treeColors,
    onDataClick,
    isSelected,
  } = props;
  // Recharts passe aussi le nœud racine (profondeur 0) : une tuile de la
  // taille du tracé, le total dessus. On ne dessine que les feuilles.
  if (depth === 0) return null;
  const selected = isSelected?.(name) === true;
  return (
    <g
      style={{ cursor: onDataClick ? "pointer" : "default" }}
      onClick={onDataClick
        ? (event) => {
          event.stopPropagation();
          onDataClick(name, undefined, "context", event.detail, event);
        }
        : undefined}
      onDblClick={onDataClick
        ? (event) => {
          event.stopPropagation();
          onDataClick(name, undefined, "drilldown", event.detail, event);
        }
        : undefined}
    >
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={treeColors[Math.min(index, treeColors.length - 1)]}
        opacity={0.8}
        rx={3}
        stroke={selected ? "var(--color-accent)" : "var(--color-surface)"}
        strokeWidth={selected ? 5 : 2}
        style={selected
          ? { filter: "drop-shadow(0 0 2.5px var(--color-accent))" }
          : undefined}
      />
      {/* La tuile est toujours peinte ; le libellé attend 50 px. */}
      {width >= 50 && height >= 24 && (
        <text
          x={x + width / 2}
          y={y + height / 2 - 6}
          textAnchor="middle"
          fontSize={10.5}
          fill="#fff"
          fontFamily={fonts.mono}
        >
          {name.length > Math.floor(width / 8)
            ? name.slice(0, Math.floor(width / 8) - 1) + "…"
            : name}
        </text>
      )}
      {width >= 50 && height >= 38 && (
        <text
          x={x + width / 2}
          y={y + height / 2 + 10}
          textAnchor="middle"
          fontSize={10}
          fill="color-mix(in srgb, #fff 70%, transparent)"
          fontFamily={fonts.mono}
        >
          {formatNumber(props.value, props.value < 10 ? 1 : 0)}
        </text>
      )}
    </g>
  );
}

function flattenTree(
  nodes: TreeNode[],
): Array<{ name: string; value: number }> {
  const result: Array<{ name: string; value: number }> = [];
  for (const n of nodes) {
    if (n.children?.length) {
      result.push(...flattenTree(n.children));
    } else if (n.value != null) {
      result.push({ name: n.name, value: n.value });
    }
  }
  return result;
}

function TreemapView(
  { data, onDataClick, isSelected }: {
    data: ChartData;
    onDataClick?: ChartDataClick;
    isSelected?: ChartSelectionPredicate;
  },
) {
  const t = useT();
  let treeNodes: Array<{ name: string; value: number }>;
  if (data.treeData) {
    treeNodes = flattenTree(data.treeData);
  } else {
    const ds = data.datasets[0];
    if (!ds) {
      return <StateMessage>{t("chart.treemap.no_data")}</StateMessage>;
    }
    treeNodes = data.labels.map((label, i) => ({
      name: label,
      value: ds.values[i] ?? 0,
    }));
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <Treemap
        data={treeNodes}
        isAnimationActive={false}
        dataKey="value"
        nameKey="name"
        content={
          <TreemapContent
            x={0}
            y={0}
            width={0}
            height={0}
            name=""
            value={0}
            index={0}
            colors={CATEGORICAL}
            onDataClick={onDataClick}
            isSelected={isSelected}
          />
        }
      />
    </ResponsiveContainer>
  );
}

const KEYBOARD_CURSOR_MOVES: Partial<Record<string, ChartCursorMove>> = {
  ArrowLeft: "previous-label",
  ArrowRight: "next-label",
  ArrowUp: "previous-series",
  ArrowDown: "next-series",
};

/**
 * Un seul arrêt de tabulation pour tout le graphe. Le contrôle reste un pixel
 * transparent tant qu'il n'a pas le focus clavier ; au focus, il devient une
 * petite puce qui annonce le point courant. Les interactions souris continuent
 * donc de traverser vers Recharts et l'UI ne gagne aucun bouton permanent.
 */
function ChartKeyboardNavigator(
  {
    data,
    onActivate,
    onKeyActivate,
    contextEnabled,
    canDrillDown,
    isSelected,
    isExpanded,
    onActiveChange,
  }: {
    data: ChartData;
    onActivate?: ChartDataClick;
    onKeyActivate?: (
      label: string,
      series: string | undefined,
      event: JSX.TargetedKeyboardEvent<HTMLButtonElement>,
    ) => void;
    contextEnabled: boolean;
    canDrillDown?: ChartSelectionPredicate;
    isSelected?: (label: string, series?: string) => boolean;
    isExpanded?: (label: string, series?: string) => boolean | undefined;
    onActiveChange?: (label: string, series?: string) => void;
  },
) {
  const t = useT();
  const [cursor, setCursor] = useState<ChartCursor>({
    labelIndex: 0,
    seriesIndex: 0,
  });

  useEffect(() => {
    setCursor((current) => {
      const counts = chartCursorCounts(data, current);
      return {
        labelIndex: Math.min(
          current.labelIndex,
          Math.max(0, counts.labelCount - 1),
        ),
        seriesIndex: Math.min(
          current.seriesIndex,
          Math.max(0, counts.seriesCount - 1),
        ),
      };
    });
  }, [data]);

  const selection = chartSelectionAt(data, cursor);
  if (!onActivate || !onKeyActivate || !selection) return null;

  const value = selection.x !== undefined && selection.y !== undefined
    ? `${data.xAxisLabel ?? "x"}: ${formatNumber(selection.x, 2)} · ${
      data.yAxisLabel ?? "y"
    }: ${formatNumber(selection.y, 2)}`
    : selection.value === undefined
    ? "—"
    : fmtValue(
      selection.value,
      data,
      data.datasets.find((dataset) => dataset.label === selection.series),
    );
  const target = selection.series
    ? t("chart.keyboard.target", {
      label: selection.label,
      series: selection.series,
      value,
    })
    : t("chart.keyboard.target_single", { label: selection.label, value });
  const drilldownEnabled = canDrillDown?.(
    selection.label,
    selection.series,
  ) === true;
  const expandedState = drilldownEnabled
    ? isExpanded?.(selection.label, selection.series)
    : undefined;
  const help = t(
    contextEnabled && drilldownEnabled
      ? "chart.keyboard.help"
      : contextEnabled
      ? "chart.keyboard.help_context"
      : drilldownEnabled
      ? "chart.keyboard.help_detail"
      : "chart.keyboard.help_navigation",
  );
  const shortcuts = [
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
    ...(drilldownEnabled ? ["Enter"] : []),
    ...(contextEnabled ? ["Space"] : []),
  ].join(" ");

  return (
    <button
      type="button"
      aria-pressed={contextEnabled
        ? isSelected?.(selection.label, selection.series) ?? false
        : undefined}
      aria-expanded={expandedState}
      aria-controls={expandedState === undefined
        ? undefined
        : CHART_DETAIL_PANEL_ID}
      aria-label={t("chart.keyboard.control", { target, help })}
      aria-keyshortcuts={shortcuts}
      aria-live="polite"
      aria-atomic="true"
      title={help}
      onFocus={() => onActiveChange?.(selection.label, selection.series)}
      onKeyDown={(event) => {
        if (event.key === " ") {
          if (contextEnabled) {
            onKeyActivate(selection.label, selection.series, event);
          } else event.preventDefault();
          return;
        }
        if (event.key === "Enter") {
          if (drilldownEnabled) {
            onKeyActivate(selection.label, selection.series, event);
          } else event.preventDefault();
          return;
        }
        const move = KEYBOARD_CURSOR_MOVES[event.key];
        if (!move) return;
        event.preventDefault();
        const counts = chartCursorCounts(data, cursor);
        const next = moveChartCursor(
          cursor,
          move,
          counts.labelCount,
          counts.seriesCount,
        );
        const nextSelection = chartSelectionAt(data, next);
        if (nextSelection) {
          onActiveChange?.(nextSelection.label, nextSelection.series);
        }
        setCursor(next);
      }}
      onClick={contextEnabled
        ? (event) => {
          // Enter et Espace emettent aussi un click natif detail=0 sur un
          // bouton : leur commande a deja ete traitee dans onKeyDown.
          if (event.detail === 0) return;
          onActivate(
            selection.label,
            selection.series,
            "context",
            event.detail,
            event,
          );
        }
        : undefined}
      onDblClick={drilldownEnabled
        ? (event) =>
          onActivate(
            selection.label,
            selection.series,
            "drilldown",
            event.detail,
            event,
          )
        : undefined}
      class={cx(
        "pointer-events-none absolute bottom-1.5 left-1.5 z-20 h-px w-px overflow-hidden whitespace-nowrap border-0 p-0 opacity-0",
        "focus:pointer-events-auto focus:flex focus:h-auto focus:w-auto focus:max-w-[calc(100%-0.75rem)] focus:items-center focus:gap-2 focus:overflow-visible focus:rounded-[4px] focus:border focus:border-accent/50 focus:bg-control focus:px-2.5 focus:py-1.5 focus:opacity-100 focus:shadow-modal",
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
        "font-mono text-[10.5px] text-ink",
      )}
    >
      <span class="min-w-0 truncate">{target}</span>
      <span
        aria-hidden="true"
        class="shrink-0 text-[9px] tracking-[-0.08em] text-ink-faint"
      >
        ←→ ↑↓
      </span>
    </button>
  );
}

function ChartDetailAffordance(
  {
    point,
    mode,
    expanded,
    touch,
    onToggle,
  }: {
    point: ActiveChartPoint;
    mode: "inline" | "message";
    expanded: boolean;
    touch: boolean;
    onToggle: () => void;
  },
) {
  const label = point.series ? `${point.label} · ${point.series}` : point.label;
  const position: JSX.CSSProperties = point.anchor
    ? { left: point.anchor.left, top: point.anchor.top }
    : { right: 6, top: 6 };
  const hintSide = point.anchor?.hintSide ?? "left";
  const hintBounds = point.anchor
    ? {
      "--detail-hint-max-width": `${point.anchor.hintMaxWidth}px`,
    } as JSX.CSSProperties
    : undefined;
  const surfaceClass = "border border-line bg-surface shadow-tooltip";

  return (
    <div class="absolute z-30" style={{ ...position, ...hintBounds }}>
      <DetailToggleButton
        expanded={mode === "inline" ? expanded : undefined}
        label={label}
        controls={mode === "inline" ? CHART_DETAIL_PANEL_ID : undefined}
        touch={touch}
        hintSide={hintSide}
        onToggle={onToggle}
        class={surfaceClass}
      />
    </div>
  );
}

function ChartRouter(
  { data, onDataClick, isSelected, canDrillDown }: {
    data: ChartData;
    onDataClick?: ChartDataClick;
    isSelected?: ChartSelectionPredicate;
    canDrillDown?: ChartSelectionPredicate;
  },
) {
  const type = data.type ?? "bar";

  switch (type) {
    case "bar":
      return (
        <VerticalBarChart
          data={data}
          onDataClick={onDataClick}
          isSelected={isSelected}
          canDrillDown={canDrillDown}
        />
      );
    case "stacked-bar":
      return (
        <VerticalBarChart
          data={data}
          onDataClick={onDataClick}
          isSelected={isSelected}
          canDrillDown={canDrillDown}
        />
      );
    case "horizontal-bar":
      return (
        <HorizontalBarChart
          data={data}
          onDataClick={onDataClick}
          isSelected={isSelected}
          canDrillDown={canDrillDown}
        />
      );
    case "line":
      return (
        <LineChartView
          data={data}
          onDataClick={onDataClick}
          isSelected={isSelected}
          canDrillDown={canDrillDown}
        />
      );
    case "area":
      return (
        <AreaChartView
          data={data}
          onDataClick={onDataClick}
          isSelected={isSelected}
          canDrillDown={canDrillDown}
        />
      );
    case "stacked-area":
      return (
        <AreaChartView
          data={data}
          onDataClick={onDataClick}
          isSelected={isSelected}
          canDrillDown={canDrillDown}
        />
      );
    case "composed":
      return (
        <ComposedChartView
          data={data}
          onDataClick={onDataClick}
          isSelected={isSelected}
          canDrillDown={canDrillDown}
        />
      );
    case "pie":
      return (
        <PieDonutChart
          data={data}
          isDonut={false}
          onDataClick={onDataClick}
          isSelected={isSelected}
          canDrillDown={canDrillDown}
        />
      );
    case "donut":
      return (
        <PieDonutChart
          data={data}
          isDonut
          onDataClick={onDataClick}
          isSelected={isSelected}
          canDrillDown={canDrillDown}
        />
      );
    case "radar":
      return (
        <RadarChartView
          data={data}
          onDataClick={onDataClick}
          isSelected={isSelected}
          canDrillDown={canDrillDown}
        />
      );
    case "scatter":
      return (
        <ScatterChartView
          data={data}
          onDataClick={onDataClick}
          isSelected={isSelected}
          canDrillDown={canDrillDown}
        />
      );
    case "treemap":
      return (
        <TreemapView
          data={data}
          onDataClick={onDataClick}
          isSelected={isSelected}
        />
      );
    default:
      return (
        <VerticalBarChart
          data={data}
          onDataClick={onDataClick}
          isSelected={isSelected}
          canDrillDown={canDrillDown}
        />
      );
  }
}

/**
 * Chrome Direction B v2 : gradient 2px, header avec subtitle inline, LiveDot,
 * zone chart, footer. Pas de bouton Refresh visible — le rafraîchissement reste
 * automatique (interval + focus + visibilitychange).
 */
function ChartContent(
  {
    data,
    error,
    layout,
    containerRef,
    boundsStyle,
    refreshing,
    rootRefreshRequest,
    rootFreshEvent,
    rootMutationEvent,
    canRefreshRoot,
    onRefreshRoot,
    onMutationInvalidate,
    onMutationRefresh,
  }: {
    data: ChartData;
    error: string | null;
    layout: ViewerLayout;
    containerRef: Ref<HTMLDivElement>;
    boundsStyle?: JSX.CSSProperties;
    refreshing: boolean;
    rootRefreshRequest: UiRefreshRequestData | null;
    rootFreshEvent: number;
    rootMutationEvent: number;
    canRefreshRoot: boolean;
    onRefreshRoot: () => void;
    onMutationInvalidate: () => void;
    onMutationRefresh: () => void;
  },
) {
  const [shared, setShared] = useState<DrillDownChannel | null>(null);
  const [activePoint, setActivePoint] = useState<ActiveChartPoint | null>(null);
  const chartSurfaceRef = useRef<HTMLDivElement>(null);
  const clickIntent = useClickIntent();
  function flashShared(channel: DrillDownChannel) {
    if (channel === "none") return;
    setShared(channel);
    setTimeout(() => setShared(null), 1500);
  }
  const narrow = layout !== "wide";
  const t = useT();
  const fixture = isFixtureMode();
  const rootKey = viewerRootKey("chart", rootRefreshRequest ?? undefined, {
    title: data.title,
  });
  const activeContext = useActiveContext(app, rootKey);
  const hostCapabilities = fixture ? undefined : app.getHostCapabilities();
  const documentContext: DocumentContextController = {
    supported: !fixture && activeContext.supported,
    activate: activeContext.activate,
    activateReversible: activeContext.activateReversible,
    reconcileView: activeContext.reconcileView,
    reconcileDocument: activeContext.reconcileDocument,
    isSelected: activeContext.isSelected,
    canShareResource: (resource) =>
      canShareActiveContextResource(hostCapabilities, resource),
  };
  const viewerNav = useViewerNav(app, {
    title: data.title,
    kind: "root",
    origin: "chart",
    key: rootKey,
  }, { fixture });
  const nav = viewerNav.nav;
  const { current, isRoot } = nav;
  const root = nav.stack.levels[0];
  const { jumpsEnabled } = viewerNav;
  const { messagesEnabled } = viewerNav;
  const { list } = viewerNav;
  const [levelError, setLevelError] = useState<string | null>(null);
  const { ask } = viewerNav;
  useLayoutEffect(() => () => clickIntent.cancelAll(), [clickIntent, rootKey]);
  useEffect(() => setActivePoint(null), [rootKey]);
  useLayoutEffect(() => {
    if (rootFreshEvent > rootMutationEvent && root?.stale) {
      nav.clearStale(root.id);
    }
  }, [rootFreshEvent, rootMutationEvent]);
  // Un point, une barre, une part : le segment exact prime sur le saut plus
  // général de sa catégorie. Sans saut typé, la sélection reste du contexte.
  const pointJump = jumpsEnabled &&
      (data._pointJumps || data._seriesPointJumps)
    ? (label: string, series?: string): Jump | null => {
      const hint = chartJumpHint(data, label, series);
      const target = series ? `${label} · ${series}` : label;
      return hint
        ? jumpFromHint(hint, {}, t("nav.linked_to", { id: target }))
        : null;
    }
    : undefined;
  const navigationSelections = chartNavigationGroups(data).flat();

  function pointContext(
    label: string,
    series?: string,
  ): ContextSelectionItem {
    const values = navigationSelections.filter((selection) =>
      selection.label === label &&
      (series === undefined || selection.series === series)
    ).map((selection) => {
      const formatted = selection.x !== undefined && selection.y !== undefined
        ? `${data.xAxisLabel ?? "x"}: ${formatNumber(selection.x, 2)} · ${
          data.yAxisLabel ?? "y"
        }: ${formatNumber(selection.y, 2)}`
        : selection.value === undefined
        ? null
        : fmtValue(
          selection.value,
          data,
          data.datasets.find((dataset) => dataset.label === selection.series),
        );
      if (!formatted) return null;
      return series || !selection.series
        ? formatted
        : `${selection.series}: ${formatted}`;
    }).filter((value): value is string => value !== null);
    const contextLabel = series ? `${label} · ${series}` : label;
    return {
      id: `chart:${encodeURIComponent(data.title)}:${
        encodeURIComponent(label)
      }:${encodeURIComponent(series ?? "all")}`,
      view: data.title,
      label: contextLabel,
      value: values.length > 0 ? values.join(" · ") : undefined,
    };
  }

  useEffect(() => {
    const candidates = new Map<string, ContextSelectionItem>();
    for (const selection of chartNavigationGroups(data).flat()) {
      const generic = pointContext(selection.label);
      candidates.set(generic.id, generic);
      if (selection.series) {
        const exact = pointContext(selection.label, selection.series);
        candidates.set(exact.id, exact);
      }
    }
    void activeContext.reconcileView(data.title, [...candidates.values()]);
  }, [data, activeContext.reconcileView]);

  function pointFallback(label: string, series?: string): string | undefined {
    const fallback = data._drillDown
      ?.replace(/\{label\}/g, label)
      .replace(/\{series\}/g, series ?? "");
    return fallback?.trim() || undefined;
  }

  function isPointSelected(label: string, series?: string): boolean {
    return activeContext.isSelected(pointContext(label, series)) ||
      (series !== undefined &&
        activeContext.isSelected(pointContext(label)));
  }

  function pointExpansionState(
    label: string,
    series?: string,
  ): boolean | undefined {
    const jump = pointJump?.(label, series) ?? null;
    return chartPointExpansionState(
      jump !== null,
      nav.stack.levels[1]?.rootTriggerKey === pointContext(label, series).id,
    );
  }

  const fallbackMessageEnabled = messagesEnabled &&
    data._drillDown !== undefined;
  function pointDetailMode(
    label: string,
    series?: string,
  ): "inline" | "message" | null {
    if (pointJump?.(label, series)) return "inline";
    return fallbackMessageEnabled && pointFallback(label, series)
      ? "message"
      : null;
  }
  function canDrillDownPoint(label: string, series?: string): boolean {
    return pointDetailMode(label, series) !== null;
  }
  const interactionEnabled = Boolean(
    pointJump || activeContext.supported || fallbackMessageEnabled,
  );

  function activatePoint(
    label: string,
    series: string | undefined,
    activation: ChartPointActivation,
  ) {
    const jump = pointJump?.(label, series) ?? null;
    const context = pointContext(label, series);
    const fallback = pointFallback(label, series);
    const plan = chartPointActionPlan(
      activation,
      jump !== null,
      activeContext.supported,
      messagesEnabled,
    );

    if (plan.updateContext) {
      void activeContext.activate(context);
    }
    if (plan.toggleLevel && jump) {
      void nav.toggleRootChild(jump, context.id);
    }
    if (plan.sendMessage && fallback && ask) {
      void ask(fallback).then((sent) => {
        if (sent) flashShared("message");
      });
    }
  }

  function pointIntent(label: string, series?: string) {
    const context = pointContext(label, series);
    return {
      key: context.id,
      onSingle: () =>
        activeContext.supported
          ? activeContext.activateReversible(context)
          : undefined,
      onDouble: () => activatePoint(label, series, "drilldown"),
    };
  }

  function activateVisualPoint(
    label: string,
    series?: string,
    pointer?: ChartPointerAnchor,
  ) {
    const rect = chartSurfaceRef.current?.getBoundingClientRect();
    const actionSize = layout === "mobile" ? 40 : 28;
    const anchor = pointer && rect && Number.isFinite(pointer.clientX) &&
        Number.isFinite(pointer.clientY)
      ? (() => {
        const left = Math.max(
          4,
          Math.min(
            rect.width - actionSize - 4,
            pointer.clientX - rect.left + 8,
          ),
        );
        const placement = chartDetailHintPlacement(
          rect.width,
          left,
          actionSize,
        );
        return {
          left,
          top: Math.max(
            4,
            Math.min(
              rect.height - actionSize - 4,
              pointer.clientY - rect.top + 8,
            ),
          ),
          hintSide: placement.side,
          hintMaxWidth: placement.maxWidth,
        };
      })()
      : undefined;
    setActivePoint({ label, series, anchor });
  }

  const onDataClick = interactionEnabled
    ? (
      label: string,
      series: string | undefined,
      activation: ChartPointActivation,
      clickCount = activation === "context" ? 1 : 2,
      anchor?: ChartPointerAnchor,
    ) => {
      if (!label) return;
      activateVisualPoint(label, series, anchor);
      const intent = pointIntent(label, series);
      if (activation === "context") clickIntent.click(intent, clickCount);
      else clickIntent.doubleClick(intent);
    }
    : undefined;

  const onDataKeyDown = interactionEnabled
    ? (
      label: string,
      series: string | undefined,
      event: JSX.TargetedKeyboardEvent<HTMLButtonElement>,
    ) => {
      activateVisualPoint(label, series);
      clickIntent.keyDown(pointIntent(label, series), event);
    }
    : undefined;

  const activeDetailMode = activePoint
    ? pointDetailMode(activePoint.label, activePoint.series)
    : null;
  const activeExpandedState = activePoint
    ? pointExpansionState(activePoint.label, activePoint.series)
    : undefined;

  return (
    <ViewerShell containerRef={containerRef} style={boundsStyle}>
      {/* En-tête */}
      <header
        class={cx(
          "flex shrink-0 items-center justify-between gap-4 border-b border-line",
          narrow ? "px-3 py-[11px]" : "px-4 py-[13px]",
        )}
      >
        <div
          class={cx(
            "flex min-w-0 items-center",
            narrow ? "gap-2.5" : "gap-3",
          )}
        >
          {narrow
            ? (
              <h3 class="truncate font-display font-semibold text-ink text-[--text-card-title]">
                {data.title}
              </h3>
            )
            : (
              <h2 class="truncate font-display font-semibold text-ink text-[--text-title] tracking-title">
                {data.title}
              </h2>
            )}
          {data.subtitle && (
            <span
              class={cx(
                "font-mono text-ink-faint tracking-[0.04em]",
                narrow ? "text-micro" : "text-chip",
              )}
            >
              {data.subtitle}
            </span>
          )}
        </div>
        <div class="flex min-w-0 shrink-0 items-center gap-2">
          {root?.stale && (
            <div
              role="status"
              title={t("nav.stale_title")}
              class="flex items-center gap-1.5 font-mono text-[9.5px] text-warn"
            >
              <span
                aria-hidden="true"
                class="size-[5px] rounded-full bg-warn"
              />
              {!narrow && (
                <span>{t("nav.stale_values", { at: root.stale.at })}</span>
              )}
              {canRefreshRoot && (
                <button
                  type="button"
                  disabled={refreshing}
                  onClick={onRefreshRoot}
                  aria-label={t("nav.refresh")}
                  title={t("nav.refresh")}
                  class="rounded-[3px] px-1 text-[12px] leading-none text-warn hover:bg-warn/10 disabled:opacity-50"
                >
                  {refreshing ? "…" : "↻"}
                </button>
              )}
            </div>
          )}
          <ActiveContextChip
            compact={narrow}
            selections={activeContext.selections}
            failed={activeContext.failed}
            evictedLabel={activeContext.evictedLabel}
            onRemove={(selection) => activeContext.remove(selection)}
            onClear={() => activeContext.clear()}
          />
          {/* LiveDot large = texte + point ; narrow = point seul */}
          {!narrow
            ? <LiveDot />
            : <span class="size-[5px] shrink-0 rounded-full bg-ok" />}
        </div>
      </header>

      {/* Erreur éventuelle */}
      {error && <StateMessage tone="bad">{error}</StateMessage>}
      {levelError && <StateMessage tone="bad">{levelError}</StateMessage>}

      <div class="scroll-slim min-h-0 flex-1 overflow-y-auto">
        {/* Zone de rendu du chart */}
        <div
          class={cx(
            "flex shrink-0 flex-col gap-[10px]",
            narrow ? "px-3 py-[10px]" : "px-4 py-[18px]",
          )}
          style={{
            height: `${resolveChartStageHeight(data.height, narrow)}px`,
          }}
        >
          {
            /* Les libellés d'axes vivent en HTML, pas dans le SVG : la maquette
            pose « % » en haut à droite du tracé, rien le long des axes. */
          }
          {(data.yAxisLabel || data.rightAxisLabel) && (
            <div class="flex justify-between font-mono text-nano text-ink-faint">
              <span>{data.yAxisLabel}</span>
              <span>{data.rightAxisLabel}</span>
            </div>
          )}
          <div ref={chartSurfaceRef} class="relative min-h-0 flex-1">
            <ChartRouter
              data={data}
              onDataClick={onDataClick}
              isSelected={activeContext.supported ? isPointSelected : undefined}
              canDrillDown={canDrillDownPoint}
            />
            <ChartKeyboardNavigator
              data={data}
              onActivate={onDataClick}
              onKeyActivate={onDataKeyDown}
              contextEnabled={activeContext.supported}
              canDrillDown={canDrillDownPoint}
              isSelected={activeContext.supported ? isPointSelected : undefined}
              isExpanded={pointExpansionState}
              onActiveChange={activateVisualPoint}
            />
            {activePoint && activeDetailMode && (
              <ChartDetailAffordance
                point={activePoint}
                mode={activeDetailMode}
                expanded={activeExpandedState ?? false}
                touch={layout === "mobile"}
                onToggle={() => {
                  activatePoint(
                    activePoint.label,
                    activePoint.series,
                    "drilldown",
                  );
                }}
              />
            )}
          </div>
          {data.xAxisLabel && (
            <div class="text-right font-mono text-nano text-ink-faint">
              {data.xAxisLabel}
            </div>
          )}
          <ChartLegend items={legendItems(data)} />
          {shared && (
            <span class="font-mono text-[10.5px] text-ink-faint">
              {sharedLabel(shared)}
            </span>
          )}
        </div>

        {!isRoot && (
          <section
            id={CHART_DETAIL_PANEL_ID}
            class="flex min-h-[280px] flex-col border-t border-line bg-surface"
          >
            <PathBar
              stack={nav.stack}
              onBack={nav.pop}
              onJump={nav.popTo}
              loading={current.loading}
              layout={layout}
            />
            <LevelBody
              level={current}
              app={app}
              list={list}
              layout={layout}
              fixture={fixture}
              onJump={jumpsEnabled ? nav.jump : undefined}
              onAsk={ask}
              onError={setLevelError}
              onMutated={nav.markStale}
              onDocumentChanged={nav.reportDocumentChange}
              onMutationInvalidate={onMutationInvalidate}
              onMutationRefresh={onMutationRefresh}
              onRefresh={() => void nav.refreshLevel()}
              context={documentContext}
              contextView={current.title}
            />
          </section>
        )}
      </div>

      {/* Pied de vue */}
      <ViewerFooter layout={layout} />
    </ViewerShell>
  );
}

export function ChartViewer() {
  const t = useT();
  const fixture = isFixtureMode();
  const [data, setData] = useState<ChartData | null>(
    fixture ? fixtureFromSearch() : null,
  );
  const [loading, setLoading] = useState(!fixture);
  const [refreshing, setRefreshing] = useState(false);
  const [rootFreshEvent, setRootFreshEvent] = useState(0);
  const [rootMutationEvent, setRootMutationEvent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const dataRef = useRef<ChartData | null>(
    fixture ? fixtureFromSearch() : null,
  );
  const refreshRequestRef = useRef<UiRefreshRequestData | null>(null);
  const refreshSequenceRef = useRef(createUiRefreshSequence());
  const rootEventRef = useRef(0);
  const lastRefreshStartedAtRef = useRef(0);

  const { ref: containerRef, layout, boundsStyle } = useViewerLayout<
    HTMLDivElement
  >();

  function hydrateData(nextData: ChartData) {
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
      const parsed = JSON.parse(text) as ChartData;
      parsed.datasets = Array.isArray(parsed.datasets) ? parsed.datasets : [];
      parsed.labels = Array.isArray(parsed.labels) ? parsed.labels : [];
      hydrateData(parsed);
      setError(null);
      setLoading(false);
      return true;
    } catch (cause) {
      console.error("Parse error:", cause);
      setError(t("chart.error.parse_failed"));
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
        minIntervalMs: CHART_REFRESH_INTERVAL_MS,
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
      <ViewerShell containerRef={containerRef} style={boundsStyle}>
        <StateMessage>{t("chart.loading")}</StateMessage>
      </ViewerShell>
    );
  }

  if (!data) {
    return (
      <ViewerShell containerRef={containerRef} style={boundsStyle}>
        <StateMessage>{t("chart.empty.message")}</StateMessage>
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
    <ChartContent
      data={data}
      error={error}
      layout={layout}
      containerRef={containerRef}
      boundsStyle={boundsStyle}
      refreshing={refreshing}
      rootRefreshRequest={rootRefreshRequest}
      rootFreshEvent={rootFreshEvent}
      rootMutationEvent={rootMutationEvent}
      canRefreshRoot={canRefreshRoot}
      onRefreshRoot={() =>
        void requestRefresh({ ignoreInterval: true, force: true })}
      onMutationInvalidate={() => {
        setRootMutationEvent(++rootEventRef.current);
        refreshSequenceRef.current = invalidateUiRefresh(
          refreshSequenceRef.current,
        );
      }}
      onMutationRefresh={() => {
        if (canRefreshRoot) {
          void requestRefresh({ ignoreInterval: true, force: true });
        }
      }}
    />
  );
}
