import type { UiRefreshRequestData } from "~/shared/refresh";

export interface KpiData {
  label: string;
  value: number;
  formattedValue?: string;
  unit?: string;
  currency?: string;
  delta?: number;
  /** Valeur numérique de la période de comparaison (ex. 5655 pour "vs 5 655,00 €"). */
  deltaValue?: number;
  deltaLabel?: string;
  trend?: "up" | "down" | "flat";
  trendIsGood?: boolean;
  sparkline?: number[];
  color?: string;
  icon?: string;
  refreshRequest?: UiRefreshRequestData;
  _drillDown?: string;
  _trendDrillDown?: string;
}
