/** @jsxImportSource preact */
/**
 * Chart viewer — Direction B v2 chrome; Recharts stays the domain renderer.
 * Handshake stays on ext-apps (refresh / callServerTool / sendMessage).
 */

import { useEffect, useRef, useState } from "preact/hooks";
import type { Ref } from "preact";
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

import { formatCurrency, formatNumber } from "~/shared/format";
import { useT } from "~/shared/i18n-hook";
import {
  type DrillDownChannel,
  drillDownChannel,
  sharedLabel,
  shareSelection,
} from "~/shared/drill-down";
import {
  cx,
  LiveDot,
  StateMessage,
  ViewerFooter,
  ViewerShell,
} from "~/shared/ui";
import { useViewerLayout, type ViewerLayout } from "~/shared/useViewerLayout";
import { useViewerNav } from "~/shared/useViewerNav";
import { PathBar } from "~/shared/PathBar";
import { LevelBody } from "~/shared/levels/LevelBody";
import { type Jump, jumpFromHint } from "~/shared/jumps";
import {
  canRequestUiRefresh,
  extractToolResultText,
  normalizeUiRefreshFailureMessage,
  resolveUiRefreshRequest,
  type ToolResultPayload,
  type UiRefreshRequestData,
} from "~/shared/refresh";
import { fixtureFromSearch, isFixtureMode } from "./fixture.ts";
import type { ChartData, Dataset, ScatterSeries, TreeNode } from "./types.ts";

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

