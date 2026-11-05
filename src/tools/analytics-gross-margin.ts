import type { FrappeClient } from "../api/frappe-client.ts";
import type {
  MissingValuation,
  ValuationCoverage,
} from "../ui/kpi-coverage.ts";
import {
  createReadBudget,
  FrappePaginationError,
  listPages,
} from "../api/list-pages.ts";
import { AnalyticsDataError } from "./analytics-money.ts";
import {
  grossMarginOrderFilters,
  parseGrossMarginScope,
} from "./gross-margin-scope.ts";
import type { GrossMarginScope } from "./gross-margin-scope.ts";

const TOOL = "erpnext_kpi_gross_margin";
const BATCH_SIZE = 50;
const MISSING_VALUATION_DETAIL_LIMIT = 20;

export interface GrossMarginEstimate extends GrossMarginScope {
  margin: number;
  revenue: number;
  estimatedCost: number;
  currency?: string;
  coverage?: ValuationCoverage;
}

interface ItemQuantity {
  quantity: number;
  stockUom: string;
  revenue: number;
  lineCount: number;
}

function* batches<T>(values: T[]): Generator<T[]> {
  for (let start = 0; start < values.length; start += BATCH_SIZE) {
    yield values.slice(start, start + BATCH_SIZE);
  }
}

function invalidData(detail: string): never {
  throw new AnalyticsDataError(
    TOOL,
    "INVALID_DATA",
    detail,
    "Check source fields, their read permissions and the selected company; no missing value or unit is guessed.",
  );
}

function textField(
  row: Record<string, unknown>,
  field: string,
  doctype: string,
): string {
  const value = row[field];
  if (typeof value !== "string" || !value.trim()) {
    invalidData(
      `${doctype} '${row.name ?? "unknown"}' has no readable '${field}'`,
    );
  }
  return value;
}

function numericField(
  row: Record<string, unknown>,
  field: string,
  doctype: string,
): number {
  const raw = row[field];
  const value =
    typeof raw === "number" || (typeof raw === "string" && raw.trim())
      ? Number(raw)
      : Number.NaN;
  if (!Number.isFinite(value)) {
    throw new AnalyticsDataError(
      TOOL,
      "INVALID_AMOUNT",
      `${doctype} '${row.name ?? "unknown"}' has no finite '${field}'`,
      `Check read permissions and the stored '${field}' value; missing fields cannot be treated as zero.`,
      { doctype, field, name: row.name },
    );
  }
  return value;
}

