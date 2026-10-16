import {
  activeContextJsonResource,
  type ActiveContextLocalResource,
} from "../../shared/active-context.ts";
import type { KpiData } from "./types.ts";

export interface KpiSparklinePoint {
  index: number;
  label: string;
  value: number;
}

/**
 * Pairs only an explicitly aligned time label with each sparkline value.
 * A legacy payload stays readable, but never invents a period for context.
 */
export function kpiSparklinePoints(
  data: Pick<KpiData, "sparkline" | "sparklineLabels">,
): KpiSparklinePoint[] {
  const values = data.sparkline;
  const labels = data.sparklineLabels;
  if (!values || !labels || values.length !== labels.length) return [];

  const points = values.map((value, index) => ({
    index,
    label: typeof labels[index] === "string" ? labels[index].trim() : "",
    value,
  }));
  return points.every((point) => point.label.length > 0) ? points : [];
}

export function kpiSparklinePeriod(
  points: readonly KpiSparklinePoint[],
): string | undefined {
  if (points.length === 0) return undefined;
  if (points.length === 1) return points[0].label;
  return `${points[0].label} – ${points[points.length - 1].label}`;
}

/**
 * Série KPI alignée, réutilisant le contrat JSON borné du graphe.
 * Sans labels explicites, rien n'est inventé ni attaché.
 */
export function kpiTrendContextResource(
  data: Pick<
    KpiData,
    "label" | "sparkline" | "sparklineLabels" | "currency" | "unit"
  >,
): ActiveContextLocalResource | undefined {
  const points = kpiSparklinePoints(data);
  if (points.length === 0) return undefined;
  const period = kpiSparklinePeriod(points);
  const dataset = {
    label: data.label,
    values: points.map((point) => point.value),
    ...(data.currency
      ? { currency: data.currency }
      : data.unit
      ? { unit: data.unit }
      : {}),
  };
  return activeContextJsonResource(
    `ui://mcp-erpnext/kpi-viewer/context/${
      encodeURIComponent(`kpi:${data.label}:trend`)
    }`,
    {
      title: data.label,
      ...(period ? { subtitle: period } : {}),
      type: "line",
      labels: points.map((point) => point.label),
      datasets: [dataset],
    },
  );
}
