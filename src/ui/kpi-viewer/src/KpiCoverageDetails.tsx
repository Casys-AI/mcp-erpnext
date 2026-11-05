/** @jsxImportSource preact */
import type { ValuationCoverage } from "../../kpi-coverage.ts";
import { formatCurrency, formatInteger } from "../../shared/format.ts";
import { useT } from "../../shared/i18n-hook.ts";

export function KpiCoverageDetails(
  { coverage }: { coverage: ValuationCoverage },
) {
  const t = useT();
  return (
    <details class="min-w-0 border-t border-line pt-2 text-[12px] text-ink-muted">
      <summary class="cursor-pointer rounded-sm text-ink-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-edge">
        {t("kpi.coverage.details")} ({formatInteger(coverage.missingItemCount)})
      </summary>
      <div class="mt-2 flex min-w-0 flex-col gap-2">
        <dl class="m-0 grid min-w-0 grid-cols-[1fr_auto] gap-x-3 gap-y-1 tabular-nums">
          <dt>{t("kpi.coverage.costed_revenue")}</dt>
          <dd class="m-0 text-right">
            {formatCurrency(coverage.costedRevenue, coverage.currency)}
          </dd>
          <dt>{t("kpi.coverage.uncosted_revenue")}</dt>
          <dd class="m-0 text-right">
            {formatCurrency(coverage.uncostedRevenue, coverage.currency)}
          </dd>
        </dl>
        <p class="m-0 text-ink-faint">
          {t("kpi.coverage.excluded_lines", {
            count: formatInteger(coverage.uncostedLineCount),
          })}
          {" · "}
          {t("kpi.coverage.groups", {
            count: formatInteger(coverage.missingValuationCount),
          })}
        </p>
        <ul class="m-0 max-h-48 list-none overflow-y-auto p-0">
          {coverage.missingValuations.map((row) => (
            <li
              key={JSON.stringify([row.item_code, row.warehouse])}
              class="min-w-0 border-t border-line py-2"
            >
              <div class="break-words font-medium text-ink">
                {row.item_code}
              </div>
              <div class="break-words text-ink-faint">
                {row.warehouse} · {row.stock_uom}
              </div>
              <div class="tabular-nums">
                {formatCurrency(row.revenue, coverage.currency)} ·{" "}
                {t("kpi.coverage.lines", {
                  count: formatInteger(row.lineCount),
                })}
              </div>
            </li>
          ))}
        </ul>
        {coverage.omittedValuationCount > 0 && (
          <p class="m-0 text-ink-faint">
            {t("kpi.coverage.omitted", {
              count: formatInteger(coverage.omittedValuationCount),
            })}
          </p>
        )}
      </div>
    </details>
  );
}