export async function estimateGrossMargin(
  client: FrappeClient,
  input: Record<string, unknown> = {},
): Promise<GrossMarginEstimate> {
  const { allow_partial = false, ...scope } = parseGrossMarginScope(input);
  const budget = createReadBudget();
  let company = scope.company;
  let revenue = 0;
  let lineCount = 0;
  let hasNegativeRevenue = false;
  const quantities = new Map<string, Map<string, ItemQuantity>>();

  for await (
    const orders of listPages(client, "Sales Order", {
      fields: ["name", "company"],
      filters: grossMarginOrderFilters(scope),
    }, budget)
  ) {
    for (const order of orders) {
      const orderCompany = textField(order, "company", "Sales Order");
      if (company && company !== orderCompany) {
        throw new AnalyticsDataError(
          TOOL,
          "MIXED_COMPANIES",
          "Matching Sales Orders span different companies",
          "Call this KPI with one 'company'; company-currency amounts and warehouse costs are not combined across companies.",
        );
      }
      company = orderCompany;
    }

    // Scope through readable parents: company is not a Sales Order Item field.
    for (const names of batches(orders.map((order) => order.name))) {
      const parents = new Set(names);
      for await (
        const rows of listPages(client, "Sales Order Item", {
          parent: "Sales Order",
          fields: [
            "name",
            "parent",
            "item_code",
            "warehouse",
            "stock_uom",
            "stock_qty",
            "base_net_amount",
          ],
          filters: [["parent", "in", names], ["docstatus", "!=", 2]],
        }, budget)
      ) {
        for (const row of rows) {
          if (!parents.has(textField(row, "parent", "Sales Order Item"))) {
            invalidData(
              "A Sales Order Item is outside the requested parent scope",
            );
          }
          const code = textField(row, "item_code", "Sales Order Item");
          const warehouse = textField(row, "warehouse", "Sales Order Item");
          const stockUom = textField(row, "stock_uom", "Sales Order Item");
          const quantity = numericField(row, "stock_qty", "Sales Order Item");
          const lineRevenue = numericField(
            row,
            "base_net_amount",
            "Sales Order Item",
          );
          hasNegativeRevenue ||= lineRevenue < 0;
          revenue += lineRevenue;
          lineCount++;
          let items = quantities.get(warehouse);
          if (!items) quantities.set(warehouse, items = new Map());
          const previous = items.get(code);
          if (previous && previous.stockUom !== stockUom) {
            invalidData(`Item '${code}' has inconsistent stock units`);
          }
          items.set(code, {
            quantity: (previous?.quantity ?? 0) + quantity,
            stockUom,
            revenue: (previous?.revenue ?? 0) + lineRevenue,
            lineCount: (previous?.lineCount ?? 0) + 1,
          });
        }
      }
    }
  }

  if (lineCount === 0) {
    return {
      ...scope,
      ...(company ? { company } : {}),
      margin: 0,
      revenue: 0,
      estimatedCost: 0,
    };
  }
  const companies = await client.list("Company", {
    fields: ["name", "default_currency"],
    filters: [["name", "=", company!]],
    limit: 1,
  }, { skipCache: true });
  if (companies.length !== 1 || companies[0].name !== company) {
    invalidData("The order company's currency could not be read");
  }
  const currency = textField(companies[0], "default_currency", "Company");

  // Bin.company is unavailable before ERPNext v16; validate Warehouse.company.
  for (const names of batches([...quantities.keys()])) {
    const remaining = new Set(names);
    for await (
      const warehouses of listPages(client, "Warehouse", {
        fields: ["name", "company"],
        filters: [["name", "in", names]],
      }, budget)
    ) {
      for (const warehouse of warehouses) {
        if (
          !remaining.delete(warehouse.name) || warehouse.company !== company
        ) {
          invalidData(
            `Warehouse '${warehouse.name}' does not match the order company`,
          );
        }
      }
    }
    if (remaining.size) {
      invalidData(
        `Warehouse '${remaining.values().next().value}' could not be read`,
      );
    }
  }

  let estimatedCost = 0;
  let costedRevenue = 0;
  let costedLineCount = 0;
  const missingValuations: MissingValuation[] = [];
  for (const [warehouse, items] of quantities) {
    for (const codes of batches([...items.keys()])) {
      const pending = new Set(codes);
      const rates = new Map<string, number>();
      for await (
        const bins of listPages(client, "Bin", {
          fields: [
            "name",
            "item_code",
            "warehouse",
            "stock_uom",
            "valuation_rate",
          ],
          filters: [["warehouse", "=", warehouse], ["item_code", "in", codes]],
        }, budget)
      ) {
        for (const bin of bins) {
          const code = textField(bin, "item_code", "Bin");
          const item = items.get(code);
          if (!item || !codes.includes(code) || bin.warehouse !== warehouse) {
            invalidData(
              "A Bin is outside the requested item and warehouse scope",
            );
          }
          if (textField(bin, "stock_uom", "Bin") !== item.stockUom) {
            invalidData(
              `Item '${code}' has inconsistent stock units in '${warehouse}'`,
            );
          }
          const rate = numericField(bin, "valuation_rate", "Bin");
          if (rate < 0) {
            invalidData(
              `Item '${code}' has a negative valuation in '${warehouse}'`,
            );
          }
          if (rates.has(code) && rates.get(code) !== rate) {
            throw new AnalyticsDataError(
              TOOL,
              "AMBIGUOUS_VALUATION",
              `Item '${code}' has conflicting valuation rates in warehouse '${warehouse}'`,
              "Inspect the duplicate Bin records for this item and warehouse before calculating a margin.",
            );
          }
          rates.set(code, rate);
          pending.delete(code);
        }
      }
      if (pending.size && !allow_partial) {
        throw new AnalyticsDataError(
          TOOL,
          "MISSING_VALUATION",
          `No readable Bin valuation for item '${pending.values().next().value}' in '${warehouse}'`,
          "Check stock valuation and Bin permissions for this warehouse, or explicitly pass allow_partial: true to estimate only the costed lines and report missing valuations separately. For other cost bases, use the appropriate ERPNext report; missing cost is not zero cost.",
        );
      }
      for (const code of pending) {
        const item = items.get(code)!;
        missingValuations.push({
          item_code: code,
          warehouse,
          stock_uom: item.stockUom,
          revenue: item.revenue,
          lineCount: item.lineCount,
        });
      }
      for (const [code, rate] of rates) {
        const item = items.get(code)!;
        estimatedCost += item.quantity * rate;
        costedRevenue += item.revenue;
        costedLineCount += item.lineCount;
      }
    }
  }
  if (Date.now() >= budget.deadlineMs) {
    throw new FrappePaginationError(
      "Gross margin",
      "The read deadline was exceeded",
    );
  }
  if (
    !Number.isFinite(revenue) || !Number.isFinite(estimatedCost) ||
    !Number.isFinite(costedRevenue)
  ) {
    throw new AnalyticsDataError(
      TOOL,
      "INVALID_AMOUNT",
      "The margin requires finite revenue and cost totals",
      "Inspect the source amounts and quantities, or narrow the period before calculating this KPI.",
    );
  }
  const partial = missingValuations.length > 0;
  if (partial && hasNegativeRevenue) {
    throw new AnalyticsDataError(
      TOOL,
      "INVALID_AMOUNT",
      "Partial revenue coverage requires non-negative line revenues",
      "Narrow the scope to non-negative Sales Order lines, or use an ERPNext report that handles signed revenue and cost coverage explicitly.",
    );
  }
  const coverage = partial
    ? valuationCoverage(
      missingValuations,
      costedRevenue,
      costedLineCount,
      currency,
    )
    : undefined;
  if (coverage && costedRevenue <= 0) {
    throw new AnalyticsDataError(
      TOOL,
      "MISSING_VALUATION",
      `No positive revenue has a readable Bin valuation; a partial margin cannot be calculated. ` +
        `${coverage.uncostedRevenue} ${currency} across ${coverage.uncostedLineCount} line(s) ` +
        `and ${coverage.missingItemCount} item(s) has no readable valuation`,
      "Inspect the missing valuations or narrow the scope to lines with a known cost. No zero margin is inferred from uncosted revenue.",
      { coverage },
    );
  }
  const marginRevenue = partial ? costedRevenue : revenue;
  const margin = marginRevenue > 0
    ? ((marginRevenue - estimatedCost) / marginRevenue) * 100
    : 0;
  if (
    !Number.isFinite(margin) ||
    (revenue <= 0 && estimatedCost !== 0)
  ) {
    throw new AnalyticsDataError(
      TOOL,
      "INVALID_AMOUNT",
      "The margin requires finite totals and positive revenue when costs are nonzero",
      "Inspect the source amounts and quantities, or narrow the period before calculating this KPI.",
    );
  }
  return {
    ...scope,
    company,
    currency,
    margin,
    revenue,
    estimatedCost,
    ...(coverage ? { coverage } : {}),
  };
}

function valuationCoverage(
  missing: MissingValuation[],
  costedRevenue: number,
  costedLineCount: number,
  currency: string,
): ValuationCoverage {
  const uncostedRevenue = missing.reduce((sum, row) => sum + row.revenue, 0);
  const totalRevenue = costedRevenue + uncostedRevenue;
  const compareText = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
  const sorted = missing.toSorted((left, right) =>
    right.revenue - left.revenue ||
    compareText(left.item_code, right.item_code) ||
    compareText(left.warehouse, right.warehouse)
  );
  return {
    value: totalRevenue > 0 ? costedRevenue / totalRevenue * 100 : 0,
    costedRevenue,
    uncostedRevenue,
    currency,
    costedLineCount,
    uncostedLineCount: missing.reduce((sum, row) => sum + row.lineCount, 0),
    missingValuationCount: missing.length,
    missingItemCount: new Set(missing.map((row) => row.item_code)).size,
    missingValuations: sorted.slice(0, MISSING_VALUATION_DETAIL_LIMIT),
    omittedValuationCount: Math.max(
      0,
      missing.length - MISSING_VALUATION_DETAIL_LIMIT,
    ),
  };
}
