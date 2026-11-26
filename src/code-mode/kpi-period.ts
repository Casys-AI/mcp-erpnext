export const REVENUE_KPI = "erpnext_kpi_revenue";
export const GROSS_MARGIN_KPI = "erpnext_kpi_gross_margin";
export const KPI_VIEW = "ui://mcp-erpnext/kpi-viewer";
export const KPI_PERIOD_SELECTED = "kpi.period.selected";
export const KPI_PERIOD_APPLY = "kpi.period.apply";

export interface KpiPeriod {
  date_from: string;
  date_to: string;
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const day = new Date(value + "T00:00:00Z");
  return Number.isFinite(day.getTime()) &&
    day.toISOString().slice(0, 10) === value;
}

export function isKpiPeriod(value: unknown): value is KpiPeriod {
  return typeof value === "object" && value !== null &&
    Object.keys(value).length === 2 &&
    "date_from" in value && isCalendarDate(value.date_from) &&
    "date_to" in value && isCalendarDate(value.date_to) &&
    value.date_from <= value.date_to;
}
