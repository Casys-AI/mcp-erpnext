/**
 * Funnel Viewer — Sales funnel visualization
 *
 * Renders a trapezoid-shaped funnel from Lead through to Sales Order,
 * showing count, value, and conversion rates between stages.
 * Pure CSS shapes — no third-party chart libraries.
 *
 * @module lib/erpnext/src/ui/funnel-viewer
 */

import { useState, useEffect, useRef, CSSProperties } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { colors, fonts, styles, formatNumber, formatCurrency } from "~/shared/theme";
import { ErpNextBrandHeader } from "~/shared/ErpNextBrand";
import {
  canRequestUiRefresh,
  extractToolResultText,
  normalizeUiRefreshFailureMessage,
  resolveUiRefreshRequest,
  type ToolResultPayload,
  type UiRefreshRequestData,
} from "~/shared/refresh";

// ============================================================================
// MCP App
// ============================================================================

const app = new App({ name: "Funnel Viewer", version: "1.0.0" });
const FUNNEL_REFRESH_INTERVAL_MS = 15_000;
const TOOL_CALL_TIMEOUT_MS = 10_000;

// ============================================================================
// Types
// ============================================================================

interface FunnelStage {
  label: string;
  count: number;
  value?: number;
  color: string;
  conversionRate?: number;
  /** sendMessage text when clicking this stage (auto-injected by server) */
  _drillDown?: string;
}

interface FunnelData {
  title: string;
  subtitle?: string;
  stages: FunnelStage[];
  currency?: string;
  refreshRequest?: UiRefreshRequestData;
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

/** Clip-path polygons for progressive trapezoid narrowing */
const CLIP_PATHS = [
  "polygon(0% 0%, 100% 0%, 92% 100%, 8% 100%)",
  "polygon(8% 0%, 92% 0%, 82% 100%, 18% 100%)",
  "polygon(18% 0%, 82% 0%, 74% 100%, 26% 100%)",
  "polygon(26% 0%, 74% 0%, 74% 100%, 26% 100%)",
];

/** Darker shade for gradient bottom */
function darken(hex: string): string {
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - 40);
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - 40);
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - 40);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function FunnelStageBar({
  stage,
  stageIndex,
  currency,
  onClick,
}: {
  stage: FunnelStage;
  stageIndex: number;
  currency: string;
  onClick?: () => void;
}) {
  const isEmpty = stage.count === 0;
  const clipPath = CLIP_PATHS[Math.min(stageIndex, CLIP_PATHS.length - 1)];
  const bg = isEmpty
    ? "linear-gradient(180deg, #333 0%, #222 100%)"
    : `linear-gradient(180deg, ${stage.color} 0%, ${darken(stage.color)} 100%)`;

  return (
    <div
      style={{
        clipPath,
        background: bg,
        padding: "16px 20px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        minHeight: 56,
        cursor: onClick ? "pointer" : "default",
        transition: "transform 0.15s, box-shadow 0.15s",
        opacity: isEmpty ? 0.4 : 1,
        position: "relative",
      }}
      onClick={onClick}
      onMouseEnter={(e) => {
        if (!onClick || isEmpty) return;
        (e.currentTarget as HTMLElement).style.transform = "scale(1.02)";
        (e.currentTarget as HTMLElement).style.boxShadow = `0 0 20px ${stage.color}30`;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.transform = "scale(1)";
        (e.currentTarget as HTMLElement).style.boxShadow = "none";
      }}
      title={onClick ? `Click to see ${stage.label}` : undefined}
    >
      <span style={{
        fontSize: 24,
        fontWeight: 700,
        fontFamily: fonts.mono,
        color: "#fff",
        textShadow: "0 2px 4px rgba(0,0,0,0.3)",
        lineHeight: 1,
      }}>
        {formatNumber(stage.count, 0)}
      </span>
      <span style={{
        fontSize: 10,
        fontWeight: 700,
        color: "rgba(255,255,255,0.85)",
        textTransform: "uppercase",
        letterSpacing: "0.1em",
      }}>
        {stage.label}
      </span>
      {stage.value != null && stage.value > 0 && (
        <span style={{
          fontSize: 11,
          fontFamily: fonts.mono,
          color: "rgba(255,255,255,0.6)",
          marginTop: 2,
        }}>
          {formatCurrency(stage.value, currency)}
        </span>
      )}
    </div>
  );
}

