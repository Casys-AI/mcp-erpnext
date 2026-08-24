import type { UiRefreshRequestData } from "../../shared/refresh.ts";
import type { NavHint } from "../../shared/jumps.ts";

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
  /** Outils exacts autorisés par le registre serveur pour ce viewer. */
  _availableTools?: string[];
  _drillDown?: string;
  _trendDrillDown?: string;
  /** Sauts de pile : le nombre ouvre une liste, la courbe un graphique. */
  _jumps?: { number?: NavHint; trend?: NavHint };
}
