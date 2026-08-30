/** @jsxImportSource preact */
/**
 * Mobile inline expansion — réservé, projeté, taux sous la ligne principale.
 *
 * Affiché au tap en lieu et place du StockDetailPanel (qui reste réservé au
 * layout large). Trois colonnes en repeat(3, 1fr), séparées du corps de la
 * ligne par un border-top interne (--color-line-inner).
 *
 * ATTENTION : la maquette écrit #7d8a96 pour les sous-labels en mode sombre
 * (ligne 1271) — c'est une coquille. On utilise text-ink-faint (#5d6a74 dark /
 * #7b8892 light) comme le prescrit le guide spec.
 */
import { useT } from "~/shared/i18n-hook";
import { formatInteger, formatNumber } from "~/shared/format";
import { cx } from "~/shared/ui";
import type { StockEntry } from "../types.ts";

export function StockInlineExpand(
  { row, isDanger, onAsk, touch = false }: {
    row: StockEntry;
    isDanger: boolean;
    onAsk?: (message: string) => unknown;
    touch?: boolean;
  },
) {
  const t = useT();
  return (
    <div
      class={cx(
        "border-b border-b-line-soft border-l-2",
        isDanger ? "border-l-bad bg-row-selected" : "border-l-transparent",
      )}
      style={{ padding: "0 12px 11px" }}
    >
      {
        /*
         * The sub-grid sits inside the row wrapper. A flex-col on the outer div
         * and a grid on the inner one mirrors the maquette structure: the main
         * row content is in the parent StockViewer row div; this component only
         * renders the sub-grid.
         */
      }
      <div
        class="grid gap-2 border-t border-t-line-inner pt-[9px] mt-[9px]"
        style={{ gridTemplateColumns: "repeat(3, 1fr)" }}
      >
        <SubCell
          label={t("stock.col.reserved")}
          value={formatInteger(row.reserved_qty)}
        />
        <SubCell
          label={t("stock.col.projected")}
          value={formatInteger(row.projected_qty)}
        />
        <SubCell
          label={t("stock.col.rate")}
          value={formatNumber(row.valuation_rate, 2)}
        />
      </div>
      {onAsk && (
        <div class="mt-2.5 flex flex-wrap gap-1.5 border-t border-t-line-inner pt-2.5">
          {[
            {
              label: t("stock.detail.action.chart"),
              message: t("stock.nav.chart.message", {
                itemCode: row.item_code,
              }),
            },
            {
              label: t("stock.detail.action.item"),
              message: t("stock.nav.details.message", {
                itemCode: row.item_code,
              }),
            },
            {
              label: t("stock.detail.action.entries"),
              message: t("stock.nav.entries.message", {
                itemCode: row.item_code,
              }),
            },
          ].map((action) => (
            <button
              key={action.label}
              type="button"
              class={cx(
                "rounded-[3px] border border-line px-2 font-mono text-chip text-accent-text transition-colors hover:border-accent-edge hover:bg-accent/8 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
                touch ? "min-h-10 py-2" : "py-1",
              )}
              onClick={() => void onAsk(action.message)}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SubCell({ label, value }: { label: string; value: string }) {
  return (
    <div class="flex flex-col gap-0.5">
      <span class="font-mono text-nano uppercase text-ink-faint">
        {label}
      </span>
      <span class="font-mono text-data tabular-nums text-ink-2">
        {value}
      </span>
    </div>
  );
}
