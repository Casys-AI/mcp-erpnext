import {
  activeContextJsonResource,
  type ActiveContextLocalResource,
  type ContextSelectionItem,
} from "../../shared/active-context.ts";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
} from "../../shared/format.ts";
import type { NavHint } from "../../shared/jumps.ts";
import { chartSeriesFormat } from "../../shared/levels/bodies.ts";
import type { ChartData, Dataset } from "./types.ts";

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

const DEFAULT_CHART_STAGE_HEIGHT = 300;
const NARROW_CHART_STAGE_HEIGHT = 260;
const MIN_CHART_STAGE_HEIGHT = 240;
const MAX_CHART_STAGE_HEIGHT = 520;

/**
 * Espace de noms compact d'une racine de graphe. L'identite complete reste le
 * reconcileKey ; ce hash borne seulement les ids exposes au contexte modele.
 */
export function chartContextNamespace(identity: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(identity)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `chart:${hash.toString(36)}`;
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

function seriesKey(label: string): string {
  return label.trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function subtitleReferencesSeries(subtitle: string, series: string): boolean {
  return new RegExp(
    `(^|[^\\p{L}\\p{N}])${escapeRegExp(series)}(?=$|[^\\p{L}\\p{N}])`,
    "iu",
  ).test(subtitle);
}

/** Noms uniques des séries pilotables par la légende, dans l'ordre du payload. */
export function chartSeriesNames(data: ChartData): string[] {
  const labels = data.type === "scatter"
    ? (data.scatterData ?? []).map((series) => series.label)
    : data.datasets.map((dataset) => dataset.label);
  const seen = new Set<string>();
  return labels.flatMap((label) => {
    const normalized = seriesKey(label);
    if (!normalized || seen.has(normalized)) return [];
    seen.add(normalized);
    return [normalized];
  });
}

/**
 * Nettoie un état de légende après refresh et garantit qu'une série reste
 * visible, même si le payload a changé pendant que la vue était ouverte.
 */
export function normalizeHiddenChartSeries(
  data: ChartData,
  hiddenSeries: readonly string[],
): string[] {
  const available = chartSeriesNames(data);
  const hidden = new Set(hiddenSeries.map(seriesKey));
  const normalized = available.filter((series) => hidden.has(series));
  return available.length > 0 && normalized.length === available.length
    ? normalized.slice(1)
    : normalized;
}

/** Active ou désactive une série sans jamais masquer la dernière visible. */
export function toggleHiddenChartSeries(
  data: ChartData,
  hiddenSeries: readonly string[],
  series: string,
): string[] {
  const available = chartSeriesNames(data);
  const normalized = normalizeHiddenChartSeries(data, hiddenSeries);
  const target = seriesKey(series);
  if (!available.includes(target)) return normalized;

  const hidden = new Set(normalized);
  if (hidden.delete(target)) {
    return available.filter((candidate) => hidden.has(candidate));
  }
  if (available.length - hidden.size <= 1) return normalized;
  hidden.add(target);
  return available.filter((candidate) => hidden.has(candidate));
}

/** Séries encore rendues et partageables dans le contexte actif. */
export function chartVisibleSeriesNames(
  data: ChartData,
  hiddenSeries: readonly string[],
): string[] {
  const hidden = new Set(normalizeHiddenChartSeries(data, hiddenSeries));
  return chartSeriesNames(data).filter((series) => !hidden.has(series));
}

/** Retire les séries masquées du rendu, du tooltip et de la navigation. */
export function filterVisibleChartSeries(
  data: ChartData,
  hiddenSeries: readonly string[],
): ChartData {
  const hidden = new Set(normalizeHiddenChartSeries(data, hiddenSeries));
  const datasetNames = new Set<string>();
  const datasets = data.datasets.filter((dataset) => {
    const name = seriesKey(dataset.label);
    if (hidden.has(name)) return false;
    if (!name || !datasetNames.has(name)) {
      if (name) datasetNames.add(name);
      return true;
    }
    return false;
  });
  const scatterNames = new Set<string>();
  const scatterData = data.scatterData?.filter((series) => {
    const name = seriesKey(series.label);
    if (hidden.has(name)) return false;
    if (!name || !scatterNames.has(name)) {
      if (name) scatterNames.add(name);
      return true;
    }
    return false;
  });
  const hasHiddenSeries = hidden.size > 0;
  const visibleNames = chartVisibleSeriesNames(data, hiddenSeries);
  const seriesSubtitle = chartSeriesNames(data).join(" vs ");
  const subtitleReferencesHidden = data.subtitle
    ? [...hidden].some((series) =>
      subtitleReferencesSeries(data.subtitle ?? "", series)
    )
    : false;
  const subtitle = hasHiddenSeries
    ? data.subtitle?.trim() === seriesSubtitle
      ? visibleNames.join(" vs ") || undefined
      : subtitleReferencesHidden
      ? undefined
      : data.subtitle
    : data.subtitle;
  const deriveCartesianAxes = hasHiddenSeries && data.type !== "scatter";
  const hasLeftAxis = datasets.some((dataset) =>
    (dataset.yAxisId ?? "left") === "left"
  );
  const hasRightAxis = datasets.some((dataset) => dataset.yAxisId === "right");
  return {
    ...data,
    subtitle,
    datasets,
    ...(deriveCartesianAxes
      ? {
        yAxisLabel: hasLeftAxis ? data.yAxisLabel : undefined,
        showRightAxis: hasRightAxis && data.showRightAxis === true,
        rightAxisLabel: hasRightAxis ? data.rightAxisLabel : undefined,
      }
      : {}),
    ...(data.scatterData
      ? {
        scatterData,
      }
      : {}),
  };
}

/** Payload métier exact attaché lorsque l'hôte accepte une ressource locale. */
export function visibleChartContextResource(
  data: ChartData,
  hiddenSeries: readonly string[],
  identity: string,
): ActiveContextLocalResource {
  const visible = filterVisibleChartSeries(data, hiddenSeries);
  const payload = {
    title: visible.title,
    ...(visible.subtitle ? { subtitle: visible.subtitle } : {}),
    type: visible.type ?? "bar",
    labels: visible.labels,
    datasets: visible.datasets.map((dataset) => {
      const format = chartSeriesFormat(visible, dataset);
      return {
        label: dataset.label,
        values: dataset.values,
        ...(dataset.type ? { type: dataset.type } : {}),
        ...(dataset.stack ? { stack: dataset.stack } : {}),
        ...(dataset.yAxisId ? { yAxisId: dataset.yAxisId } : {}),
        ...(format.unit ? { unit: format.unit } : {}),
        ...(format.currency ? { currency: format.currency } : {}),
      };
    }),
    ...(visible.scatterData
      ? {
        scatterData: visible.scatterData.map((series) => ({
          label: series.label,
          points: series.points,
        })),
      }
      : {}),
    ...(visible.treeData ? { treeData: visible.treeData } : {}),
    ...(visible.datasets.length === 0 && visible.unit
      ? { unit: visible.unit }
      : {}),
    ...(visible.datasets.length === 0 && visible.currency
      ? { currency: visible.currency }
      : {}),
    ...(visible.generatedAt ? { generatedAt: visible.generatedAt } : {}),
    ...(visible.xAxisLabel ? { xAxisLabel: visible.xAxisLabel } : {}),
    ...(visible.yAxisLabel ? { yAxisLabel: visible.yAxisLabel } : {}),
    ...(visible.showRightAxis ? { showRightAxis: true } : {}),
    ...(visible.rightAxisLabel
      ? { rightAxisLabel: visible.rightAxisLabel }
      : {}),
  };
  return activeContextJsonResource(
    `ui://mcp-erpnext/chart-viewer/context/${
      encodeURIComponent(chartContextNamespace(identity))
    }`,
    payload,
  );
}

function chartPointDisplayValue(
  data: ChartData,
  selection: ChartSelection,
  datasets: ReadonlyMap<string, Dataset>,
): string | null {
  if (selection.x !== undefined && selection.y !== undefined) {
    return `${data.xAxisLabel ?? "x"}: ${formatNumber(selection.x, 2)} · ${
      data.yAxisLabel ?? "y"
    }: ${formatNumber(selection.y, 2)}`;
  }
  if (selection.value === undefined) return null;
  const dataset = selection.series === undefined
    ? undefined
    : datasets.get(selection.series);
  const format = dataset
    ? chartSeriesFormat(data, dataset)
    : { currency: data.currency, unit: data.unit };
  if (format.currency) return formatCurrency(selection.value, format.currency);
  if (format.unit === "%") {
    return formatPercent(selection.value, selection.value % 1 === 0 ? 0 : 1);
  }
  return `${formatNumber(selection.value, selection.value % 1 === 0 ? 0 : 1)}${
    format.unit ? ` ${format.unit}` : ""
  }`;
}

function chartPointItem(
  data: ChartData,
  identity: string,
  namespace: string,
  label: string,
  series?: string,
): ContextSelectionItem {
  return {
    id: `${namespace}:point:${encodeURIComponent(label)}:${
      series === "all" ? "s:all" : encodeURIComponent(series ?? "all")
    }`,
    view: data.title,
    reconcileKey: identity,
    label: series ? `${label} · ${series}` : label,
    value: undefined,
  };
}

export function createChartPointContextIndex(
  data: ChartData,
  identity: string,
): {
  get(label: string, series?: string): ContextSelectionItem;
  values(): IterableIterator<ContextSelectionItem>;
} {
  const namespace = chartContextNamespace(identity);
  const datasets = new Map<string, Dataset>();
  for (const dataset of data.datasets) {
    if (!datasets.has(dataset.label)) datasets.set(dataset.label, dataset);
  }
  const candidates = new Map<
    string,
    { item: ContextSelectionItem; values: string[] }
  >();
  function append(
    label: string,
    series: string | undefined,
    value: string | null,
  ) {
    const item = chartPointItem(data, identity, namespace, label, series);
    const key = JSON.stringify([label, series ?? null]);
    let candidate = candidates.get(key);
    if (!candidate) {
      candidate = { item, values: [] };
      candidates.set(key, candidate);
    }
    if (value) candidate.values.push(value);
  }
  for (const group of chartNavigationGroups(data)) {
    for (const selection of group) {
      const formatted = chartPointDisplayValue(data, selection, datasets);
      append(
        selection.label,
        undefined,
        formatted && selection.series
          ? `${selection.series}: ${formatted}`
          : formatted,
      );
      if (selection.series) {
        append(selection.label, selection.series, formatted);
      }
    }
  }
  const items = new Map([...candidates].map(([id, { item, values }]) => [
    id,
    { ...item, value: values.length > 0 ? values.join(" · ") : undefined },
  ]));
  return {
    get(label, series) {
      return items.get(JSON.stringify([label, series ?? null])) ??
        chartPointItem(data, identity, namespace, label, series);
    },
    values: () => items.values(),
  };
}

/** Point de contexte issu du jeu de données complet, y compris une série masquée. */
export function chartPointContextItem(
  data: ChartData,
  identity: string,
  label: string,
  series?: string,
): ContextSelectionItem {
  return createChartPointContextIndex(data, identity).get(label, series);
}

/**
 * Candidats de réconciliation : points du dataset complet, graphe entier du
 * sous-ensemble encore visible.
 */
export function chartViewContextCandidates(
  data: ChartData,
  hiddenSeries: readonly string[],
  wholeLabel: string,
  identity: string,
): ContextSelectionItem[] {
  const candidates = new Map<string, ContextSelectionItem>();
  const whole = chartContextSelection(data, hiddenSeries, wholeLabel, identity);
  candidates.set(whole.id, whole);
  for (const item of createChartPointContextIndex(data, identity).values()) {
    candidates.set(item.id, item);
  }
  return [...candidates.values()];
}

/**
 * Sélection stable du diagramme complet. Le texte reste compact et la
 * ressource porte toutes les valeurs du seul sous-ensemble encore visible.
 */
export function chartContextSelection(
  data: ChartData,
  hiddenSeries: readonly string[],
  label: string,
  identity: string,
): ContextSelectionItem {
  const visibleSeries = chartVisibleSeriesNames(data, hiddenSeries);
  const first = data.labels[0];
  const last = data.labels[data.labels.length - 1];
  const period = first && last
    ? first === last ? first : `${first} → ${last}`
    : undefined;
  const value = [
    visibleSeries.length > 0 ? visibleSeries.join(", ") : undefined,
    period,
  ].filter((part): part is string => Boolean(part)).join(" · ");
  const namespace = chartContextNamespace(identity);
  return {
    id: `${namespace}:whole`,
    view: data.title,
    reconcileKey: identity,
    label,
    ...(value ? { value } : {}),
    resource: visibleChartContextResource(data, hiddenSeries, identity),
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

/**
 * Sans detail disponible, le second click natif et `dblclick` sont inertes :
 * le premier click reste ainsi selectionne au lieu d'etre compense en vain.
 */
export function shouldHandleChartPointActivation(
  activation: ChartPointActivation,
  clickCount: number,
  detailEnabled: boolean,
): boolean {
  return detailEnabled || (activation === "context" && clickCount < 2);
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
