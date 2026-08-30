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
  x?: number;
  y?: number;
}

export type ChartPointActivation = "context" | "drilldown";

export interface ChartPointActionPlan {
  toggleLevel: boolean;
  updateContext: boolean;
  sendMessage: boolean;
}

export type ChartPointExpansionState = boolean | undefined;

export interface ChartDetailHintPlacement {
  side: "left" | "right";
  maxWidth: number;
}

const DEFAULT_CHART_STAGE_HEIGHT = 300;
const NARROW_CHART_STAGE_HEIGHT = 260;
const MIN_CHART_STAGE_HEIGHT = 240;
const MAX_CHART_STAGE_HEIGHT = 520;

/** Choisit le côté qui garde le helper dans la largeur réelle du graphe. */
export function chartDetailHintPlacement(
  surfaceWidth: number,
  actionLeft: number,
  actionSize: number,
): ChartDetailHintPlacement {
  const width = Number.isFinite(surfaceWidth) ? Math.max(0, surfaceWidth) : 0;
  const left = Number.isFinite(actionLeft) ? Math.max(0, actionLeft) : 0;
  const size = Number.isFinite(actionSize) ? Math.max(0, actionSize) : 0;
  const gap = 6;
  const edge = 8;
  const leftSpace = Math.max(0, left - gap - edge);
  const rightSpace = Math.max(0, width - left - size - gap - edge);
  return rightSpace >= leftSpace
    ? { side: "right", maxWidth: Math.floor(rightSpace) }
    : { side: "left", maxWidth: Math.floor(leftSpace) };
}

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
  data: ChartData,
  cursor: ChartCursor,
): ChartSelection | null {
  const groups = chartNavigationGroups(data);
  if (groups.length === 0) return null;
  const group = groups[wrap(cursor.seriesIndex, groups.length)];
  if (group.length === 0) return null;
  return group[wrap(cursor.labelIndex, group.length)];
}

function treeSelections(
  nodes: NonNullable<ChartData["treeData"]>,
): ChartSelection[] {
  const result: ChartSelection[] = [];
  for (const node of nodes) {
    if (node.children?.length) {
      result.push(...treeSelections(node.children));
    } else if (
      typeof node.name === "string" && node.name.trim() &&
      typeof node.value === "number" && Number.isFinite(node.value)
    ) {
      result.push({
        label: node.name,
        value: node.value,
      });
    }
  }
  return result;
}

/**
 * Grille reelle du controle clavier. Scatter utilise uniquement ses points
 * nommes ; treemap ses feuilles. Aucun label artificiel n'est donc cree pour
 * fabriquer une cible ou un saut qui n'existe pas dans le payload.
 */
export function chartNavigationGroups(data: ChartData): ChartSelection[][] {
  if (data.type === "scatter") {
    return (data.scatterData ?? []).flatMap((series) => {
      const points = series.points.flatMap((point): ChartSelection[] => {
        const label = typeof point.label === "string" ? point.label.trim() : "";
        if (!label || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
          return [];
        }
        return [{
          label,
          series: series.label || undefined,
          x: Number.isFinite(point.x) ? point.x : undefined,
          y: Number.isFinite(point.y) ? point.y : undefined,
          value: Number.isFinite(point.y) ? point.y : undefined,
        }];
      });
      return points.length > 0 ? [points] : [];
    });
  }

  if (data.type === "treemap") {
    if (data.treeData?.length) {
      const points = treeSelections(data.treeData);
      return points.length > 0 ? [points] : [];
    }
    const dataset = data.datasets[0];
    if (!dataset) return [];
    const points = data.labels.map((label, index) => ({
      label,
      value: typeof dataset.values[index] === "number" &&
          Number.isFinite(dataset.values[index])
        ? dataset.values[index]
        : undefined,
    }));
    return points.length > 0 ? [points] : [];
  }

  return data.datasets.flatMap((dataset) => {
    const points = data.labels.map((label, index) => {
      const rawValue = dataset.values[index];
      return {
        label,
        series: dataset.label || undefined,
        value: typeof rawValue === "number" && Number.isFinite(rawValue)
          ? rawValue
          : undefined,
      };
    });
    return points.length > 0 ? [points] : [];
  });
}

/** Nombre de cibles sur l'axe courant et nombre de series navigables. */
export function chartCursorCounts(
  data: ChartData,
  cursor: ChartCursor,
): { labelCount: number; seriesCount: number } {
  const groups = chartNavigationGroups(data);
  if (groups.length === 0) return { labelCount: 0, seriesCount: 0 };
  return {
    labelCount: groups[wrap(cursor.seriesIndex, groups.length)].length,
    seriesCount: groups.length,
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

/**
 * Les deux gestes restent exclusifs. Le contexte ne parle jamais à la place de
 * l'utilisateur ; le message n'est qu'un repli explicite du drill-down.
 */
export function chartPointActionPlan(
  activation: ChartPointActivation,
  hasJump: boolean,
  contextSupported: boolean,
  messageSupported: boolean,
): ChartPointActionPlan {
  if (activation === "context") {
    return {
      toggleLevel: false,
      updateContext: contextSupported,
      sendMessage: false,
    };
  }
  return {
    toggleLevel: hasJump,
    updateContext: false,
    sendMessage: !hasJump && messageSupported,
  };
}

/** Un fallback conversationnel est une action, jamais un disclosure ARIA. */
export function chartPointExpansionState(
  hasInlineJump: boolean,
  expanded: boolean,
): ChartPointExpansionState {
  return hasInlineJump ? expanded : undefined;
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

/** Libelle utilisable d'un point Scatter Recharts, direct ou sous payload. */
export function chartScatterPointLabel(point: unknown): string | undefined {
  if (!point || typeof point !== "object") return undefined;
  const direct = (point as { label?: unknown }).label;
  const nested = (point as { payload?: { label?: unknown } }).payload?.label;
  const value = typeof direct === "string"
    ? direct.trim()
    : typeof nested === "string"
    ? nested.trim()
    : "";
  return value || undefined;
}
