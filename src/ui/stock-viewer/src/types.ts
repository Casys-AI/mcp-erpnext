import type { UiRefreshRequestData } from "~/shared/refresh";

export interface StockEntry {
  item_code: string;
  warehouse: string;
  actual_qty: number;
  reserved_qty?: number;
  projected_qty?: number;
  valuation_rate?: number;
  stock_value?: number;
}

export interface StockData {
  count: number;
  data: StockEntry[];
  currency?: string;
  refreshRequest?: UiRefreshRequestData;
}

export interface StockItemDetail {
  item: Record<string, unknown>;
  movements: Record<string, unknown>[];
}
