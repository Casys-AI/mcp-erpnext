import type { ContextSelectionItem } from "../../shared/active-context.ts";
import type { KpiData } from "./types.ts";
import { kpiMainText, kpiParts, kpiSecondaryText } from "./kpi-format.ts";
import type { KpiTranslate } from "./kpi-format.ts";
import {
  kpiSparklinePeriod,
  kpiSparklinePoints,
  kpiTrendContextResource,
} from "./kpi-sparkline.ts";
import type { KpiSparklinePoint } from "./kpi-sparkline.ts";

export function kpiNumberContext(
  data: KpiData,
  tf: KpiTranslate,
): ContextSelectionItem {
  const secondary = kpiSecondaryText(data, tf);
  return {
    id: `kpi:${data.label}:value`,
    view: "KPI",
    label: data.label,
    value: [kpiMainText(kpiParts(data)), secondary].filter(Boolean).join(
      " · ",
    ),
  };
}

export function kpiTrendContext(
  data: KpiData,
  tf: KpiTranslate,
): ContextSelectionItem {
  const sparkline = data.sparkline && data.sparkline.length >= 2
    ? data.sparkline
    : undefined;
  const points = kpiSparklinePoints(data);
  const period = kpiSparklinePeriod(points);
  const lastValue = sparkline?.length
    ? kpiParts({ ...data, value: sparkline[sparkline.length - 1] })
    : undefined;
  const resource = kpiTrendContextResource(data);
  return {
    id: `kpi:${data.label}:trend`,
    view: "KPI",
    label: `${data.label} · ${tf("kpi.sparkline.trend_label")}`,
    value: [
      period,
      lastValue
        ? [lastValue.amount, lastValue.unit].filter(Boolean).join(" ")
        : undefined,
    ].filter(Boolean).join(" · ") || undefined,
    resource,
  };
}

export function kpiTrendPointContext(
  data: KpiData,
  point: KpiSparklinePoint,
): ContextSelectionItem {
  return {
    id: `kpi:${data.label}:trend:${encodeURIComponent(point.label)}`,
    view: "KPI",
    label: `${data.label} · ${point.label}`,
    value: kpiMainText(kpiParts({ ...data, value: point.value })),
  };
}

export function kpiContextCandidates(
  data: KpiData,
  tf: KpiTranslate,
): ContextSelectionItem[] {
  if (!data.sparkline || data.sparkline.length < 2) return [];
  const pointContexts = kpiSparklinePoints(data).map((point) =>
    kpiTrendPointContext(data, point)
  );
  return [
    kpiNumberContext(data, tf),
    kpiTrendContext(data, tf),
    ...pointContexts,
  ];
}
