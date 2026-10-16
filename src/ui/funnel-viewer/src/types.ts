import type { UiRefreshRequestData } from "../../shared/refresh.ts";

export interface FunnelStage {
  label: string;
  count: number;
  value?: number;
  color: string;
  conversionRate?: number;
  /** Conversation requested on double-click, Enter, or the detail button. */
  _drillDown?: string;
}

export interface FunnelData {
  title: string;
  subtitle?: string;
  stages: FunnelStage[];
  currency?: string;
  refreshRequest?: UiRefreshRequestData;
  /** Outils exacts autorisés par le registre serveur pour ce viewer. */
  _availableTools?: string[];
}
