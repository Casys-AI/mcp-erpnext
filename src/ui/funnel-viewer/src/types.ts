import type { UiRefreshRequestData } from "~/shared/refresh";
import type { NavHint } from "~/shared/jumps";

export interface FunnelStage {
  label: string;
  count: number;
  value?: number;
  color: string;
  conversionRate?: number;
  /** sendMessage text when clicking this stage (auto-injected by server) */
  _drillDown?: string;
}

export interface FunnelData {
  title: string;
  subtitle?: string;
  stages: FunnelStage[];
  currency?: string;
  refreshRequest?: UiRefreshRequestData;
  /**
   * Sauts serveur par libellé d'étape.
   * Injecté par withUiRefreshRequest → FUNNEL_STAGE_JUMPS.
   * Chaque valeur est un NavHint compatible jumpFromHint().
   */
  _stageJumps?: Record<string, NavHint>;
}
