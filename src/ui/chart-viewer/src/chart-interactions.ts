import type { NavHint } from "../../shared/jumps.ts";
import type { ChartData } from "./types.ts";

/** Le point courant du contrôle clavier, indépendant du rendu Recharts. */
export interface ChartCursor {
  labelIndex: number;
  seriesIndex: number;
}

export type ChartCursorMove =
  | "previous-label"
  | "next-label"
  | "previous-series"
  | "next-series";

export interface ChartSelection {
  label: string;
  series?: string;
  value?: number;
}

const DEFAULT_CHART_STAGE_HEIGHT = 300;
const NARROW_CHART_STAGE_HEIGHT = 260;
const MIN_CHART_STAGE_HEIGHT = 240;
const MAX_CHART_STAGE_HEIGHT = 520;

/**
 * La hauteur du tracé est intrinsèque : une valeur liée à `100vh` figeait la
 * première petite taille proposée par certains hôtes MCP et écrasait le graphe.
 */
export function resolveChartStageHeight(
  requestedHeight: number | undefined,
  narrow: boolean,
): number {
  const fallback = narrow
    ? NARROW_CHART_STAGE_HEIGHT
    : DEFAULT_CHART_STAGE_HEIGHT;
  if (
    typeof requestedHeight !== "number" ||
    !Number.isFinite(requestedHeight)
  ) return fallback;
  return Math.min(
    MAX_CHART_STAGE_HEIGHT,
    Math.max(MIN_CHART_STAGE_HEIGHT, Math.round(requestedHeight)),
  );
}

function wrap(index: number, length: number): number {
  if (length <= 0) return 0;
  return ((index % length) + length) % length;
}

/**
 * Déplace le point de lecture sans créer une grille de tabulations : gauche /
 * droite parcourt les catégories, haut / bas les séries, avec bouclage.
 */
export function moveChartCursor(
  cursor: ChartCursor,
  move: ChartCursorMove,
  labelCount: number,
  seriesCount: number,
): ChartCursor {
  switch (move) {
    case "previous-label":
      return { ...cursor, labelIndex: wrap(cursor.labelIndex - 1, labelCount) };
    case "next-label":
      return { ...cursor, labelIndex: wrap(cursor.labelIndex + 1, labelCount) };
    case "previous-series":
      return {
        ...cursor,
        seriesIndex: wrap(cursor.seriesIndex - 1, seriesCount),
      };
    case "next-series":
      return {
        ...cursor,
        seriesIndex: wrap(cursor.seriesIndex + 1, seriesCount),
      };
  }
}

/** Le point et sa valeur à annoncer / activer pour le curseur clavier. */
export function chartSelectionAt(
  data: Pick<ChartData, "labels" | "datasets">,
  cursor: ChartCursor,
): ChartSelection | null {
  if (data.labels.length === 0 || data.datasets.length === 0) return null;
  const labelIndex = wrap(cursor.labelIndex, data.labels.length);
  const seriesIndex = wrap(cursor.seriesIndex, data.datasets.length);
  const dataset = data.datasets[seriesIndex];
  const rawValue = dataset.values[labelIndex];
  return {
    label: data.labels[labelIndex],
    series: dataset.label || undefined,
    value: typeof rawValue === "number" && Number.isFinite(rawValue)
      ? rawValue
      : undefined,
  };
}

/**
 * Résout d'abord le segment exact, puis le saut générique de sa catégorie.
 * L'absence de l'un et de l'autre signifie « contexte seulement ».
 */
export function chartJumpHint(
  data: Pick<ChartData, "_pointJumps" | "_seriesPointJumps">,
  label: string,
  series?: string,
): NavHint | undefined {
  return (series ? data._seriesPointJumps?.[label]?.[series] : undefined) ??
    data._pointJumps?.[label];
}

/** Le libellé actif d'un événement Recharts v3, borné aux labels reçus. */
export function chartPointLabel(
  labels: string[],
  state: Record<string, unknown> | null | undefined,
): string | undefined {
  if (!state) return undefined;
  const activeLabel = state.activeLabel;
  if (activeLabel !== null && activeLabel !== undefined) {
    const label = String(activeLabel);
    if (labels.includes(label)) return label;
  }
  for (const key of ["activeTooltipIndex", "activeIndex"] as const) {
    const raw = state[key];
    const index = typeof raw === "number"
      ? raw
      : typeof raw === "string" && /^\d+$/.test(raw)
      ? Number(raw)
      : Number.NaN;
    if (Number.isInteger(index) && index >= 0 && index < labels.length) {
      return labels[index];
    }
  }
  return undefined;
}

interface SeriesMarker {
  getAttribute(name: string): string | null;
}

interface ClosestSeriesTarget {
  closest(selector: string): SeriesMarker | null;
}

/** Série portée par la géométrie SVG cliquée, jamais une valeur arbitraire. */
export function chartSeriesFromTarget(
  target: unknown,
  allowedSeries: string[],
): string | undefined {
  if (
    !target || typeof target !== "object" ||
    typeof (target as Partial<ClosestSeriesTarget>).closest !== "function"
  ) return undefined;
  const marker = (target as ClosestSeriesTarget).closest(
    "[data-chart-series]",
  );
  const series = marker?.getAttribute("data-chart-series");
  return series && allowedSeries.includes(series) ? series : undefined;
}

/** Un saut inline interdit seulement le fallback conversationnel du contexte. */
export function contextFallbackForJump(
  jumped: boolean,
  fallback: string | undefined,
): string | undefined {
  return jumped ? undefined : fallback;
}
