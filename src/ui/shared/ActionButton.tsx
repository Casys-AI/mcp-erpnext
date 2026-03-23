/** Button with optional confirm (double-click) pattern for destructive actions */

import { useState, useEffect, useRef } from "react";
import { colors, styles } from "./theme";

const VARIANT_COLORS: Record<string, { color: string; bg: string }> = {
  success: { color: colors.success, bg: colors.successDim },
  error: { color: colors.error, bg: colors.errorDim },
  info: { color: colors.info, bg: colors.infoDim },
  default: { color: colors.text.secondary, bg: colors.bg.elevated },
};

export function ActionButton({ label, variant = "default", disabled, loading, confirm, onClick }: {
  label: string;
  variant?: "success" | "error" | "info" | "default";
  disabled?: boolean;
  loading?: boolean;
  confirm?: boolean;
  onClick: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const vc = VARIANT_COLORS[variant] ?? VARIANT_COLORS.default;

  return (
    <button
      onClick={() => {
        if (confirm && !confirming) {
          setConfirming(true);
          clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => setConfirming(false), 4000);
          return;
        }
        setConfirming(false);
        onClick();
      }}
      disabled={disabled || loading}
      style={{
        ...styles.button,
        background: vc.bg,
        color: vc.color,
        borderColor: vc.color,
        opacity: disabled || loading ? 0.5 : 1,
        fontSize: 11,
        padding: "4px 10px",
      }}
    >
      {loading ? "…" : confirming ? "Confirm?" : label}
    </button>
  );
}
