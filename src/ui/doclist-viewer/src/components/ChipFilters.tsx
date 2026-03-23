/** Chip-based column filters (status, category, etc.) */

import { Fragment } from "react";
import { colors, styles } from "~/shared/theme";
import { DOC_STATUS } from "./StatusCell";

interface FilterableColumn {
  col: string;
  values: string[];
}

function isStatusField(key: string): boolean {
  return ["status", "docstatus", "workflow_state"].includes(key.toLowerCase());
}

export function ChipFilters({ columns, chipFilters, onFilterChange }: {
  columns: FilterableColumn[];
  chipFilters: Record<string, string>;
  onFilterChange: (col: string, value: string | null) => void;
}) {
  if (columns.length === 0) return null;

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
      {columns.map(({ col, values }) => (
        <Fragment key={col}>
          <span style={{ fontSize: 10, color: colors.text.faint, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>
            {col.replace(/_/g, " ")}
          </span>
          <button
            onClick={() => onFilterChange(col, null)}
            style={{
              ...styles.button,
              padding: "4px 10px",
              fontSize: 10,
              borderRadius: 8,
              border: "1px solid transparent",
              background: chipFilters[col] == null ? colors.accentDim : colors.bg.elevated,
              color: chipFilters[col] == null ? colors.accent : colors.text.secondary,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            All
          </button>
          {values.map(v => {
            const isActive = chipFilters[col] === v;
            const statusScheme = isStatusField(col) ? DOC_STATUS[v] : null;
            return (
              <button
                key={v}
                onClick={() => onFilterChange(col, v)}
                style={{
                  ...styles.button,
                  padding: "4px 10px",
                  fontSize: 10,
                  borderRadius: 8,
                  border: "1px solid transparent",
                  background: isActive ? statusScheme?.bg ?? colors.accentDim : colors.bg.elevated,
                  color: isActive ? statusScheme?.color ?? colors.accent : colors.text.secondary,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                {v}
              </button>
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}
