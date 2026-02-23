/**
 * Funnel Viewer — Sales funnel visualization
 *
 * Renders a trapezoid-shaped funnel from Lead through to Sales Order,
 * showing count, value, and conversion rates between stages.
 * Pure CSS shapes — no third-party chart libraries.
 *
 * @module lib/erpnext/src/ui/funnel-viewer
 */

import { useState, useEffect, CSSProperties } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { colors, fonts, styles, formatNumber, formatCurrency } from "~/shared/theme";
import { ErpNextBrandHeader } from "~/shared/ErpNextBrand";

// ============================================================================
// MCP App
// ============================================================================

const app = new App({ name: "Funnel Viewer", version: "1.0.0" });

// ============================================================================
// Types
// ============================================================================

interface FunnelStage {
  label: string;
  count: number;
  value?: number;
  color: string;
  conversionRate?: number;
}

interface FunnelData {
  title: string;
  subtitle?: string;
  stages: FunnelStage[];
  currency?: string;
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
            style={{
              height: i === 1 ? 32 : 20,
              width: i === 1 ? "40%" : `${60 + i * 8}%`,
            }}
          />
        ))}
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          {[100, 82, 64, 46].map((w, i) => (
            <div
              key={i}
              className="skeleton"
              style={{ height: 56, width: `${w}%`, borderRadius: 6 }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Empty State
// ============================================================================

function FunnelEmptyState() {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: "48px 24px", color: colors.text.muted, gap: 16,
    }}>
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none" style={{ opacity: 0.35 }}>
        {/* Funnel shape */}
        <path
          d="M8 10 L48 10 L36 46 L20 46 Z"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
          strokeLinejoin="round"
        />
        <line x1="12" y1="19" x2="44" y2="19" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
        <line x1="16" y1="28" x2="40" y2="28" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
        <line x1="19" y1="37" x2="37" y2="37" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
      </svg>
      <div style={{ fontSize: 13, textAlign: "center" }}>
        No funnel data
        <div style={{ fontSize: 11, color: colors.text.faint, marginTop: 4 }}>
          Run the sales funnel tool to visualize your pipeline
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Funnel Stage Component
// ============================================================================

function FunnelStageBar({
  stage,
  widthPercent,
  currency,
}: {
  stage: FunnelStage;
  widthPercent: number;
  currency: string;
}) {
  const barStyle: CSSProperties = {
    width: `${widthPercent}%`,
    margin: "0 auto",
    padding: "12px 16px",
    borderRadius: 6,
    background: stage.color,
    opacity: 0.85,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    minHeight: 48,
    position: "relative",
  };

  const labelStyle: CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    color: "#fff",
    textShadow: "0 1px 2px rgba(0,0,0,0.3)",
    whiteSpace: "nowrap",
  };

  const countStyle: CSSProperties = {
    fontSize: 22,
    fontWeight: 700,
    fontFamily: fonts.mono,
    color: "#fff",
    textShadow: "0 1px 3px rgba(0,0,0,0.3)",
    lineHeight: 1,
  };

  const valueStyle: CSSProperties = {
    fontSize: 12,
    fontWeight: 500,
    color: "rgba(255,255,255,0.8)",
    fontFamily: fonts.mono,
    whiteSpace: "nowrap",
  };

  return (
    <div style={barStyle}>
      <span style={labelStyle}>{stage.label}</span>
      <span style={countStyle}>{formatNumber(stage.count, 0)}</span>
      {stage.value != null && stage.value > 0 && (
        <span style={valueStyle}>{formatCurrency(stage.value, currency)}</span>
      )}
    </div>
  );
}

// ============================================================================
// Conversion Rate Badge
// ============================================================================

function ConversionBadge({ rate }: { rate: number }) {
  const badgeStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "2px 10px",
    fontSize: 11,
    fontWeight: 600,
    fontFamily: fonts.mono,
    borderRadius: 10,
    background: colors.bg.elevated,
    border: `1px solid ${colors.border}`,
    color: colors.text.secondary,
    margin: "4px auto",
  };

  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      <span style={badgeStyle}>
        <span style={{ opacity: 0.5 }}>&#8595;</span>
        {rate}%
      </span>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function FunnelViewer() {
  const [data, setData] = useState<FunnelData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    app.connect().then(() => { appConnected = true; }).catch(() => {});

    app.ontoolresult = (result: { content?: Array<{ type: string; text?: string }> }) => {
      setLoading(false);
      const text = result.content?.find((c) => c.type === "text")?.text;
      if (text) {
        try { setData(JSON.parse(text)); } catch (e) { console.error("Parse error:", e); }
      }
    };

    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      <ErpNextBrandHeader />
      <div style={{ flex: 1, overflow: "auto" }}>
        {loading ? (
          <LoadingSkeleton />
        ) : !data ? (
          <FunnelEmptyState />
        ) : (
          <FunnelContent data={data} />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Funnel Content
// ============================================================================

function FunnelContent({ data }: { data: FunnelData }) {
  const currency = data.currency ?? "EUR";
  const stages = data.stages ?? [];

  if (stages.length === 0) {
    return <FunnelEmptyState />;
  }

  const maxCount = Math.max(...stages.map((s) => s.count), 1);

  // Compute width for each stage: ratio of count to max, with 30% minimum
  const stageWidths = stages.map((s) => {
    const ratio = s.count / maxCount;
    return Math.max(30, ratio * 100);
  });

  // Total conversion: first stage to last stage
  const firstCount = stages[0].count;
  const lastCount = stages[stages.length - 1].count;
  const totalConversion = firstCount > 0 ? Math.round((lastCount / firstCount) * 100) : 0;

  return (
    <div style={{ padding: 20, fontFamily: fonts.sans, maxWidth: 680, margin: "0 auto" }}>
      {/* Title */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: colors.text.primary }}>
          {data.title}
        </div>
        {data.subtitle && (
          <div style={{ fontSize: 12, color: colors.text.muted, marginTop: 2 }}>
            {data.subtitle}
          </div>
        )}
      </div>

      {/* Funnel stages */}
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {stages.map((stage, idx) => (
          <div key={stage.label}>
            <FunnelStageBar
              stage={stage}
              widthPercent={stageWidths[idx]}
              currency={currency}
            />
            {/* Conversion badge between stages */}
            {idx < stages.length - 1 && stages[idx + 1].conversionRate != null && (
              <ConversionBadge rate={stages[idx + 1].conversionRate!} />
            )}
          </div>
        ))}
      </div>

      {/* Footer: total conversion */}
      <div style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: 12,
        marginTop: 20,
        padding: "12px 16px",
        ...styles.card,
      }}>
        <span style={{ fontSize: 12, color: colors.text.muted }}>
          Overall Conversion
        </span>
        <span style={{
          fontSize: 11,
          color: colors.text.faint,
        }}>
          {stages[0].label} &#8594; {stages[stages.length - 1].label}
        </span>
        <span style={{
          fontSize: 18,
          fontWeight: 700,
          fontFamily: fonts.mono,
          color: totalConversion > 20 ? colors.success : totalConversion > 5 ? colors.warning : colors.error,
        }}>
          {totalConversion}%
        </span>
      </div>
    </div>
  );
}
