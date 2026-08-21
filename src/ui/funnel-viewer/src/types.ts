import type { UiRefreshRequestData } from "~/shared/refresh";

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
}
