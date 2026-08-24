/**
 * Lire le corps d'un niveau empilé.
 *
 * Un outil répond avec sa propre forme ; un niveau n'en retient que ce qu'il
 * sait rendre : une fiche (objet), des barres (libellés + valeurs), une
 * liste (`{ data: [] }`). Ces lectures sont pures et tolérantes — un corps
 * qui ne correspond pas donne `null`, jamais une exception.
 */

import type { NavHint } from "../jumps.ts";

export type BarsChartType =
  | "bar"
  | "horizontal-bar"
  | "stacked-bar"
  | "line"
  | "area"
  | "stacked-area"
  | "composed";

export type BarsSeriesType = "bar" | "line" | "area";

export interface BarsSeries {
  label: string;
  values: number[];
  color?: string;
  type?: BarsSeriesType;
  stack?: string;
  yAxisId?: "left" | "right";
  showDots?: boolean;
  strokeStyle?: "solid" | "dashed";
  unit?: string;
  currency?: string;
}

export interface BarsBody {
  labels: string[];
  datasets: BarsSeries[];
  type?: BarsChartType;
  unit?: string;
  currency?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  rightAxisLabel?: string;
  showRightAxis?: boolean;
  /** Par libellé : le saut qu'une barre ouvre (enrichi par le serveur). */
  pointJumps?: Record<string, NavHint>;
  /** Par libellé puis série : le saut exact qu'un segment ouvre. */
  seriesPointJumps?: Record<string, Record<string, NavHint>>;
}

const CHART_TYPES = new Set<BarsChartType>([
  "bar",
  "horizontal-bar",
  "stacked-bar",
  "line",
  "area",
  "stacked-area",
  "composed",
]);
const SERIES_TYPES = new Set<BarsSeriesType>(["bar", "line", "area"]);

function chartType(value: unknown): BarsChartType | undefined {
  return typeof value === "string" && CHART_TYPES.has(value as BarsChartType)
    ? value as BarsChartType
    : undefined;
}

function seriesType(value: unknown): BarsSeriesType | undefined {
  return typeof value === "string" && SERIES_TYPES.has(value as BarsSeriesType)
    ? value as BarsSeriesType
    : undefined;
}

/** Type visuel effectif : le dataset prime, puis le type global du graphique. */
export function chartSeriesType(
  chart: Pick<BarsBody, "type">,
  series: Pick<BarsSeries, "type">,
): BarsSeriesType {
  if (series.type) return series.type;
  if (chart.type === "line") return "line";
  if (chart.type === "area" || chart.type === "stacked-area") return "area";
  return "bar";
}

/** Le saut du segment exact, puis celui de la catégorie si elle en a un. */
export function chartHintAt(
  chart: Pick<
    BarsBody,
    "labels" | "datasets" | "pointJumps" | "seriesPointJumps"
  >,
  labelIndex: number,
  seriesIndex: number,
): NavHint | undefined {
  const label = chart.labels[labelIndex];
  const series = chart.datasets[seriesIndex]?.label;
  return (label !== undefined && series
    ? chart.seriesPointJumps?.[label]?.[series]
    : undefined) ??
    (label !== undefined ? chart.pointJumps?.[label] : undefined);
}

/**
 * Format d'une série. Un axe droit explicitement en pourcentage ne doit pas
 * hériter de la devise de l'axe principal (Gross Profit : EUR + Margin %).
 */
export function chartSeriesFormat(
  chart: Pick<BarsBody, "currency" | "unit" | "rightAxisLabel">,
  series: Pick<BarsSeries, "currency" | "unit" | "yAxisId">,
): { currency?: string; unit?: string } {
  if (series.currency) return { currency: series.currency };
  if (series.unit) return { unit: series.unit };
  if (series.yAxisId === "right" && chart.rightAxisLabel?.includes("%")) {
    return { unit: "%" };
  }
  if (chart.currency) return { currency: chart.currency };
  return chart.unit ? { unit: chart.unit } : {};
}

/** `{ data: {...} }` ou l'objet lui-même — jamais un tableau. */
export function recordOf(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object") return null;
  const inner = (body as { data?: unknown }).data;
  const record = inner && typeof inner === "object" ? inner : body;
  return Array.isArray(record) ? null : record as Record<string, unknown>;
}

