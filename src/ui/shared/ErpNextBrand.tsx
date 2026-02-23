/**
 * ERPNext Brand Components
 *
 * Compact header bar and footer watermark to identify ERPNext viewers
 * at a glance alongside other MCP server UIs.
 */

import { CSSProperties } from "react";
import { colors, fonts } from "./theme";

// ============================================================================
// ERPNext Icon — 16×16 cube/grid SVG
// ============================================================================

function ErpNextIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      {/* Grid of 4 blocks evocative of ERP modules */}
      <rect x="1" y="1" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.9" />
      <rect x="9" y="1" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.6" />
      <rect x="1" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.6" />
      <rect x="9" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.35" />
    </svg>
  );
}

// ============================================================================
// Brand Header — 30px strip at the top of each viewer
// ============================================================================

export function ErpNextBrandHeader() {
  const headerStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 7,
    padding: "0 14px",
    height: 30,
    background: "#0070CC",
    borderBottom: "1px solid rgba(0,0,0,0.25)",
    flexShrink: 0,
  };

  const wordmarkStyle: CSSProperties = {
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    color: "rgba(255,255,255,0.92)",
  };

  const dotStyle: CSSProperties = {
    width: 3,
    height: 3,
    borderRadius: "50%",
    background: "rgba(255,255,255,0.35)",
    marginLeft: 2,
    marginRight: 2,
    flexShrink: 0,
  };

  const taglineStyle: CSSProperties = {
    fontFamily: fonts.sans,
    fontSize: 10,
    color: "rgba(255,255,255,0.5)",
    letterSpacing: "0.03em",
  };

  return (
    <div style={headerStyle}>
      <div style={{ color: "rgba(255,255,255,0.85)" }}>
        <ErpNextIcon />
      </div>
      <span style={wordmarkStyle}>ERPNext</span>
      <div style={dotStyle} />
      <span style={taglineStyle}>MCP</span>
    </div>
  );
}

// ============================================================================
// Brand Footer — subtle watermark at the bottom
// ============================================================================

export function ErpNextBrandFooter() {
  const footerStyle: CSSProperties = {
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
    padding: "6px 16px 8px",
    borderTop: `1px solid ${colors.borderSubtle}`,
    marginTop: 8,
  };

  const textStyle: CSSProperties = {
    fontFamily: fonts.sans,
    fontSize: 10,
    color: colors.text.faint,
    letterSpacing: "0.04em",
  };

  return (
    <div style={footerStyle}>
      <span style={textStyle}>ERPNext</span>
    </div>
  );
}
