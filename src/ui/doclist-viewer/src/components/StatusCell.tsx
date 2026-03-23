/** Status badge for ERPNext document statuses */

import { colors, styles } from "~/shared/theme";

export const DOC_STATUS: Record<string, { color: string; bg: string }> = {
  Submitted: { color: colors.success, bg: colors.successDim },
  Completed: { color: colors.success, bg: colors.successDim },
  Paid: { color: colors.success, bg: colors.successDim },
  Active: { color: colors.success, bg: colors.successDim },
  Enabled: { color: colors.success, bg: colors.successDim },
  "To Deliver and Bill": { color: colors.info, bg: colors.infoDim },
  "To Bill": { color: colors.info, bg: colors.infoDim },
  "To Deliver": { color: colors.info, bg: colors.infoDim },
  Draft: { color: colors.text.muted, bg: colors.bg.elevated },
  Pending: { color: colors.warning, bg: colors.warningDim },
  Open: { color: colors.warning, bg: colors.warningDim },
  "Partly Paid": { color: colors.warning, bg: colors.warningDim },
  "Partly Delivered": { color: colors.warning, bg: colors.warningDim },
  Cancelled: { color: colors.error, bg: colors.errorDim },
  Overdue: { color: colors.error, bg: colors.errorDim },
  Closed: { color: colors.text.faint, bg: colors.bg.elevated },
  Disabled: { color: colors.text.faint, bg: colors.bg.elevated },
};

export function StatusCell({ value }: { value: string }) {
  const scheme = DOC_STATUS[value];
  if (!scheme) return <span>{value}</span>;
  return <span style={styles.badge(scheme.color, scheme.bg)}>{value}</span>;
}
