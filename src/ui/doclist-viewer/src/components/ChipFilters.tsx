/** @jsxImportSource preact */
/**
 * Barre de chips de filtre.
 *
 * La maquette ne montre aucun libellé de groupe : les chips d'une même colonne
 * s'alignent à plat, et un chip « all » ouvre la série en portant le total.
 */

import { Chip } from "~/shared/ui";
import { useT } from "~/shared/i18n-hook";

interface FilterableColumn {
  col: string;
  values: string[];
}

export function ChipFilters(
  { columns, chipFilters, counts, total, pill, onFilterChange }: {
    columns: FilterableColumn[];
    chipFilters: Record<string, string>;
    counts: Record<string, Record<string, number>>;
    total: number;
    /** En mobile les chips deviennent des pilules et la barre défile. */
    pill?: boolean;
    onFilterChange: (col: string, value: string | null) => void;
  },
) {
  const t = useT();
  if (columns.length === 0) return null;
  const active = columns.some(({ col }) => chipFilters[col]);
  const nbFiltres = columns.filter(({ col }) => chipFilters[col]).length;

  return (
    <div
      class={pill
        ? "drag-scroll fade-edge-r flex shrink-0 items-center gap-1.5 overflow-x-auto px-3 pb-2.5"
        : "flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line px-4 py-2.5"}
    >
      <Chip
        pill={pill}
        active={!active}
        onClick={() => {
          for (const { col } of columns) onFilterChange(col, null);
        }}
      >
        {t("doclist.chips.all", { n: total })}
      </Chip>
      {columns.map(({ col, values }) =>
        values.map((value) => {
          const selected = chipFilters[col] === value;
          return (
            <Chip
              key={`${col}:${value}`}
              pill={pill}
              active={selected}
              onClick={() => onFilterChange(col, selected ? null : value)}
            >
              {value} {counts[col]?.[value] ?? 0}
              {/* Le × signale la possibilité de retrait ; aria-hidden évite la répétition */}
              {selected && (
                <span aria-hidden="true" class="ml-1.5 text-accent-text">
                  ×
                </span>
              )}
            </Chip>
          );
        })
      )}
      {/* Résumé en mono à droite : « 2 filtres · 6 lignes » */}
      {active && !pill && (
        <span class="ml-auto shrink-0 font-mono text-chip text-ink-faint">
          {t("doclist.chips.filter_count", {
            n: nbFiltres,
            s: nbFiltres > 1 ? "s" : "",
          })} · {t("doclist.chips.row_count", {
            n: total,
            s: total > 1 ? "s" : "",
          })}
        </span>
      )}
    </div>
  );
}
