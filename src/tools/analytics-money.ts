import type { FrappeFilter } from "../api/types.ts";
import { formatToolError, ToolInputError } from "./errors.ts";
import type { JSONSchema } from "./types.ts";

export interface MoneyScope {
  company?: string;
  currency?: string;
}

export function moneyScopeSchema(currencyDescription: string): JSONSchema {
  return {
    type: "object",
    properties: {
      company: {
        type: "string",
        minLength: 1,
        description: "Filter by company name",
      },
      currency: {
        type: "string",
        minLength: 1,
        description: currencyDescription,
      },
    },
  };
}

function normalizedCurrency(value: string): string {
  const trimmed = value.trim();
  return /^[a-z]{3}$/i.test(trimmed) ? trimmed.toUpperCase() : trimmed;
}

export function parseMoneyScope(
  tool: string,
  input: Record<string, unknown>,
): MoneyScope {
  const scope: MoneyScope = {};
  for (const field of ["company", "currency"] as const) {
    const value = input[field];
    if (value === undefined) continue;
    if (typeof value !== "string" || !value.trim()) {
      throw new ToolInputError(
        tool,
        "INVALID_INPUT",
        `'${field}' must be a non-empty string`,
        {
          context: { field },
          recovery:
            `Pass the exact ${field} name, or omit '${field}' to include every ${field}.`,
        },
      );
    }
    scope[field] = field === "currency"
      ? normalizedCurrency(value)
      : value.trim();
  }
  return scope;
}

export function moneyScopeFilters(
  scope: MoneyScope,
  currencyField = "currency",
): FrappeFilter[] {
  return [
    ...(scope.company ? [["company", "=", scope.company] as FrappeFilter] : []),
    ...(scope.currency
      ? [[currencyField, "=", scope.currency] as FrappeFilter]
      : []),
  ];
}

export class AnalyticsDataError extends Error {
  readonly retryable = false;
  readonly context: Readonly<Record<string, unknown>>;

  constructor(
    readonly tool: string,
    readonly code:
      | "MISSING_CURRENCY"
      | "MIXED_CURRENCIES"
      | "INVALID_AMOUNT"
      | "INVALID_DATE",
    detail: string,
    readonly recovery: string,
    context: Record<string, unknown> = {},
  ) {
    super(formatToolError(tool, code, detail, recovery));
    this.name = "AnalyticsDataError";
    this.context = Object.freeze({ ...context });
  }
}

/** Keep the stored unit: grand_total uses currency; outstanding uses party_account_currency. */
export function moneyValues(
  tool: string,
  rows: readonly Record<string, unknown>[],
  amountField: string,
  currencyField: string,
  selectedCurrency?: string,
): { currency?: string; amounts: number[] } {
  const currencies = new Set<string>();
  const amounts = rows.map((row, index) => {
    const document = typeof row.name === "string"
      ? `document '${row.name}'`
      : `document at row ${index}`;
    const currency = row[currencyField];
    if (typeof currency !== "string" || !currency.trim()) {
      throw new AnalyticsDataError(
        tool,
        "MISSING_CURRENCY",
        `Cannot determine '${currencyField}' for ${document}`,
        `Inspect and repair '${currencyField}' on the source document; no currency is guessed.`,
        { currencyField, name: row.name, index },
      );
    }
    currencies.add(normalizedCurrency(currency));
    const raw = row[amountField];
    const amount =
      typeof raw === "number" || (typeof raw === "string" && raw.trim())
        ? Number(raw)
        : Number.NaN;
    if (!Number.isFinite(amount)) {
      throw new AnalyticsDataError(
        tool,
        "INVALID_AMOUNT",
        `${document} has no finite '${amountField}'`,
        `Inspect and repair '${amountField}' on the source document before calculating this KPI.`,
        { amountField, name: row.name, index },
      );
    }
    return amount;
  });
  if (
    currencies.size > 1 ||
    (selectedCurrency && currencies.size === 1 &&
      !currencies.has(selectedCurrency))
  ) {
    throw new AnalyticsDataError(
      tool,
      "MIXED_CURRENCIES",
      `Amounts in '${currencyField}' have incompatible currencies: ${
        [...currencies].sort().join(", ")
      }`,
      "Call this KPI with one 'currency' (and optionally 'company'); amounts in different currencies are never added or converted.",
      { currencyField, currencies: [...currencies].sort(), selectedCurrency },
    );
  }
  const currency = currencies.values().next().value ?? selectedCurrency;
  return { ...(currency ? { currency } : {}), amounts };
}

export function sumMoney(tool: string, amounts: readonly number[]): number {
  let sum = 0;
  let correction = 0;
  for (const amount of amounts) {
    const corrected = amount - correction;
    const next = sum + corrected;
    correction = (next - sum) - corrected;
    sum = next;
  }
  if (!Number.isFinite(sum)) {
    throw new AnalyticsDataError(
      tool,
      "INVALID_AMOUNT",
      "The total exceeds the supported numeric range",
      "Narrow this KPI with 'company' or 'currency' and inspect unusually large source amounts.",
    );
  }
  return sum;
}

export function formatMoney(amount: number, currency?: string): string {
  // ERPNext also allows custom Currency names that Intl does not recognize.
  return currency && /^[A-Z]{3}$/.test(currency)
    ? amount.toLocaleString("en-US", { style: "currency", currency })
    : `${amount.toLocaleString("en-US")}${currency ? ` ${currency}` : ""}`;
}
