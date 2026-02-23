/**
 * Chart Viewer v3 — Universal ERPNext chart renderer via Recharts
 *
 * Supports: bar, horizontal-bar, stacked-bar, line, area, composed,
 *           pie, donut, radar, scatter, treemap
 *
 * Data shape: ChartData — generic format that any MCP tool or PML workflow
 * can produce. The viewer is a pure renderer; data preparation is separate.
 *
 * Data preparation patterns:
 * 1. Analytics tools (erpnext_stock_chart, erpnext_sales_chart) — pre-formatted
 * 2. PML workflows — custom queries + transforms → ChartData
 * 3. Any MCP tool returning { _meta: { ui: { resourceUri: "ui://mcp-erpnext/chart-viewer" } } }
 */

import { useState, useEffect } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import {
  BarChart, Bar,
  LineChart, Line,
  AreaChart, Area,
  ComposedChart,
  PieChart, Pie, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ScatterChart, Scatter,
  Treemap,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from "recharts";
import { fonts, formatNumber, formatCurrency } from "~/shared/theme";
import { ErpNextBrandHeader } from "~/shared/ErpNextBrand";

// ============================================================================
// MCP App
// ============================================================================

const app = new App({ name: "Chart Viewer", version: "3.0.0" });

// ============================================================================
// Types — Universal ChartData format
// ============================================================================

type ChartType =
  | "bar" | "horizontal-bar" | "stacked-bar"
  | "line" | "area" | "stacked-area"
  | "composed"
  | "pie" | "donut"
  | "radar"
  | "scatter"
  | "treemap";

interface Dataset {
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

interface ScatterPoint {
  x: number;
  y: number;
  z?: number; // bubble size
  label?: string;
}

interface ScatterSeries {
  label: string;
  color?: string;
  points: ScatterPoint[];
}

interface TreeNode {
  name: string;
  value?: number;
  color?: string;
  children?: TreeNode[];
}

interface ChartData {
  title: string;
  subtitle?: string;
  type?: ChartType;
  /** X-axis labels (categories or time points) */
  labels: string[];
  /** Data series */
  datasets: Dataset[];
  /** Value unit suffix (e.g. "units", "kg") */
  unit?: string;
  /** Currency code for formatting (e.g. "EUR") */
  currency?: string;
  /** ISO timestamp */
  generatedAt?: string;
  /** Axis labels */
  xAxisLabel?: string;
  yAxisLabel?: string;
  /** Show right Y axis (for dual-axis charts) */
  showRightAxis?: boolean;
  rightAxisLabel?: string;
  /** Scatter-specific data */
  scatterData?: ScatterSeries[];
  /** Treemap-specific data */
  treeData?: TreeNode[];
  /** Height override (default varies by type) */
  height?: number;
}

// ============================================================================
// Color palette — real hex (CSS vars don't work in SVG fill)
// ============================================================================

const PALETTE = [
  "#60a5fa", // blue
  "#4ade80", // green
  "#fbbf24", // amber
  "#818cf8", // indigo
  "#c084fc", // purple
  "#fb923c", // orange
  "#34d399", // emerald
  "#f472b6", // pink
  "#a78bfa", // violet
  "#f97316", // deep orange
  "#22d3ee", // cyan
  "#e879f9", // fuchsia
];

function dsColor(ds: Dataset | ScatterSeries, i: number) {
  return ds.color ?? PALETTE[i % PALETTE.length];
}

// ============================================================================
// Helpers
// ============================================================================

/** Transform labels + datasets → Recharts row objects */
function toRows(data: ChartData) {
  return data.labels.map((label, i) => {
    const row: Record<string, string | number> = { name: label };
    for (const ds of data.datasets) {
      row[ds.label] = ds.values[i] ?? 0;
    }
    return row;
  });
}

function fmtValue(v: number, data: ChartData) {
  if (data.currency) return formatCurrency(v);
  return `${formatNumber(v, v % 1 === 0 ? 0 : 1)}${data.unit ? " " + data.unit : ""}`;
}

function fmtTick(v: number) {
  return formatNumber(v, v < 10 ? 1 : 0);
}

// ============================================================================
// Shared axis/grid props
// ============================================================================

const TICK_X = { fontSize: 11, fill: "var(--text-secondary)", fontFamily: fonts.sans };
const TICK_Y = { fontSize: 10, fill: "var(--text-faint)", fontFamily: fonts.mono };
const GRID = { strokeDasharray: "3 3", stroke: "var(--border)" };
const CURSOR = { fill: "var(--bg-hover)", opacity: 0.5 };
const MARGIN = { top: 8, right: 16, left: 8, bottom: 4 };

// ============================================================================
// Empty Chart (no data)
// ============================================================================

function EmptyChart({ message }: { message: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      height: "100%", color: "var(--text-muted)", fontSize: 13, fontFamily: fonts.sans,
    }}>
      {message}
    </div>
  );
}

