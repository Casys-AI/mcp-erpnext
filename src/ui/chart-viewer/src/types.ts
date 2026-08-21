import type { UiRefreshRequestData } from "~/shared/refresh";

export type ChartType =
  | "bar"
  | "horizontal-bar"
  | "stacked-bar"
  | "line"
  | "area"
  | "stacked-area"
  | "composed"
  | "pie"
  | "donut"
  | "radar"
  | "scatter"
  | "treemap";

export interface Dataset {
  label: string;
  values: number[];
  color?: string;
  /** For composed charts: override type per dataset */
  type?: "bar" | "line" | "area";
  /** Stack group name (datasets with same stack are stacked together) */
  stack?: string;
  /** For dual-axis: "left" (default) or "right" */
  yAxisId?: "left" | "right";
  /** Line/area: show dots? Default true for line, false for area */
  showDots?: boolean;
  /** Line style: "solid" | "dashed". Default "solid" */
  strokeStyle?: "solid" | "dashed";
}

export interface ScatterPoint {
  x: number;
  y: number;
  z?: number;
  label?: string;
}

export interface ScatterSeries {
  label: string;
  color?: string;
  points: ScatterPoint[];
}

export interface TreeNode {
  name: string;
  value?: number;
  color?: string;
  children?: TreeNode[];
}

export interface ChartData {
  title: string;
  subtitle?: string;
  type?: ChartType;
  labels: string[];
  datasets: Dataset[];
  unit?: string;
  currency?: string;
  generatedAt?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  showRightAxis?: boolean;
  rightAxisLabel?: string;
  scatterData?: ScatterSeries[];
  treeData?: TreeNode[];
  height?: number;
  refreshRequest?: UiRefreshRequestData;
  /** sendMessage template — `{label}` is replaced with the clicked label */
  _drillDown?: string;
}
