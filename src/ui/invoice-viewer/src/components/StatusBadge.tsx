/** Invoice status badge */

import { useT } from "~/shared/i18n-hook";
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

const STATUS_KEYS: Record<string, string> = {
  Paid: "stable.invoice.status.paid",
  Submitted: "stable.invoice.status.submitted",
  Draft: "stable.invoice.status.draft",
  Cancelled: "stable.invoice.status.cancelled",
  Overdue: "stable.invoice.status.overdue",
  Unpaid: "stable.invoice.status.unpaid",
  "Partly Paid": "stable.invoice.status.partly_paid",
  Return: "stable.invoice.status.return",
};

export function StatusBadge({ status }: { status: string }) {
  const t = useT();
  const scheme = STATUS_COLORS[status] ??
    { color: colors.text.secondary, bg: colors.bg.elevated };
  const key = Object.hasOwn(STATUS_KEYS, status)
    ? STATUS_KEYS[status]
    : undefined;
  return (
    <span dir="auto" style={styles.badge(scheme.color, scheme.bg)}>
      {key ? t(key) : status}
    </span>
  );
}

export function getStatusScheme(status: string) {
  return STATUS_COLORS[status];
}