function fmtValue(v: number, data: ChartData) {
  if (data.currency) return formatCurrency(v, data.currency);
  return `${formatNumber(v, v % 1 === 0 ? 0 : 1)}${
    data.unit ? " " + data.unit : ""
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
/** Style de la zone de rendu : gradient 2px + header ≈ 50px + footer ≈ 38px = 90px. */
const CHART_STAGE_STYLE = {
  height: "calc(100vh - 106px)",
  minHeight: 220,
};
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

function ChartTooltip({ active, payload, label, data, drillDown }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
  data: ChartData;
  drillDown?: string;
}) {
  const t = useT();
  if (!active || !payload?.length) return null;
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
      {label && (
        <div
          style={{
            color: "var(--color-ink-faint)",
            fontSize: 11,
          }}
        >
          {label}
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
            {fmtValue(p.value, data)}
          </span>
        </div>
      ))}
      {drillDown && (
        <div
          style={{
            borderTop: "1px solid var(--color-line)",
            marginTop: 2,
            paddingTop: 4,
            fontSize: 10,
            color: "var(--color-accent-text)",
          }}
        >
          {t("chart.tooltip.click")} → «{" "}
          {drillDown.replace(/\{label\}/g, label ?? "…")} »
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
  { data, onDataClick }: {
    data: ChartData;
    onDataClick?: (label: string) => void;
  },
) {
  const rows = toRows(data);
  const stacked = data.type === "stacked-bar";
  const single = !stacked && data.datasets.length === 1;
  /* Série seule : 0,85 partout, la dernière barre à 1 — la valeur du moment,
     que la maquette fait ressortir. Par `shape` et non par des <Cell> : sous
     Preact, des Cell enfants font disparaître les barres au premier survol. */
  const soloBar = (props: BarShapeProps) => (
    <Rectangle
      {...props}
      opacity={props.index === rows.length - 1 ? 1 : 0.85}
    />
  );

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
          content={<ChartTooltip data={data} drillDown={data._drillDown} />}
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
            opacity={single ? undefined : 0.85}
            maxBarSize={40}
            stackId={stacked ? (ds.stack ?? "default") : undefined}
            yAxisId={ds.yAxisId}
            isAnimationActive={false}
            cursor={onDataClick ? "pointer" : undefined}
            onClick={onDataClick
              ? (entry: { payload?: { name?: unknown } }) =>
                onDataClick(String(entry.payload?.name ?? ""))
              : undefined}
            shape={single ? soloBar : undefined}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function HorizontalBarChart(
  { data, onDataClick }: {
    data: ChartData;
    onDataClick?: (label: string) => void;
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
          content={<ChartTooltip data={data} drillDown={data._drillDown} />}
          cursor={CURSOR}
          isAnimationActive={false}
        />
        {data.datasets.map((ds, i) => (
          <Bar
            key={ds.label}
            dataKey={ds.label}
            fill={dsColor(ds, i, data.datasets.length)}
            radius={[0, 3, 3, 0]}
            opacity={0.85}
            maxBarSize={24}
            isAnimationActive={false}
            cursor={onDataClick ? "pointer" : undefined}
            onClick={onDataClick
              ? (entry: { payload?: { name?: unknown } }) =>
                onDataClick(String(entry.payload?.name ?? ""))
              : undefined}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function LineChartView(
  { data, onDataClick }: {
    data: ChartData;
    onDataClick?: (label: string) => void;
  },
) {
  const rows = toRows(data);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={rows}
        margin={MARGIN}
        onClick={onDataClick
          ? (e: Record<string, unknown>) => {
            if (e?.activeLabel) onDataClick(String(e.activeLabel));
          }
          : undefined}
      >
        <CartesianGrid {...GRID} vertical={false} />
        <SharedXAxis data={data} />
        <SharedYAxis />
        {data.showRightAxis && (
          <SharedYAxis yAxisId="right" orientation="right" />
        )}
        <Tooltip
          content={<ChartTooltip data={data} drillDown={data._drillDown} />}
          cursor={<BandCursor count={rows.length} />}
          isAnimationActive={false}
        />
        {data.datasets.map((ds, i) => (
          <Line
            key={ds.label}
            type="linear"
            strokeLinecap="round"
            strokeLinejoin="round"
            dataKey={ds.label}
            stroke={dsColor(ds, i, data.datasets.length)}
            strokeWidth={2}
            strokeDasharray={ds.strokeStyle === "dashed" ? "6 3" : undefined}
            dot={ds.showDots !== false && ds.strokeStyle !== "dashed"
              ? { r: 2.6, fill: dsColor(ds, i, data.datasets.length) }
              : false}
            activeDot={onDataClick
              ? { ...ACTIVE_DOT_BASE, cursor: "pointer" }
              : ACTIVE_DOT_BASE}
            yAxisId={ds.yAxisId}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function AreaChartView(
  { data, onDataClick }: {
    data: ChartData;
    onDataClick?: (label: string) => void;
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
          ? (e: Record<string, unknown>) => {
            if (e?.activeLabel) onDataClick(String(e.activeLabel));
          }
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
          content={<ChartTooltip data={data} drillDown={data._drillDown} />}
          cursor={<BandCursor count={rows.length} />}
          isAnimationActive={false}
        />
        {data.datasets.map((ds, i) => {
          const color = dsColor(ds, i, data.datasets.length);
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
              dot={ds.showDots ? { r: 2.6, fill: color } : false}
              activeDot={ACTIVE_DOT_BASE}
              stackId={stacked ? (ds.stack ?? "default") : undefined}
              isAnimationActive={false}
            />
          );
        })}
      </AreaChart>
    </ResponsiveContainer>
  );
}

function ComposedChartView(
  { data, onDataClick }: {
    data: ChartData;
    onDataClick?: (label: string) => void;
  },
) {
  const rows = toRows(data);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        data={rows}
        margin={MARGIN}
        onClick={onDataClick
          ? (e: Record<string, unknown>) => {
            if (e?.activeLabel) onDataClick(String(e.activeLabel));
          }
          : undefined}
      >
        <CartesianGrid {...GRID} vertical={false} />
        <SharedXAxis data={data} />
        <SharedYAxis />
        {data.showRightAxis && (
          <SharedYAxis yAxisId="right" orientation="right" />
        )}
        <Tooltip
          content={<ChartTooltip data={data} drillDown={data._drillDown} />}
          cursor={<BandCursor count={rows.length} />}
          isAnimationActive={false}
        />
        {data.datasets.map((ds, i) => {
          const color = dsColor(ds, i, data.datasets.length);
          const dsType = ds.type ?? "bar";
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
                dot={ds.showDots !== false && ds.strokeStyle !== "dashed"
                  ? { r: 2.6, fill: color }
                  : false}
                activeDot={ACTIVE_DOT_BASE}
                yAxisId={ds.yAxisId}
                isAnimationActive={false}
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
                yAxisId={ds.yAxisId}
                isAnimationActive={false}
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
            />
          );
        })}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function PieDonutChart(
  { data, isDonut, onDataClick }: {
    data: ChartData;
    isDonut: boolean;
    onDataClick?: (label: string) => void;
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
                ? (entry: { name?: unknown }) =>
                  onDataClick(String(entry.name ?? ""))
                : undefined}
            >
              {pieData.map((_, i) => (
                <Cell
                  key={i}
                  fill={CATEGORICAL[Math.min(i, CATEGORICAL.length - 1)]}
                />
              ))}
            </Pie>
            <Tooltip
              content={<ChartTooltip data={data} drillDown={data._drillDown} />}
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

function RadarChartView({ data }: { data: ChartData }) {
  const rows = toRows(data);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <RadarChart data={rows} cx="50%" cy="50%" outerRadius="70%">
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
          content={<ChartTooltip data={data} drillDown={data._drillDown} />}
          isAnimationActive={false}
        />
        {data.datasets.map((ds, i) => (
          <Radar
            key={ds.label}
            dataKey={ds.label}
            stroke={dsColor(ds, i, data.datasets.length)}
            fill={dsColor(ds, i, data.datasets.length)}
            fillOpacity={0.2}
            strokeWidth={2}
            isAnimationActive={false}
          />
        ))}
      </RadarChart>
    </ResponsiveContainer>
  );
}

function ScatterChartView({ data }: { data: ChartData }) {
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
          content={<ChartTooltip data={data} />}
          cursor={false}
          isAnimationActive={false}
        />
        {series.map((s, i) => (
          <Scatter
            key={s.label}
            name={s.label}
            data={s.points}
            fill={s.color ?? CATEGORICAL[Math.min(i, CATEGORICAL.length - 1)]}
            opacity={0.75}
            isAnimationActive={false}
          />
        ))}
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
}

function TreemapContent(props: TreemapContentProps) {
  const { x, y, width, height, name, index, depth, colors: treeColors } = props;
  // Recharts passe aussi le nœud racine (profondeur 0) : une tuile de la
  // taille du tracé, le total dessus. On ne dessine que les feuilles.
  if (depth === 0) return null;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={treeColors[Math.min(index, treeColors.length - 1)]}
        opacity={0.8}
        rx={3}
        stroke="var(--color-surface)"
        strokeWidth={2}
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

function TreemapView({ data }: { data: ChartData }) {
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
          />
        }
      />
    </ResponsiveContainer>
  );
}

function ChartRouter(
  { data, onShared, tryJump }: {
    data: ChartData;
    onShared?: (channel: DrillDownChannel) => void;
    /** Un saut dans la vue pour ce libellé ; `true` s'il a été pris. */
    tryJump?: (label: string) => boolean;
  },
) {
  const type = data.type ?? "bar";
  const canDrill = drillDownChannel(app.getHostCapabilities()) !== "none";

  const onDataClick = (tryJump || (canDrill && data._drillDown))
    ? (label: string) => {
      if (tryJump?.(label)) return;
      if (!canDrill || !data._drillDown) return;
      const suggested = data._drillDown.replace(/\{label\}/g, label);
      shareSelection(app, { view: data.title, label, suggested })
        .then((channel) => onShared?.(channel));
    }
    : undefined;

  switch (type) {
    case "bar":
      return <VerticalBarChart data={data} onDataClick={onDataClick} />;
    case "stacked-bar":
      return <VerticalBarChart data={data} onDataClick={onDataClick} />;
    case "horizontal-bar":
      return <HorizontalBarChart data={data} onDataClick={onDataClick} />;
    case "line":
      return <LineChartView data={data} onDataClick={onDataClick} />;
    case "area":
      return <AreaChartView data={data} onDataClick={onDataClick} />;
    case "stacked-area":
      return <AreaChartView data={data} onDataClick={onDataClick} />;
    case "composed":
      return <ComposedChartView data={data} onDataClick={onDataClick} />;
    case "pie":
      return (
        <PieDonutChart data={data} isDonut={false} onDataClick={onDataClick} />
      );
    case "donut":
      return <PieDonutChart data={data} isDonut onDataClick={onDataClick} />;
    case "radar":
      return <RadarChartView data={data} />;
    case "scatter":
      return <ScatterChartView data={data} />;
    case "treemap":
      return <TreemapView data={data} />;
    default:
      return <VerticalBarChart data={data} onDataClick={onDataClick} />;
  }
}

/**
 * Chrome Direction B v2 : gradient 2px, header avec subtitle inline, LiveDot,
 * zone chart, footer. Pas de bouton Refresh visible — le rafraîchissement reste
 * automatique (interval + focus + visibilitychange).
 */
function ChartContent(
  { data, error, layout, containerRef }: {
    data: ChartData;
    error: string | null;
    layout: ViewerLayout;
    containerRef: Ref<HTMLDivElement>;
  },
) {
  const [shared, setShared] = useState<DrillDownChannel | null>(null);
  function flashShared(channel: DrillDownChannel) {
    if (channel === "none") return;
    setShared(channel);
    setTimeout(() => setShared(null), 1500);
  }
  const narrow = layout !== "wide";
  const t = useT();
  const fixture = isFixtureMode();
  const viewerNav = useViewerNav(app, {
    title: data.title,
    kind: "root",
    origin: "chart",
  }, { fixture });
  const nav = viewerNav.nav;
  const { current, isRoot } = nav;
  const { jumpsEnabled } = viewerNav;
  const { list } = viewerNav;
  const [levelError, setLevelError] = useState<string | null>(null);
  const { ask } = viewerNav;
  // Un point, une barre, une part : quand le serveur a décrit le saut de ce
  // libellé et que l'hôte relaie les outils, on empile ; sinon le contexte.
  const tryJump = jumpsEnabled && data._pointJumps
    ? (label: string): boolean => {
      const hint = data._pointJumps?.[label];
      const jump: Jump | null = hint
        ? jumpFromHint(hint, {}, t("nav.linked_to", { id: label }))
        : null;
      if (!jump) return false;
      void nav.jump(jump);
      return true;
    }
    : undefined;

  return (
    <ViewerShell containerRef={containerRef}>
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
                {isRoot ? data.title : current.title}
              </h3>
            )
            : (
              <h2 class="truncate font-display font-semibold text-ink text-[--text-title] tracking-title">
                {isRoot ? data.title : current.title}
              </h2>
            )}
          {isRoot && data.subtitle && (
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
        {/* LiveDot large = texte + point ; narrow = point seul */}
        {!narrow
          ? <LiveDot />
          : <span class="size-[5px] shrink-0 rounded-full bg-ok" />}
      </header>

      <PathBar
        stack={nav.stack}
        onBack={nav.pop}
        onJump={nav.popTo}
        loading={current.loading}
        layout={layout}
      />

      {/* Erreur éventuelle */}
      {error && <StateMessage tone="bad">{error}</StateMessage>}
      {levelError && <StateMessage tone="bad">{levelError}</StateMessage>}

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
        onRefresh={() => void nav.refreshLevel()}
      >
        {/* Zone de rendu du chart */}
        <div
          class={cx(
            "flex flex-col gap-[10px]",
            narrow ? "px-3 py-[10px]" : "px-4 py-[18px]",
          )}
          style={CHART_STAGE_STYLE}
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
          <div class="min-h-0 flex-1">
            <ChartRouter
              data={data}
              onShared={flashShared}
              tryJump={tryJump}
            />
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
      </LevelBody>

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
  const [error, setError] = useState<string | null>(null);
  const dataRef = useRef<ChartData | null>(
    fixture ? fixtureFromSearch() : null,
  );
  const refreshRequestRef = useRef<UiRefreshRequestData | null>(null);
  const refreshInFlightRef = useRef(false);
  const lastRefreshStartedAtRef = useRef(0);

  const { ref: containerRef, layout } = useViewerLayout<HTMLDivElement>();

  function hydrateData(nextData: ChartData) {
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
        minIntervalMs: CHART_REFRESH_INTERVAL_MS,
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
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (fixture) return;
    app.ontoolresult = (result: ToolResultPayload) => {
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
      <ViewerShell containerRef={containerRef}>
        <StateMessage>{t("chart.loading")}</StateMessage>
      </ViewerShell>
    );
  }

  if (!data) {
    return (
      <ViewerShell containerRef={containerRef}>
        <StateMessage>{t("chart.empty.message")}</StateMessage>
      </ViewerShell>
    );
  }

  return (
    <ChartContent
      data={data}
      error={error}
      layout={layout}
      containerRef={containerRef}
    />
  );
}
