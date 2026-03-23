/** Key-value display for detail panels */

import { colors, fonts } from "./theme";

export function InfoField({ label, value, bold }: { label: string; value?: string; bold?: boolean }) {
  return (
    <div style={{ padding: "4px 0" }}>
      <div style={{ fontSize: 10, color: colors.text.muted, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>
        {label}
      </div>
      <div style={{
        fontSize: bold ? 15 : 13,
        fontWeight: bold ? 600 : 500,
        color: colors.text.primary,
        fontFamily: bold ? fonts.mono : fonts.sans,
      }}>
        {value ?? "—"}
      </div>
    </div>
  );
}