// ============================================================================
// Conversion Rate Badge
// ============================================================================

function ConversionBadge({ rate, color }: { rate: number; color?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0, margin: "2px 0" }}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ opacity: 0.4 }}>
        <path d="M6 1v10M6 11l-3-3M6 11l3-3" stroke={color ?? colors.text.muted} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 10px",
        fontSize: 10,
        fontWeight: 700,
        fontFamily: fonts.mono,
        borderRadius: 10,
        background: colors.bg.elevated,
        color: color ?? colors.text.secondary,
        letterSpacing: "0.02em",
      }}>
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
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dataRef = useRef<FunnelData | null>(null);
  const refreshRequestRef = useRef<UiRefreshRequestData | null>(null);
  const refreshInFlightRef = useRef(false);
  const lastRefreshStartedAtRef = useRef(0);

  function hydrateData(nextData: FunnelData) {
    dataRef.current = nextData;
    refreshRequestRef.current = resolveUiRefreshRequest(nextData, refreshRequestRef.current);
    setData(nextData);
  }

  function consumeToolResult(result: ToolResultPayload): boolean {
    const text = extractToolResultText(result);
    if (!text) return false;

    try {
      const parsed = JSON.parse(text) as FunnelData;
      hydrateData(parsed);
      setError(null);
      setLoading(false);
      return true;
    } catch (cause) {
      console.error("Parse error:", cause);
      setError("Failed to parse funnel payload");
      setLoading(false);
      return false;
    }
  }

  async function requestRefresh(options: { ignoreInterval?: boolean } = {}) {
    const request = resolveUiRefreshRequest(dataRef.current, refreshRequestRef.current);
    if (!canRequestUiRefresh({
      request,
      visibilityState: typeof document === "undefined" ? "visible" : document.visibilityState,
      refreshInFlight: refreshInFlightRef.current,
      now: Date.now(),
      lastRefreshStartedAt: lastRefreshStartedAtRef.current,
      minIntervalMs: FUNNEL_REFRESH_INTERVAL_MS,
    }, options)) {
      return false;
    }

    if (!request || !app.getHostCapabilities()?.serverTools) {
      return false;
    }

    refreshInFlightRef.current = true;
    lastRefreshStartedAtRef.current = Date.now();
    setRefreshing(true);

    try {
      const result = await app.callServerTool({
        name: request.toolName,
        arguments: request.arguments,
      }, { timeout: TOOL_CALL_TIMEOUT_MS });

      if (result.isError) {
        setError("Refresh failed");
        return false;
      }

      if (!consumeToolResult(result)) {
        setError("Refresh returned no data");
        return false;
      }

      return true;
    } catch (cause) {
      setError(normalizeUiRefreshFailureMessage(cause));
      return false;
    } finally {
      refreshInFlightRef.current = false;
      setRefreshing(false);
    }
  }

  useEffect(() => {
    app.connect().catch(() => {});

    app.ontoolresult = (result: ToolResultPayload) => {
      consumeToolResult(result);
    };

    app.ontoolinputpartial = () => {
      if (!dataRef.current) {
        setLoading(true);
      }
    };
  }, []);

  useEffect(() => {
    function handleWindowFocus() {
      void requestRefresh({ ignoreInterval: true });
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void requestRefresh({ ignoreInterval: true });
      }
    }

    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }} aria-busy={refreshing}>
      <ErpNextBrandHeader />
      <div style={{ flex: 1 }}>
        {loading ? (
          <LoadingSkeleton />
        ) : !data ? (
          <FunnelEmptyState />
        ) : (
          <FunnelContent
            data={data}
            error={error}
            refreshing={refreshing}
            onRefresh={() => void requestRefresh({ ignoreInterval: true })}
          />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Funnel Content
// ============================================================================

function FunnelContent(
  { data, error, refreshing, onRefresh }: {
    data: FunnelData;
    error: string | null;
    refreshing: boolean;
    onRefresh: () => void;
  },
) {
  const currency = data.currency ?? "EUR";
  const stages = data.stages ?? [];
  const hasServerTools = app.getHostCapabilities()?.serverTools;

  // Default drill-down messages by stage label if not provided by server
  const STAGE_DRILL_DOWN: Record<string, string> = {
    "Leads": "Show all leads",
    "Lead": "Show all leads",
    "Opportunities": "Show all open opportunities",
    "Opportunity": "Show all open opportunities",
    "Quotations": "Show all quotations",
    "Quotation": "Show all quotations",
    "Sales Orders": "Show all sales orders",
    "Sales Order": "Show all sales orders",
    "Orders": "Show all sales orders",
  };

  function handleStageDrillDown(stage: FunnelStage) {
    const msg = stage._drillDown ?? STAGE_DRILL_DOWN[stage.label];
    if (!msg) return;
    app.sendMessage({ role: "user", content: [{ type: "text", text: msg }] }).catch(() => {});
  }

  if (stages.length === 0) {
    return <FunnelEmptyState />;
  }

  // Total conversion: first stage to last stage
  const firstCount = stages[0].count;
  const lastCount = stages[stages.length - 1].count;
  const totalConversion = firstCount > 0 ? Math.round((lastCount / firstCount) * 100) : 0;

  return (
    <div style={{ padding: 20, fontFamily: fonts.sans, maxWidth: 680, margin: "0 auto" }}>
      {/* Title */}
      <div style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: colors.text.primary }}>
            {data.title}
          </div>
          {data.subtitle && (
            <div style={{ fontSize: 12, color: colors.text.muted, marginTop: 2 }}>
              {data.subtitle}
            </div>
          )}
          <div
            aria-live="polite"
            style={{
              fontSize: 11,
              color: error ? colors.error : colors.text.faint,
              marginTop: 6,
            }}
          >
            {error ?? (refreshing ? "Refreshing…" : "Auto-refresh on focus")}
          </div>
        </div>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          style={styles.button}
          onMouseEnter={(e) => {
            if (!refreshing) {
              (e.currentTarget as HTMLElement).style.borderColor = colors.accent;
              (e.currentTarget as HTMLElement).style.color = colors.accent;
            }
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = colors.border;
            (e.currentTarget as HTMLElement).style.color = colors.text.secondary;
          }}
        >
          {refreshing ? "Refreshing" : "Refresh"}
        </button>
      </div>

      {/* Funnel stages */}
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {stages.map((stage, idx) => (
          <div key={stage.label}>
            <FunnelStageBar
              stage={stage}
              stageIndex={idx}
              currency={currency}
              onClick={hasServerTools ? () => handleStageDrillDown(stage) : undefined}
            />
            {/* Conversion badge between stages */}
            {idx < stages.length - 1 && stages[idx + 1].conversionRate != null && (
              <ConversionBadge rate={stages[idx + 1].conversionRate!} color={stages[idx + 1].color} />
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

      {/* Action buttons */}
      {hasServerTools && (
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12 }}>
          {stages.map((stage) => (
            <button
              key={stage.label}
              onClick={() => handleStageDrillDown(stage)}
              style={{
                ...styles.button,
                fontSize: 11,
                padding: "4px 12px",
                borderColor: stage.color + "40",
                color: colors.text.secondary,
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = stage.color;
                (e.currentTarget as HTMLElement).style.color = stage.color;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = stage.color + "40";
                (e.currentTarget as HTMLElement).style.color = colors.text.secondary;
              }}
            >
              {stage.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
