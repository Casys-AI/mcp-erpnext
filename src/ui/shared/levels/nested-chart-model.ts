import { type BarsBody, type BarsSeries, chartSeriesType } from "./bodies.ts";

export type NestedAxis = "left" | "right";

export interface NestedDomain {
  min: number;
  max: number;
}

export interface NestedPoint {
  labelIndex: number;
  seriesIndex: number;
  value: number;
  /** Coordonnées en pourcentage du tracé, origine basse pour y/baseY. */
  x: number;
  y: number;
  baseY: number;
  barLeft: number;
  barWidth: number;
}

export interface NestedSeriesModel {
  seriesIndex: number;
  kind: "bar" | "line" | "area";
  axis: NestedAxis;
  stack?: string;
  points: NestedPoint[];
  linePath?: string;
  areaPath?: string;
}

export interface NestedChartModel {
  domains: Record<NestedAxis, NestedDomain>;
  zero: number;
  series: NestedSeriesModel[];
}

function axisOf(series: BarsSeries): NestedAxis {
  return series.yAxisId === "right" ? "right" : "left";
}

function stackOf(
  chart: BarsBody,
  series: BarsSeries,
  kind: "bar" | "line" | "area",
): string | undefined {
  if (series.stack) return `${axisOf(series)}:${kind}:${series.stack}`;
  if (kind === "bar" && chart.type === "stacked-bar") {
    return `${axisOf(series)}:bar:default`;
  }
  if (kind === "area" && chart.type === "stacked-area") {
    return `${axisOf(series)}:area:default`;
  }
  return undefined;
}

function finiteValue(series: BarsSeries, index: number): number {
  const value = series.values[index];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function domainsOf(chart: BarsBody): Record<NestedAxis, NestedDomain> {
  const extents: Record<NestedAxis, { min: number; max: number }> = {
    left: { min: 0, max: 0 },
    right: { min: 0, max: 0 },
  };

  for (let labelIndex = 0; labelIndex < chart.labels.length; labelIndex++) {
    const stacked = new Map<
      string,
      { axis: NestedAxis; negative: number; positive: number }
    >();
    chart.datasets.forEach((series) => {
      const axis = axisOf(series);
      const kind = chartSeriesType(chart, series);
      const value = finiteValue(series, labelIndex);
      const stack = stackOf(chart, series, kind);
      if (stack) {
        const aggregate = stacked.get(stack) ??
          { axis, negative: 0, positive: 0 };
        if (value < 0) aggregate.negative += value;
        else aggregate.positive += value;
        stacked.set(stack, aggregate);
      } else {
        extents[axis].min = Math.min(extents[axis].min, value);
        extents[axis].max = Math.max(extents[axis].max, value);
      }
    });
    for (const aggregate of stacked.values()) {
      extents[aggregate.axis].min = Math.min(
        extents[aggregate.axis].min,
        aggregate.negative,
      );
      extents[aggregate.axis].max = Math.max(
        extents[aggregate.axis].max,
        aggregate.positive,
      );
    }
  }

  const normalized = (domain: NestedDomain): NestedDomain =>
    domain.min === domain.max
      ? domain.max === 0
        ? { min: 0, max: 1 }
        : { min: Math.min(0, domain.min), max: Math.max(1, domain.max) }
      : domain;
  return {
    left: normalized(extents.left),
    right: normalized(extents.right),
  };
}

function ratio(value: number, domain: NestedDomain): number {
  return (value - domain.min) / (domain.max - domain.min) * 100;
}

function baseValue(
  chart: BarsBody,
  seriesIndex: number,
  labelIndex: number,
  stack: string | undefined,
  value: number,
): number {
  if (!stack) return 0;
  let base = 0;
  for (let index = 0; index < seriesIndex; index++) {
    const previous = chart.datasets[index];
    const kind = chartSeriesType(chart, previous);
    if (stackOf(chart, previous, kind) !== stack) continue;
    const previousValue = finiteValue(previous, labelIndex);
    if ((value < 0) === (previousValue < 0)) base += previousValue;
  }
  return base;
}

const pathNumber = (value: number) => Number(value.toFixed(3));

/** Modèle géométrique pur du mini-graphe imbriqué. */
export function nestedChartModel(chart: BarsBody): NestedChartModel {
  const domains = domainsOf(chart);
  const barGroups = [
    ...new Set(chart.datasets.flatMap((series, index) => {
      const kind = chartSeriesType(chart, series);
      if (kind !== "bar") return [];
      return [stackOf(chart, series, kind) ?? `series:${index}`];
    })),
  ];
  const labelCount = Math.max(1, chart.labels.length);
  const groupCount = Math.max(1, barGroups.length);

  const models = chart.datasets.map((series, seriesIndex) => {
    const kind = chartSeriesType(chart, series);
    const axis = axisOf(series);
    const stack = stackOf(chart, series, kind);
    const group = kind === "bar"
      ? barGroups.indexOf(stack ?? `series:${seriesIndex}`)
      : 0;
    const points = chart.labels.map((_, labelIndex): NestedPoint => {
      const value = finiteValue(series, labelIndex);
      const base = baseValue(chart, seriesIndex, labelIndex, stack, value);
      const domain = domains[axis];
      const labelSlot = 100 / labelCount;
      const groupSlot = labelSlot * 0.72 / groupCount;
      return {
        labelIndex,
        seriesIndex,
        value,
        x: (labelIndex + 0.5) / labelCount * 100,
        y: ratio(base + value, domain),
        baseY: ratio(base, domain),
        barLeft: labelIndex * labelSlot + labelSlot * 0.14 + group * groupSlot,
        barWidth: Math.max(0.8, groupSlot - Math.min(1.5, groupSlot * 0.14)),
      };
    });
    const linePath = kind === "line" || kind === "area"
      ? points.map((point, index) =>
        `${index === 0 ? "M" : "L"} ${pathNumber(point.x)} ${
          pathNumber(100 - point.y)
        }`
      ).join(" ")
      : undefined;
    const areaPath = kind === "area" && points.length > 0
      ? `${linePath} ${
        points.toReversed().map((point) =>
          `L ${pathNumber(point.x)} ${pathNumber(100 - point.baseY)}`
        ).join(" ")
      } Z`
      : undefined;
    return { seriesIndex, kind, axis, stack, points, linePath, areaPath };
  });

  return {
    domains,
    zero: ratio(0, domains.left),
    series: models,
  };
}
