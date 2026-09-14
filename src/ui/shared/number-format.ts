import { currentLocale } from "./host-locale.ts";

export function formatNumber(n: number, decimals = 2): string {
  return n.toLocaleString(currentLocale(), {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatCurrency(n: number, currency = "USD"): string {
  return n.toLocaleString(currentLocale(), {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
