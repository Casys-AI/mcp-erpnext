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
  sparklineLabels: [
    "Jan 26",
    "Feb 26",
    "Mar 26",
    "Apr 26",
    "May 26",
    "Jun 26",
    "Jul 26",
    "Aug 26",
  ],
  _drillDown: "Show unpaid invoices for this period",
  _trendDrillDown: "Show revenue trend for the last 8 months",
};

/** Scalaires réels (analytics.ts) : `?fixture=overdue` / `?fixture=outstanding`. */
export const KPI_OVERDUE_FIXTURE: KpiData = {
  label: "Overdue Invoices",
  value: 3,
  formattedValue: "3 inv. / €2,300.50",
  secondary: { kind: "amount", value: 2300.5, currency: "EUR" },
  trend: "up",
  trendIsGood: false,
  color: "#f87171",
  _drillDown: "Show overdue invoices",
};

export const KPI_OUTSTANDING_FIXTURE: KpiData = {
  label: "Outstanding Receivables",
  value: 2300.5,
  currency: "EUR",
  formattedValue: "3 inv. / €2,300.50",
  secondary: { kind: "invoice_count", value: 3 },
  trend: "up",
  trendIsGood: false,
  color: "#fbbf24",
  _drillDown: "Show outstanding invoices",
};

export function kpiFixtureFromSearch(): KpiData {
  if (typeof window === "undefined") return KPI_FIXTURE;
  switch (new URLSearchParams(globalThis.location.search).get("fixture")) {
    case "overdue":
      return KPI_OVERDUE_FIXTURE;
    case "outstanding":
      return KPI_OUTSTANDING_FIXTURE;
    default:
      return KPI_FIXTURE;
  }
}

export function isFixtureMode(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(globalThis.location.search).has("fixture");
}
