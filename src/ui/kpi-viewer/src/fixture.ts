import type { KpiData } from "./types.ts";

/** Mock payload so the bundled HTML can be opened without a host. */
export const KPI_FIXTURE: KpiData = {
  label: "Revenue MTD",
  value: 21653,
  currency: "EUR",
  delta: 2.83,
  deltaValue: 5655,
  deltaLabel: "le mois dernier",
  trend: "up",
  trendIsGood: true,
  sparkline: [12_400, 13_100, 12_800, 14_200, 15_600, 18_400, 19_100, 21_653],
  _drillDown: "Show unpaid invoices for this period",
  _trendDrillDown: "Show revenue trend for the last 8 weeks",
  // Littéral de KPI_JUMPS["erpnext_kpi_revenue"]({ from: "2026-08-01", to: "2026-08-31" })
  // En mode fixture les sauts sont désactivés (jumpsEnabled=false).
  _jumps: {
    number: {
      label: "Sales orders this month",
      tool: "erpnext_sales_order_list",
      args: { date_from: "2026-08-01", date_to: "2026-08-31", limit: 20 },
      kind: "list" as const,
    },
    trend: {
      label: "Revenue trend",
      tool: "erpnext_revenue_trend",
      args: { months: 12 },
      kind: "chart" as const,
    },
  },
};

export function isFixtureMode(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(globalThis.location.search).has("fixture");
}
