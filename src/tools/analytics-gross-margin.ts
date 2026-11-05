import type { FrappeClient } from "../api/frappe-client.ts";
import { AnalyticsDataError } from "./analytics-money.ts";

const TOOL = "erpnext_kpi_gross_margin";
const MAX_ORDER_ROWS = 1000;
const MAX_BIN_ROWS = 500;

function requireComplete(doctype: string, count: number, limit: number): void {
  if (count <= limit) return;
  throw new AnalyticsDataError(
    TOOL,
    "INCOMPLETE_DATA",
    `More than ${limit} ${doctype} rows are available; no partial margin is returned`,
    "Use a scoped ERPNext report or retrieve the source rows with pagination before calculating a complete estimate.",
    { doctype, limit },
  );
}

function numericField(
  row: Record<string, unknown>,
  field: string,
  doctype: string,
): number {
  const raw = row[field];
  const value = typeof raw === "number" ||
      (typeof raw === "string" && raw.trim())
    ? Number(raw)
    : Number.NaN;
  if (!Number.isFinite(value)) {
    throw new AnalyticsDataError(
      TOOL,
      "INVALID_AMOUNT",
      `${doctype} row for '${
        row.item_code ?? "unknown item"
      }' has no finite '${field}'`,
      `Check read permissions and the stored '${field}' value; missing fields cannot be treated as zero.`,
      { doctype, field, item_code: row.item_code },
    );
  }
  return value;
}

export async function estimateGrossMargin(
  client: FrappeClient,
): Promise<number> {
  // One extra row distinguishes a complete boundary-sized result from a
  // truncated aggregate without reading an unbounded table.
  const soItems = await client.list("Sales Order Item", {
    parent: "Sales Order",
    fields: ["item_code", "qty", "amount"],
    filters: [["docstatus", "!=", 2]],
    limit: MAX_ORDER_ROWS + 1,
  });
  requireComplete("Sales Order Item", soItems.length, MAX_ORDER_ROWS);
  if (soItems.length === 0) return 0;

  let revenue = 0;
  const itemQty = new Map<string, number>();
  for (const row of soItems) {
    const code = row.item_code;
    if (typeof code !== "string" || !code.trim()) {
      throw new AnalyticsDataError(
        TOOL,
        "INVALID_DATA",
        "A Sales Order Item row has no item_code",
        "Check item_code read permissions and the source order before estimating its cost.",
        { doctype: "Sales Order Item", field: "item_code" },
      );
    }
    revenue += numericField(row, "amount", "Sales Order Item");
    itemQty.set(
      code,
      (itemQty.get(code) ?? 0) + numericField(row, "qty", "Sales Order Item"),
    );
  }

  const bins = await client.list("Bin", {
    fields: ["item_code", "valuation_rate"],
    limit: MAX_BIN_ROWS + 1,
  });
  requireComplete("Bin", bins.length, MAX_BIN_ROWS);

  const rates = new Map<string, number>();
  for (const bin of bins) {
    const code = bin.item_code;
    if (typeof code !== "string" || !code.trim()) {
      throw new AnalyticsDataError(
        TOOL,
        "INVALID_DATA",
        "A Bin row has no item_code; its valuation cannot be matched safely",
        "Check item_code read permissions and the source Bin before estimating costs.",
        { doctype: "Bin", field: "item_code" },
      );
    }
    if (!itemQty.has(code)) continue;
    const rate = numericField(bin, "valuation_rate", "Bin");
    if (rates.has(code) && rates.get(code) !== rate) {
      throw new AnalyticsDataError(
        TOOL,
        "AMBIGUOUS_VALUATION",
        `Item '${code}' has different valuation rates across warehouses`,
        "Use a warehouse-specific ERPNext report; this estimate cannot choose an arbitrary warehouse's cost.",
        { item_code: code },
      );
    }
    rates.set(code, rate);
  }

  let cost = 0;
  for (const [code, qty] of itemQty) {
    const rate = rates.get(code);
    if (rate === undefined) {
      throw new AnalyticsDataError(
        TOOL,
        "MISSING_VALUATION",
        `No readable Bin valuation rate is available for item '${code}'`,
        "Check stock valuation and Bin read permissions, or use an ERPNext report with the appropriate cost basis; missing cost is not zero cost.",
        { item_code: code },
      );
    }
    cost += rate * qty;
  }

  const margin = revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0;
  if (
    !Number.isFinite(revenue) || !Number.isFinite(cost) ||
    !Number.isFinite(margin)
  ) {
    throw new AnalyticsDataError(
      TOOL,
      "INVALID_AMOUNT",
      "The gross-margin calculation exceeds the supported numeric range",
      "Inspect unusually large source quantities, amounts and valuation rates before calculating this KPI.",
    );
  }
  return margin;
}