/**
 * `{ labels, values }`, ou la forme des outils graphiques
 * `{ labels, datasets: [{ label, values, color }] }` (toutes les séries).
 */
export function chartOf(body: unknown): BarsBody | null {
  if (!body || typeof body !== "object") return null;
  const b = body as {
    labels?: unknown;
    values?: unknown;
    unit?: unknown;
    currency?: unknown;
    xAxisLabel?: unknown;
    type?: unknown;
    yAxisLabel?: unknown;
    rightAxisLabel?: unknown;
    showRightAxis?: unknown;
    title?: unknown;
    datasets?: {
      label?: unknown;
      values?: unknown;
      color?: unknown;
      type?: unknown;
      stack?: unknown;
      yAxisId?: unknown;
      showDots?: unknown;
      strokeStyle?: unknown;
      unit?: unknown;
      currency?: unknown;
    }[];
    _pointJumps?: unknown;
    _seriesPointJumps?: unknown;
  };
  if (!Array.isArray(b.labels)) return null;
  const labels = b.labels.map(String);
  const rawDatasets: unknown[] = Array.isArray(b.values)
    ? [{ label: b.title, values: b.values }]
    : Array.isArray(b.datasets)
    ? b.datasets
    : [];
  const datasets: BarsSeries[] = rawDatasets.flatMap((rawDataset) => {
    if (!rawDataset || typeof rawDataset !== "object") return [];
    const dataset = rawDataset as {
      label?: unknown;
      values?: unknown;
      color?: unknown;
      type?: unknown;
      stack?: unknown;
      yAxisId?: unknown;
      showDots?: unknown;
      strokeStyle?: unknown;
      unit?: unknown;
      currency?: unknown;
    };
    if (!Array.isArray(dataset.values)) return [];
    const values = dataset.values;
    return [{
      label: typeof dataset.label === "string" ? dataset.label : "",
      values: labels.map((_, index) => {
        const value = Number(values[index] ?? 0);
        return Number.isFinite(value) ? value : 0;
      }),
      color: typeof dataset.color === "string" ? dataset.color : undefined,
      type: seriesType(dataset.type),
      stack: typeof dataset.stack === "string" ? dataset.stack : undefined,
      yAxisId: dataset.yAxisId === "left" || dataset.yAxisId === "right"
        ? dataset.yAxisId
        : undefined,
      showDots: typeof dataset.showDots === "boolean"
        ? dataset.showDots
        : undefined,
      strokeStyle: dataset.strokeStyle === "solid" ||
          dataset.strokeStyle === "dashed"
        ? dataset.strokeStyle
        : undefined,
      unit: typeof dataset.unit === "string" ? dataset.unit : undefined,
      currency: typeof dataset.currency === "string"
        ? dataset.currency
        : undefined,
    }];
  });
  if (datasets.length === 0) return null;
  return {
    labels,
    datasets,
    type: chartType(b.type),
    unit: typeof b.unit === "string" ? b.unit : undefined,
    currency: typeof b.currency === "string" ? b.currency : undefined,
    xAxisLabel: typeof b.xAxisLabel === "string" ? b.xAxisLabel : undefined,
    yAxisLabel: typeof b.yAxisLabel === "string" ? b.yAxisLabel : undefined,
    rightAxisLabel: typeof b.rightAxisLabel === "string"
      ? b.rightAxisLabel
      : undefined,
    showRightAxis: typeof b.showRightAxis === "boolean"
      ? b.showRightAxis
      : undefined,
    pointJumps: b._pointJumps && typeof b._pointJumps === "object"
      ? b._pointJumps as Record<string, NavHint>
      : undefined,
    seriesPointJumps: b._seriesPointJumps &&
        typeof b._seriesPointJumps === "object"
      ? b._seriesPointJumps as Record<string, Record<string, NavHint>>
      : undefined,
  };
}

/** `{ data: [...] }` — la forme d'une liste. */
export function listOf<T extends { data?: unknown[] }>(
  body: unknown,
): T | null {
  if (!body || typeof body !== "object") return null;
  return Array.isArray((body as { data?: unknown }).data) ? body as T : null;
}
