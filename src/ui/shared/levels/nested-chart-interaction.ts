import type { ContextSelectionItem } from "../active-context.ts";
import { formatCurrency, formatNumber, formatPercent } from "../format.ts";
import { type BarsBody, type BarsSeries, chartSeriesFormat } from "./bodies.ts";

function encoded(value: string): string {
  return encodeURIComponent(value.trim());
}

function pointValue(
  chart: BarsBody,
  series: BarsSeries,
  value: number,
): string {
  const format = chartSeriesFormat(chart, series);
  if (format.currency) return formatCurrency(value, format.currency);
  if (format.unit === "%") {
    return formatPercent(value, value % 1 === 0 ? 0 : 1);
  }
  return `${formatNumber(value, value % 1 === 0 ? 0 : 1)}${
    format.unit ? ` ${format.unit}` : ""
  }`;
}

/** Identité stable du sous-ensemble réconcilié par un mini-graphe. */
export function nestedChartContextId(
  levelKey: string,
  chartTitle: string,
): string {
  return `chart:${encoded(levelKey)}:${encoded(chartTitle)}`;
}

/**
 * Un point de graphe reste une référence compacte : son libellé, sa série et
 * sa valeur affichée, jamais la payload métier complète du niveau.
 */
export function nestedChartContextItem(
  chart: BarsBody,
  chartId: string,
  view: string,
  labelIndex: number,
  seriesIndex: number,
): ContextSelectionItem | null {
  const label = chart.labels[labelIndex];
  const series = chart.datasets[seriesIndex];
  if (label === undefined || !series) return null;
  const seriesLabel = series.label || `#${seriesIndex + 1}`;
  return {
    id: `${chartId}:point:${encoded(label)}:${encoded(seriesLabel)}`,
    view,
    reconcileKey: chartId,
    label: `${label} · ${seriesLabel}`,
    value: pointValue(chart, series, series.values[labelIndex] ?? 0),
  };
}

export function nestedChartContextCandidates(
  chart: BarsBody,
  chartId: string,
  view: string,
): ContextSelectionItem[] {
  return chart.labels.flatMap((_, labelIndex) =>
    chart.datasets.flatMap((_, seriesIndex) => {
      const item = nestedChartContextItem(
        chart,
        chartId,
        view,
        labelIndex,
        seriesIndex,
      );
      return item ? [item] : [];
    })
  );
}