// ============================================================================
// Loading Skeleton
// ============================================================================

function LoadingSkeleton() {
  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="skeleton"
            style={{ height: i === 1 ? 32 : 20, width: i === 1 ? "40%" : `${60 + i * 8}%` }}
          />
        ))}
        <div style={{ marginTop: 8 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton" style={{ height: 36, marginBottom: 2 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Custom Tooltip (shared by all cartesian charts)
// ============================================================================

function ChartTooltip({ active, payload, label, data }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
  data: ChartData;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "var(--bg-elevated)", border: "1px solid var(--border)",
      borderRadius: 6, padding: "8px 12px", fontSize: 12,
      fontFamily: fonts.sans, boxShadow: "var(--shadow-md)",
    }}>
      {label && <div style={{ color: "var(--text-muted)", marginBottom: 4, fontSize: 11 }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: p.color, flexShrink: 0 }} />
          <span style={{ color: "var(--text-secondary)" }}>{p.name}:</span>
          <span style={{ color: "var(--text-primary)", fontFamily: fonts.mono, fontWeight: 600 }}>
            {fmtValue(p.value, data)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Shared X/Y axis components
// ============================================================================

function SharedXAxis({ data, isVerticalLayout }: { data: ChartData; isVerticalLayout?: boolean }) {
  if (isVerticalLayout) {
    return (
      <XAxis type="number" tick={TICK_Y} axisLine={false} tickLine={false} tickFormatter={fmtTick}
        label={data.xAxisLabel ? { value: data.xAxisLabel, position: "insideBottom", offset: -2, fontSize: 10, fill: "var(--text-faint)" } : undefined}
      />
    );
  }
  return (
    <XAxis dataKey="name" tick={TICK_X} axisLine={{ stroke: "var(--border)" }} tickLine={false}
      label={data.xAxisLabel ? { value: data.xAxisLabel, position: "insideBottom", offset: -2, fontSize: 10, fill: "var(--text-faint)" } : undefined}
    />
  );
}

function SharedYAxis({ data, yAxisId, orientation }: { data: ChartData; yAxisId?: string; orientation?: "left" | "right" }) {
  return (
    <YAxis
      yAxisId={yAxisId} orientation={orientation}
      tick={TICK_Y} axisLine={false} tickLine={false} tickFormatter={fmtTick}
      label={data.yAxisLabel ? { value: data.yAxisLabel, angle: -90, position: "insideLeft", fontSize: 10, fill: "var(--text-faint)" } : undefined}
    />
  );
}

// ============================================================================
// Bar Charts (vertical, horizontal, stacked)
// ============================================================================

function VerticalBarChart({ data }: { data: ChartData }) {
  const rows = toRows(data);
  const stacked = data.type === "stacked-bar";

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={MARGIN} barCategoryGap="20%">
        <CartesianGrid {...GRID} vertical={false} />
        <SharedXAxis data={data} />
        <SharedYAxis data={data} />
        {data.showRightAxis && <SharedYAxis data={data} yAxisId="right" orientation="right" />}
        <Tooltip content={<ChartTooltip data={data} />} cursor={CURSOR} animationDuration={0} />
        {data.datasets.length > 1 && <Legend wrapperStyle={{ fontSize: 11, fontFamily: fonts.sans }} />}
        {data.datasets.map((ds, i) => (
          <Bar
            key={ds.label}
            dataKey={ds.label}
            fill={dsColor(ds, i)}
            radius={[3, 3, 0, 0]}
            opacity={0.85}
            maxBarSize={56}
            stackId={stacked ? (ds.stack ?? "default") : undefined}
            yAxisId={ds.yAxisId}
            animationDuration={0}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function HorizontalBarChart({ data }: { data: ChartData }) {
  const rows = toRows(data);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} layout="vertical" margin={{ ...MARGIN, left: 8 }}>
        <CartesianGrid {...GRID} horizontal={false} />
        <SharedXAxis data={data} isVerticalLayout />
        <YAxis type="category" dataKey="name" width={120} tick={TICK_X} axisLine={false} tickLine={false} />
        <Tooltip content={<ChartTooltip data={data} />} cursor={CURSOR} animationDuration={0} />
        {data.datasets.map((ds, i) => (
          <Bar key={ds.label} dataKey={ds.label} fill={dsColor(ds, i)} radius={[0, 3, 3, 0]} opacity={0.85} animationDuration={0} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

// ============================================================================
// Line Chart
// ============================================================================

function LineChartView({ data }: { data: ChartData }) {
  const rows = toRows(data);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={rows} margin={MARGIN}>
        <CartesianGrid {...GRID} />
        <SharedXAxis data={data} />
        <SharedYAxis data={data} />
        {data.showRightAxis && <SharedYAxis data={data} yAxisId="right" orientation="right" />}
        <Tooltip content={<ChartTooltip data={data} />} animationDuration={0} />
        {data.datasets.length > 1 && <Legend wrapperStyle={{ fontSize: 11, fontFamily: fonts.sans }} />}
        {data.datasets.map((ds, i) => (
          <Line
            key={ds.label}
            type="monotone"
            dataKey={ds.label}
            stroke={dsColor(ds, i)}
            strokeWidth={2}
            strokeDasharray={ds.strokeStyle === "dashed" ? "6 3" : undefined}
            dot={ds.showDots !== false ? { r: 3, fill: dsColor(ds, i) } : false}
            activeDot={{ r: 5 }}
            yAxisId={ds.yAxisId}
            animationDuration={0}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ============================================================================
// Area Chart
// ============================================================================

function AreaChartView({ data }: { data: ChartData }) {
  const rows = toRows(data);
  const stacked = data.type === "stacked-area";

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={rows} margin={MARGIN}>
        <defs>
          {data.datasets.map((ds, i) => (
            <linearGradient key={ds.label} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={dsColor(ds, i)} stopOpacity={0.3} />
              <stop offset="95%" stopColor={dsColor(ds, i)} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid {...GRID} />
        <SharedXAxis data={data} />
        <SharedYAxis data={data} />
        <Tooltip content={<ChartTooltip data={data} />} animationDuration={0} />
        {data.datasets.length > 1 && <Legend wrapperStyle={{ fontSize: 11, fontFamily: fonts.sans }} />}
        {data.datasets.map((ds, i) => (
          <Area
            key={ds.label}
            type="monotone"
            dataKey={ds.label}
            stroke={dsColor(ds, i)}
            strokeWidth={2}
            fill={`url(#grad-${i})`}
            dot={ds.showDots ? { r: 3, fill: dsColor(ds, i) } : false}
            activeDot={{ r: 5 }}
            stackId={stacked ? (ds.stack ?? "default") : undefined}
            animationDuration={0}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ============================================================================
// Composed Chart (mix of bar + line + area per dataset)
// ============================================================================

function ComposedChartView({ data }: { data: ChartData }) {
  const rows = toRows(data);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={rows} margin={MARGIN}>
        <CartesianGrid {...GRID} />
        <SharedXAxis data={data} />
        <SharedYAxis data={data} />
        {data.showRightAxis && <SharedYAxis data={data} yAxisId="right" orientation="right" />}
        <Tooltip content={<ChartTooltip data={data} />} cursor={CURSOR} animationDuration={0} />
        {data.datasets.length > 1 && <Legend wrapperStyle={{ fontSize: 11, fontFamily: fonts.sans }} />}
        {data.datasets.map((ds, i) => {
          const color = dsColor(ds, i);
          const dsType = ds.type ?? "bar";
          if (dsType === "line") {
            return (
              <Line
                key={ds.label} type="monotone" dataKey={ds.label}
                stroke={color} strokeWidth={2}
                strokeDasharray={ds.strokeStyle === "dashed" ? "6 3" : undefined}
                dot={ds.showDots !== false ? { r: 3, fill: color } : false}
                yAxisId={ds.yAxisId}
                animationDuration={0}
              />
            );
          }
          if (dsType === "area") {
            return (
              <Area
                key={ds.label} type="monotone" dataKey={ds.label}
                stroke={color} fill={color} fillOpacity={0.15}
                yAxisId={ds.yAxisId}
                animationDuration={0}
              />
            );
          }
          return (
            <Bar
              key={ds.label} dataKey={ds.label} fill={color}
              radius={[3, 3, 0, 0]} opacity={0.85} maxBarSize={56}
              stackId={ds.stack} yAxisId={ds.yAxisId}
              animationDuration={0}
            />
          );
        })}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ============================================================================
// Pie / Donut
// ============================================================================

function PieDonutChart({ data, isDonut }: { data: ChartData; isDonut: boolean }) {
  const ds = data.datasets[0];
  if (!ds || ds.values.length === 0 || data.labels.length === 0) {
    return <EmptyChart message="No data for chart" />;
  }

  const total = ds.values.reduce((s, v) => s + v, 0);
  if (total === 0) return <EmptyChart message="All values are zero" />;

  const pieData = data.labels.map((label, i) => ({ name: label, value: ds.values[i] ?? 0 }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={pieData}
          cx="50%" cy="50%"
          innerRadius={isDonut ? 55 : 0}
          outerRadius={90}
          paddingAngle={isDonut ? 2 : 1}
          dataKey="value"
          label={({ name, percent }: { name: string; percent: number }) => `${name} ${(percent * 100).toFixed(0)}%`}
          labelLine={{ stroke: "var(--text-faint)", strokeWidth: 1 }}
          animationDuration={0}
        >
          {pieData.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} opacity={0.85} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number) => fmtValue(value, data)}
          animationDuration={0}
          contentStyle={{
            background: "var(--bg-elevated)", border: "1px solid var(--border)",
            borderRadius: 6, fontSize: 12, fontFamily: fonts.sans,
          }}
        />
        {isDonut && (
          <>
            <text x="50%" y="46%" textAnchor="middle" dominantBaseline="middle"
              fontSize={11} fill="var(--text-muted)" fontFamily={fonts.sans}>Total</text>
            <text x="50%" y="56%" textAnchor="middle" dominantBaseline="middle"
              fontSize={15} fill="var(--text-primary)" fontFamily={fonts.mono} fontWeight={700}>
              {data.currency ? formatCurrency(total) : formatNumber(total, 0)}
            </text>
          </>
        )}
      </PieChart>
    </ResponsiveContainer>
  );
}

// ============================================================================
// Radar Chart
// ============================================================================

function RadarChartView({ data }: { data: ChartData }) {
  const rows = toRows(data);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <RadarChart data={rows} cx="50%" cy="50%" outerRadius="70%">
        <PolarGrid stroke="var(--border)" />
        <PolarAngleAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--text-secondary)", fontFamily: fonts.sans }} />
        <PolarRadiusAxis tick={{ fontSize: 9, fill: "var(--text-faint)", fontFamily: fonts.mono }} />
        <Tooltip content={<ChartTooltip data={data} />} animationDuration={0} />
        {data.datasets.length > 1 && <Legend wrapperStyle={{ fontSize: 11, fontFamily: fonts.sans }} />}
        {data.datasets.map((ds, i) => (
          <Radar
            key={ds.label}
            name={ds.label}
            dataKey={ds.label}
            stroke={dsColor(ds, i)}
            fill={dsColor(ds, i)}
            fillOpacity={0.2}
            strokeWidth={2}
            animationDuration={0}
          />
        ))}
      </RadarChart>
    </ResponsiveContainer>
  );
}

// ============================================================================
// Scatter Chart
// ============================================================================

function ScatterChartView({ data }: { data: ChartData }) {
  const series = data.scatterData ?? [];
  if (!series.length) return null;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={MARGIN}>
        <CartesianGrid {...GRID} />
        <XAxis
          type="number" dataKey="x" name="x" tick={TICK_Y}
          label={data.xAxisLabel ? { value: data.xAxisLabel, position: "insideBottom", offset: -2, fontSize: 10, fill: "var(--text-faint)" } : undefined}
        />
        <YAxis
          type="number" dataKey="y" name="y" tick={TICK_Y}
          label={data.yAxisLabel ? { value: data.yAxisLabel, angle: -90, position: "insideLeft", fontSize: 10, fill: "var(--text-faint)" } : undefined}
        />
        <Tooltip
          animationDuration={0}
          contentStyle={{
            background: "var(--bg-elevated)", border: "1px solid var(--border)",
            borderRadius: 6, fontSize: 12, fontFamily: fonts.sans,
          }}
        />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11, fontFamily: fonts.sans }} />}
        {series.map((s, i) => (
          <Scatter key={s.label} name={s.label} data={s.points} fill={s.color ?? PALETTE[i % PALETTE.length]} opacity={0.75} animationDuration={0} />
        ))}
      </ScatterChart>
    </ResponsiveContainer>
  );
}

// ============================================================================
// Treemap
// ============================================================================

interface TreemapContentProps {
  x: number;
  y: number;
  width: number;
  height: number;
  name: string;
  value: number;
  index: number;
  colors: string[];
}

function TreemapContent(props: TreemapContentProps) {
  const { x, y, width, height, name, index, colors: treeColors } = props;
  if (width < 30 || height < 20) return null;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={treeColors[index % treeColors.length]} opacity={0.8} rx={3} stroke="var(--bg-root)" strokeWidth={2} />
      {width > 50 && height > 24 && (
        <text x={x + width / 2} y={y + height / 2 - 6} textAnchor="middle" fontSize={11} fill="#fff" fontFamily={fonts.sans}>
          {name.length > Math.floor(width / 8) ? name.slice(0, Math.floor(width / 8) - 1) + "…" : name}
        </text>
      )}
      {width > 50 && height > 38 && (
        <text x={x + width / 2} y={y + height / 2 + 10} textAnchor="middle" fontSize={10} fill="rgba(255,255,255,0.7)" fontFamily={fonts.mono}>
          {formatNumber(props.value, props.value < 10 ? 1 : 0)}
        </text>
      )}
    </g>
  );
}

function TreemapView({ data }: { data: ChartData }) {
  // Support two modes: treeData (hierarchical) or labels+datasets[0] (flat)
  let treeNodes: Array<{ name: string; value: number }>;
  if (data.treeData) {
    treeNodes = flattenTree(data.treeData);
  } else {
    const ds = data.datasets[0];
    if (!ds) return null;
    treeNodes = data.labels.map((label, i) => ({ name: label, value: ds.values[i] ?? 0 }));
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <Treemap
        data={treeNodes}
        dataKey="value"
        nameKey="name"
        content={<TreemapContent x={0} y={0} width={0} height={0} name="" value={0} index={0} colors={PALETTE} />}
      />
    </ResponsiveContainer>
  );
}

function flattenTree(nodes: TreeNode[]): Array<{ name: string; value: number }> {
  const result: Array<{ name: string; value: number }> = [];
  for (const n of nodes) {
    if (n.children?.length) {
      result.push(...flattenTree(n.children));
    } else if (n.value != null) {
      result.push({ name: n.name, value: n.value });
    }
  }
  return result;
}

// ============================================================================
// Dataset Legend (custom, for single-dataset charts)
// ============================================================================

function DatasetLegend({ datasets }: { datasets: Dataset[] }) {
  if (datasets.length <= 1) return null;
  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
      {datasets.map((ds, i) => (
        <div key={ds.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-secondary)" }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: dsColor(ds, i) }} />
          {ds.label}
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Chart Router
// ============================================================================

function ChartRouter({ data }: { data: ChartData }) {
  const type = data.type ?? "bar";
  switch (type) {
    case "bar":          return <VerticalBarChart data={data} />;
    case "stacked-bar":  return <VerticalBarChart data={data} />;
    case "horizontal-bar": return <HorizontalBarChart data={data} />;
    case "line":         return <LineChartView data={data} />;
    case "area":         return <AreaChartView data={data} />;
    case "stacked-area": return <AreaChartView data={data} />;
    case "composed":     return <ComposedChartView data={data} />;
    case "pie":          return <PieDonutChart data={data} isDonut={false} />;
    case "donut":        return <PieDonutChart data={data} isDonut />;
    case "radar":        return <RadarChartView data={data} />;
    case "scatter":      return <ScatterChartView data={data} />;
    case "treemap":      return <TreemapView data={data} />;
    default:             return <VerticalBarChart data={data} />;
  }
}

// ============================================================================
// Main Component
// ============================================================================

function ChartContent({ data }: { data: ChartData }) {
  // Header ~36px + title ~40px + padding ~24px = ~100px overhead
  const chartHeight = "calc(100vh - 100px)";

  return (
    <div style={{ fontFamily: fonts.sans, background: "var(--bg-root)", height: "100vh", overflow: "hidden" }}>
      <ErpNextBrandHeader />
      <div style={{ padding: "8px 16px 0" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>{data.title}</div>
        {data.subtitle && <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>{data.subtitle}</div>}
      </div>
      <div style={{ height: chartHeight, padding: "4px 8px 8px" }}>
        <ChartRouter data={data} />
      </div>
    </div>
  );
}

export function ChartViewer() {
  const [data, setData] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    app.connect().catch(() => {});

    app.ontoolresult = (result: { content?: Array<{ type: string; text?: string }> }) => {
      setLoading(false);
      const text = result.content?.find((c) => c.type === "text")?.text;
      if (text) {
        try { setData(JSON.parse(text)); } catch (e) { console.error("Parse error:", e); }
      }
    };

    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  if (loading) return <LoadingSkeleton />;

  if (!data) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontSize: 13, fontFamily: fonts.sans }}>
        No chart data — run an analytics tool or PML workflow that returns ChartData
      </div>
    );
  }

  return <ChartContent data={data} />;
}
