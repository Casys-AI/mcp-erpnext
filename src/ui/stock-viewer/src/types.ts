import type { UiRefreshRequestData } from "~/shared/refresh";
import type { NavHint } from "~/shared/jumps";

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
  /** Outils exacts exposés par le registre serveur à ce viewer. */
  _availableTools?: string[];
  /** Hints de navigation attachés par le serveur (STOCK_HINTS). */
  _sendMessageHints?: NavHint[];
}

export interface StockItemDetail {
  item: Record<string, unknown>;
  movements: Record<string, unknown>[];
}
