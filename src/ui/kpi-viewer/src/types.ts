import type { UiRefreshRequestData } from "../../shared/refresh.ts";

/**
 * Ligne secondaire structurée, localisée par le viewer. Union fermée : un
 * `kind` inconnu n'affiche simplement aucune ligne.
 */
export type KpiSecondary =
  | { kind: "invoice_count"; value: number }
  | { kind: "amount"; value: number; currency: string };

export interface KpiViewerError {
  origin: "data" | "conversation";
  message: string;
}

export interface KpiData {
  label: string;
  value: number;
  /**
   * Texte serveur pour hôtes non graphiques (anglais, en-US). Le viewer ne le
   * rend qu'en légende de repli quand `secondary` est absent.
   */
  formattedValue?: string;
  /** Information complémentaire : compte de factures ou montant en retard. */
  secondary?: KpiSecondary;
  unit?: string;
  currency?: string;
  /** Variation déjà en points de pourcentage (2.8 → 2,8 %). */
  delta?: number;
  /** Valeur numérique de la période de comparaison (ex. 5655 pour "vs 5 655,00 €"). */
  deltaValue?: number;
  deltaLabel?: string;
  trend?: "up" | "down" | "flat";
  trendIsGood?: boolean;
  sparkline?: number[];
  /** Labels aligned with sparkline values, from oldest to newest. */
  sparklineLabels?: string[];
  color?: string;
  icon?: string;
  refreshRequest?: UiRefreshRequestData;
  /** Outils exacts autorisés par le registre serveur pour ce viewer. */
  _availableTools?: string[];
  _drillDown?: string;
  _trendDrillDown?: string;
}
