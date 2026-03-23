/** Pagination button */

import { colors, styles } from "~/shared/theme";

export function PagBtn(
  { label, disabled, onClick }: {
    label: string;
    disabled: boolean;
    onClick: () => void;
  },
) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...styles.button,
        padding: "4px 10px",
        fontSize: 11,
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "default" : "pointer",
      }}
      onMouseEnter={(e) => {
        if (!disabled) {(e.currentTarget as HTMLElement).style.borderColor =
            colors.accent;}
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = colors.border;
      }}
    >
      {label}
    </button>
  );
}
