/**
 * ERPNext Brand Components
 *
 * Header bar and footer watermark for ERPNext MCP Apps viewers.
 * Casys design: surface background + accent text, consistent with mcp-einvoice.
 */

import { CSSProperties } from "react";
import { colors, fonts } from "./theme";

function ErpNextIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.9" />
      <rect x="9" y="1" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.6" />
      <rect x="1" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.6" />
      <rect x="9" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.35" />
    </svg>
  );
}

export function ErpNextBrandHeader() {
  const headerStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 7,
    padding: "0 14px",
    height: 30,
    background: colors.bg.surface,
    borderBottom: `1px solid ${colors.border}`,
    flexShrink: 0,
  };

  const wordmarkStyle: CSSProperties = {
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    color: colors.accent,
  };

  const dotStyle: CSSProperties = {
    width: 3,
    height: 3,
    borderRadius: "50%",
    background: colors.text.faint,
    marginLeft: 2,
    marginRight: 2,
    flexShrink: 0,
  };

  const taglineStyle: CSSProperties = {
    fontFamily: fonts.sans,
    fontSize: 10,
    color: colors.text.muted,
    letterSpacing: "0.03em",
  };

  return (
    <div style={headerStyle}>
      <div style={{ color: colors.accent }}>
        <ErpNextIcon />
      </div>
      <span style={wordmarkStyle}>ERPNext</span>
      <div style={dotStyle} />
      <span style={taglineStyle}>gestion ERP</span>
    </div>
  );
}

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
      <span style={textStyle}>Casys AI</span>
    </div>
  );
}
