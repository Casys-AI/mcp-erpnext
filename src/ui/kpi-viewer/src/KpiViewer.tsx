/**
 * KPI Viewer — Single metric card for ERPNext KPI tools
 *
 * Renders one KPI metric card with:
 * - Big number (formatted as currency or plain)
 * - Delta badge (green/red with arrow)
 * - Optional sparkline (SVG polyline, no libraries)
 *
 * Data shape: KpiData (see interface below)
 * Protocol: MCP Apps ext-apps SDK
 *
 * @module lib/erpnext/ui/kpi-viewer
 */

import { useState, useEffect } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { fonts, formatNumber, formatCurrency } from "~/shared/theme";
import { ErpNextBrandHeader } from "~/shared/ErpNextBrand";

// ============================================================================
// MCP App
// ============================================================================

const app = new App({ name: "KPI Viewer", version: "1.0.0" });

// ============================================================================
// Types
// ============================================================================

interface KpiData {
  label: string;
  value: number;
  formattedValue?: string;
  unit?: string;
  currency?: string;
  delta?: number;
  deltaLabel?: string;
  trend?: "up" | "down" | "flat";
  trendIsGood?: boolean;
  sparkline?: number[];
  color?: string;
  icon?: string;
}

// ============================================================================
// Sparkline — pure SVG polyline
// ============================================================================

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;

  const width = 60;
  const height = 24;
  const padding = 2;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data
    .map((v, i) => {
      const x = padding + (i / (data.length - 1)) * (width - padding * 2);
      const y = padding + (1 - (v - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ flexShrink: 0 }}
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ============================================================================
// Delta Badge
// ============================================================================

function DeltaBadge({ delta, deltaLabel, trend, trendIsGood }: {
  delta: number;
  deltaLabel?: string;
  trend?: "up" | "down" | "flat";
  trendIsGood?: boolean;
}) {
  const direction = trend ?? (delta > 0 ? "up" : delta < 0 ? "down" : "flat");
  const arrow = direction === "up" ? "\u25B2" : direction === "down" ? "\u25BC" : "\u25C6";

  // Determine color: good = green, bad = red, flat = muted
  let badgeColor: string;
  let badgeBg: string;
  if (direction === "flat") {
    badgeColor = "var(--text-muted)";
    badgeBg = "var(--bg-hover)";
  } else if (trendIsGood === undefined) {
    // No opinion on good/bad — use neutral accent
    badgeColor = "var(--info)";
    badgeBg = "var(--info-dim)";
  } else {
    const isPositiveDirection = direction === "up";
    const isGood = trendIsGood ? isPositiveDirection : !isPositiveDirection;
    badgeColor = isGood ? "var(--success)" : "var(--error)";
    badgeBg = isGood ? "var(--success-dim)" : "var(--error-dim)";
  }

  const sign = delta > 0 ? "+" : "";
  const formatted = `${sign}${formatNumber(Math.abs(delta), Math.abs(delta) < 10 ? 1 : 0)}`;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        fontSize: 11,
        fontWeight: 600,
        fontFamily: fonts.mono,
        borderRadius: 4,
        color: badgeColor,
        background: badgeBg,
        letterSpacing: "0.02em",
      }}
    >
      <span style={{ fontSize: 8 }}>{arrow}</span>
      {formatted}%
      {deltaLabel && (
        <span style={{ fontWeight: 400, fontFamily: fonts.sans, opacity: 0.75, marginLeft: 2 }}>
          {deltaLabel}
        </span>
      )}
    </span>
  );
}

// ============================================================================
// Loading Skeleton
// ============================================================================

function LoadingSkeleton() {
  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="skeleton" style={{ height: 12, width: "35%" }} />
        <div className="skeleton" style={{ height: 36, width: "55%" }} />
        <div className="skeleton" style={{ height: 16, width: "40%" }} />
      </div>
    </div>
  );
}

// ============================================================================
// KPI Card Content
// ============================================================================

function KpiContent({ data }: { data: KpiData }) {
  const accentColor = data.color ?? "var(--accent)";

  // Format the main value
  let displayValue: string;
  if (data.formattedValue) {
    displayValue = data.formattedValue;
  } else if (data.currency) {
    displayValue = formatCurrency(data.value, data.currency);
  } else if (data.unit === "%") {
    displayValue = `${formatNumber(data.value, data.value % 1 === 0 ? 0 : 1)}%`;
  } else {
    const decimals = data.value % 1 === 0 ? 0 : 2;
    displayValue = formatNumber(data.value, decimals);
    if (data.unit) displayValue += ` ${data.unit}`;
  }

  // Sparkline color: use real hex because CSS vars don't work in SVG stroke
  // Map common accent colors or fall back to a default
  const sparklineColor = data.color ?? "#60a5fa";

  return (
    <div
      style={{
        fontFamily: fonts.sans,
        background: "var(--bg-root)",
        overflow: "hidden",
      }}
    >
      <ErpNextBrandHeader />

      <div style={{ padding: "12px 16px 14px" }}>
        {/* Layout: text left, sparkline right */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          {/* Left side: label + value + delta */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Label */}
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--text-muted)",
                marginBottom: 6,
              }}
            >
              {data.label}
            </div>

            {/* Big number */}
            <div
              style={{
                fontSize: 32,
                fontWeight: 700,
                fontFamily: fonts.mono,
                color: accentColor,
                lineHeight: 1.1,
                marginBottom: 8,
              }}
            >
              {displayValue}
            </div>

            {/* Delta badge */}
            {data.delta !== undefined && (
              <DeltaBadge
                delta={data.delta}
                deltaLabel={data.deltaLabel}
                trend={data.trend}
                trendIsGood={data.trendIsGood}
              />
            )}
          </div>

          {/* Right side: sparkline */}
          {data.sparkline && data.sparkline.length >= 2 && (
            <div style={{ paddingTop: 20, paddingLeft: 12 }}>
              <Sparkline data={data.sparkline} color={sparklineColor} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function KpiViewer() {
  const [data, setData] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    app.connect().catch(() => {});

    app.ontoolresult = (result: { content?: Array<{ type: string; text?: string }> }) => {
      setLoading(false);
      const text = result.content?.find((c) => c.type === "text")?.text;
      if (text) {
        try {
          setData(JSON.parse(text));
        } catch (e) {
          console.error("Parse error:", e);
        }
      }
    };

    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  if (loading) return <LoadingSkeleton />;

  if (!data) {
    return (
      <div
        style={{
          padding: 32,
          textAlign: "center",
          color: "var(--text-muted)",
          fontSize: 13,
          fontFamily: fonts.sans,
        }}
      >
        No KPI data — run an analytics KPI tool
      </div>
    );
  }

  return <KpiContent data={data} />;
}
