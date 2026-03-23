/** Invoice status badge */

import { colors, styles } from "~/shared/theme";

const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  Paid: { color: colors.success, bg: colors.successDim },
  Submitted: { color: colors.info, bg: colors.infoDim },
  Draft: { color: colors.text.muted, bg: colors.bg.elevated },
  Cancelled: { color: colors.error, bg: colors.errorDim },
  Overdue: { color: colors.error, bg: colors.errorDim },
  Unpaid: { color: colors.warning, bg: colors.warningDim },
  "Partly Paid": { color: colors.warning, bg: colors.warningDim },
  "Return": { color: colors.text.muted, bg: colors.bg.elevated },
};

export function StatusBadge({ status }: { status: string }) {
  const scheme = STATUS_COLORS[status] ??
    { color: colors.text.secondary, bg: colors.bg.elevated };
  return <span style={styles.badge(scheme.color, scheme.bg)}>{status}</span>;
}

export function getStatusScheme(status: string) {
  return STATUS_COLORS[status];
}
