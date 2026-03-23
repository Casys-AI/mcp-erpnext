/** Empty state when no data is loaded */

import { colors } from "~/shared/theme";

export function DoclistEmptyState() {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: "48px 24px", color: colors.text.muted, gap: 16,
    }}>
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none" style={{ opacity: 0.35 }}>
        <rect x="8" y="8" width="40" height="40" rx="4" stroke="currentColor" strokeWidth="2" />
        <path d="M8 18h40" stroke="currentColor" strokeWidth="2" />
        <path d="M20 8v40M36 8v40" stroke="currentColor" strokeWidth="1" opacity="0.3" />
        <path d="M8 28h40M8 38h40" stroke="currentColor" strokeWidth="1" opacity="0.3" />
      </svg>
      <div style={{ fontSize: 13, textAlign: "center" }}>
        No documents to display
        <div style={{ fontSize: 11, color: colors.text.faint, marginTop: 4 }}>
          Query a DocType to see results in this table
        </div>
      </div>
    </div>
  );
}
