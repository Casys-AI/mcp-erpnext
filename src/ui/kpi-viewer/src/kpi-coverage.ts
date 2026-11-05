import type { ValuationCoverage } from "../../kpi-coverage.ts";
import { formatNumber } from "../../shared/format.ts";
import type { KpiData } from "./types.ts";
import type { KpiTranslate } from "./kpi-format.ts";

export function hasValuationCoverage(
  data: Pick<KpiData, "secondary">,
): boolean {
  return data.secondary?.kind === "valuation_coverage";
}

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const count = (value: unknown): value is number =>
  finite(value) && Number.isSafeInteger(value) && value >= 0;
const text = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

export function valuationCoverage(
  data: Pick<KpiData, "secondary">,
): ValuationCoverage | undefined {
  const coverage = data.secondary;
  if (coverage?.kind !== "valuation_coverage") return undefined;
  if (
    !finite(coverage.value) || coverage.value < 0 || coverage.value > 100 ||
    !finite(coverage.costedRevenue) || coverage.costedRevenue <= 0 ||
    !finite(coverage.uncostedRevenue) || coverage.uncostedRevenue < 0 ||
    !text(coverage.currency) ||
    !count(coverage.costedLineCount) || coverage.costedLineCount === 0 ||
    !count(coverage.uncostedLineCount) || coverage.uncostedLineCount === 0 ||
    !count(coverage.missingValuationCount) ||
    coverage.missingValuationCount === 0 ||
    !count(coverage.missingItemCount) || coverage.missingItemCount === 0 ||
    coverage.missingItemCount > coverage.missingValuationCount ||
    coverage.missingValuationCount > coverage.uncostedLineCount ||
    !count(coverage.omittedValuationCount) ||
    !Array.isArray(coverage.missingValuations) ||
    coverage.missingValuations.length === 0 ||
    coverage.missingValuations.length > 20 ||
    coverage.missingValuations.length + coverage.omittedValuationCount !==
      coverage.missingValuationCount
  ) return undefined;
  const total = coverage.costedRevenue + coverage.uncostedRevenue;
  if (
    !Number.isFinite(total) ||
    Math.abs(coverage.value - coverage.costedRevenue / total * 100) > 0.0001
  ) return undefined;
  let shownRevenue = 0;
  let shownLines = 0;
  const identities = new Set<string>();
  for (const row of coverage.missingValuations) {
    if (
      !row || !text(row.item_code) || !text(row.warehouse) ||
      !text(row.stock_uom) || !finite(row.revenue) || row.revenue < 0 ||
      !count(row.lineCount) || row.lineCount === 0
    ) return undefined;
    const identity = JSON.stringify([row.item_code, row.warehouse]);
    if (identities.has(identity)) return undefined;
    identities.add(identity);
    shownRevenue += row.revenue;
    shownLines += row.lineCount;
  }
  const tolerance = Math.max(1, coverage.uncostedRevenue) * 1e-9;
  if (
    shownRevenue > coverage.uncostedRevenue + tolerance ||
    shownLines + coverage.omittedValuationCount > coverage.uncostedLineCount ||
    (coverage.omittedValuationCount === 0 &&
      (Math.abs(shownRevenue - coverage.uncostedRevenue) > tolerance ||
        shownLines !== coverage.uncostedLineCount ||
        new Set(coverage.missingValuations.map((row) => row.item_code)).size !==
          coverage.missingItemCount))
  ) return undefined;
  return coverage;
}

function percent(value: number): string {
  if (value > 0 && value < 0.1) return `<${formatNumber(0.1, 1)}`;
  if (value > 99.9 && value < 100) return `>${formatNumber(99.9, 1)}`;
  return formatNumber(value, value % 1 === 0 ? 0 : 1);
}

export function valuationCoverageText(
  coverage: ValuationCoverage,
  t: KpiTranslate,
): string {
  const gap = coverage.uncostedRevenue > 0;
  const uncovered = coverage.uncostedRevenue /
    (coverage.costedRevenue + coverage.uncostedRevenue) * 100;
  const summary = t("kpi.coverage.summary", {
    covered: gap && coverage.value > 99.9
      ? `>${formatNumber(99.9, 1)}`
      : percent(coverage.value),
    uncovered: gap && uncovered < 0.1
      ? `<${formatNumber(0.1, 1)}`
      : percent(uncovered),
  });
  return coverage.uncostedRevenue === 0
    ? `${summary} · ${
      t("kpi.coverage.excluded_lines", {
        count: formatNumber(coverage.uncostedLineCount, 0),
      })
    }`
    : summary;
}
