import type { FunnelData } from "./types.ts";

/** Mock payload so the bundled HTML can be opened without a host. */
export const FUNNEL_FIXTURE: FunnelData = {
  title: "Sales Funnel",
  subtitle: "This Quarter",
  currency: "EUR",
  stages: [
    {
      label: "Leads",
      count: 48,
      color: "#3ec1cf",
      _drillDown: "Show all leads",
    },
    {
      label: "Opportunities",
      count: 24,
      value: 186_000,
      color: "#35a6b4",
      conversionRate: 50,
      _drillDown: "Show all open opportunities",
    },
    {
      label: "Quotations",
      count: 11,
      value: 94_000,
      color: "#2f8996",
      conversionRate: 46,
      _drillDown: "Show all quotations",
    },
    {
      label: "Orders",
      count: 6,
      value: 48_500,
      color: "#b47ec9",
      conversionRate: 55,
      _drillDown: "Show all sales orders",
    },
  ],
};

export function isFixtureMode(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(globalThis.location.search).has("fixture");
}
