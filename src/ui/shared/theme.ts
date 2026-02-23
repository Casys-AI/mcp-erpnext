/**
 * ERPNext UI Theme — CSS-in-JS style objects using CSS custom properties
 *
 * All colors reference CSS variables defined in global.css,
 * which automatically switch between light and dark mode
 * via @media (prefers-color-scheme).
 *
 * For inline styles (CSSProperties), use `cssVar()` helper.
 */

import { CSSProperties } from "react";

/** Read a CSS custom property at runtime */
function cssVar(name: string): string {
  return `var(${name})`;
}

export const colors = {
  bg: {
    root: cssVar("--bg-root"),
    surface: cssVar("--bg-surface"),
    elevated: cssVar("--bg-elevated"),
    hover: cssVar("--bg-hover"),
    active: cssVar("--bg-active"),
  },
  text: {
    primary: cssVar("--text-primary"),
    secondary: cssVar("--text-secondary"),
    muted: cssVar("--text-muted"),
    faint: cssVar("--text-faint"),
  },
  accent: cssVar("--accent"),
  accentDim: cssVar("--accent-dim"),
  border: cssVar("--border"),
  borderSubtle: cssVar("--border-subtle"),
  success: cssVar("--success"),
  successDim: cssVar("--success-dim"),
  error: cssVar("--error"),
  errorDim: cssVar("--error-dim"),
  warning: cssVar("--warning"),
  warningDim: cssVar("--warning-dim"),
  info: cssVar("--info"),
  infoDim: cssVar("--info-dim"),
} as const;

export const fonts = {
  sans: cssVar("--font-sans"),
  mono: cssVar("--font-mono"),
} as const;

// Reusable style fragments
export const styles = {
  card: {
    background: colors.bg.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: "8px",
    padding: "16px",
  } as CSSProperties,

  badge: (color: string, bg: string): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    padding: "2px 8px",
    fontSize: "11px",
    fontWeight: 600,
    borderRadius: "4px",
    color,
    background: bg,
    letterSpacing: "0.02em",
  }),

  input: {
    background: colors.bg.elevated,
    border: `1px solid ${colors.border}`,
    borderRadius: "6px",
    padding: "6px 12px",
    fontSize: "13px",
    color: colors.text.primary,
    outline: "none",
    transition: "border-color 0.15s",
    width: "100%",
    fontFamily: fonts.sans,
  } as CSSProperties,

  button: {
    background: colors.bg.elevated,
    border: `1px solid ${colors.border}`,
    borderRadius: "6px",
    padding: "6px 14px",
    fontSize: "12px",
    color: colors.text.secondary,
    cursor: "pointer",
    transition: "all 0.15s",
    fontFamily: fonts.sans,
    whiteSpace: "nowrap" as const,
  } as CSSProperties,

  buttonActive: {
    background: colors.accentDim,
    borderColor: colors.accent,
    color: colors.accent,
  } as CSSProperties,

  tableHeader: {
    padding: "8px 12px",
    textAlign: "left" as const,
    fontSize: "11px",
    fontWeight: 600,
    color: colors.text.muted,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    borderBottom: `1px solid ${colors.border}`,
    cursor: "pointer",
    userSelect: "none" as const,
    whiteSpace: "nowrap" as const,
    transition: "color 0.15s",
  } as CSSProperties,

  tableCell: {
    padding: "8px 12px",
    fontSize: "13px",
    borderBottom: `1px solid ${colors.borderSubtle}`,
    color: colors.text.primary,
  } as CSSProperties,

  mono: {
    fontFamily: fonts.mono,
    fontSize: "12px",
  } as CSSProperties,
} as const;

/** Format a number with locale separators */
export function formatNumber(n: number, decimals = 2): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Format currency */
export function formatCurrency(n: number, currency = "USD"): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
