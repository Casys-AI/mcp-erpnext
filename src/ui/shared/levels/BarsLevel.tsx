/**
 * Un niveau « graphique » : des barres, sans bibliothèque.
 *
 * La maquette les dessine en divs — une colonne par période, un trait en
 * haut, la barre active en accent. Cliquer une barre pousse un niveau de
 * plus (une liste, cette fois). Le pied dit ce que la barre active vaut.
 */

import { formatNumber } from "../format";

export function BarsLevel(
  { labels, values, activeIndex, onBarClick, caption, unit, narrow }: {
    labels: string[];
    values: number[];
    activeIndex?: number;
    onBarClick?: (index: number) => void;
    /** Pied : « S30 · 412 unités — clic : un niveau de plus ». */
    caption?: string;
    unit?: string;
    narrow?: boolean;
  },
) {
  const max = Math.max(1, ...values);
  const active = activeIndex ?? values.indexOf(Math.max(...values));
  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <div class={narrow ? "px-3.5 pb-3 pt-4" : "px-4 pb-3 pt-[18px]"}>
        <div class="flex h-[132px] items-end gap-2">
          {values.map((value, index) => (
            <button
              key={index}
              type="button"
              disabled={!onBarClick}
              onClick={() => onBarClick?.(index)}
              aria-label={`${labels[index]} · ${formatNumber(value, 0)}${
                unit ? ` ${unit}` : ""
              }`}
              style={{ height: `${Math.round((value / max) * 100)}%` }}
              class={`flex-1 border-t-2 transition-colors disabled:cursor-default ${
                index === active
                  ? "border-accent bg-accent/18"
                  : "border-line-hover bg-count hover:bg-control"
              }`}
            />
          ))}
        </div>
        <div class="mt-2.5 flex gap-2 border-t border-line-soft pt-2">
          {labels.map((label, index) => (
            <span
              key={index}
              class={`flex-1 text-center font-mono text-[9.5px] ${
                index === active ? "text-accent" : "text-ink-faint"
              }`}
            >
              {label}
            </span>
          ))}
        </div>
      </div>
      {caption && (
        <div class="flex items-center gap-2 border-t border-line bg-sunken px-4 py-2.5">
          <span class="font-mono text-[11px] text-accent">
            {labels[active]} · {formatNumber(values[active] ?? 0, 0)}
            {unit ? ` ${unit}` : ""}
          </span>
          <span class="font-sans text-[11.5px] text-ink-dim">{caption}</span>
        </div>
      )}
    </div>
  );
}
