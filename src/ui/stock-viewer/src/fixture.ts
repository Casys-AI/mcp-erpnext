import type { StockData, StockItemDetail } from "./types.ts";

/**
 * Mock payload so the bundled HTML can be opened without a host.
 * `_sendMessageHints` est une copie de STOCK_HINTS (src/tools/ui-refresh.ts)
 * pour que la vue voie les hints en mode fixture — les sauts restent
 * désactivés car jumpsEnabled = !fixture && canJump(...).
 */
export const STOCK_FIXTURE: StockData = {
  _availableTools: [
    "erpnext_stock_balance",
    "erpnext_item_get",
    "erpnext_stock_entry_list",
    "erpnext_doc_list",
    "erpnext_stock_chart",
  ],
  _sendMessageHints: [
    {
      key: "item",
      label: "Item",
      message: "Show item {id}",
      tool: "erpnext_item_get",
      args: { name: "{id}" },
      kind: "record",
    },
    {
      key: "movements",
      label: "Stock entries",
      message: "Show stock entries for item {id}",
      tool: "erpnext_doc_list",
      args: {
        doctype: "Stock Entry",
        fields: ["name", "posting_date", "stock_entry_type", "docstatus"],
        filters: [["Stock Entry Detail", "item_code", "=", "{id}"]],
        limit: 20,
      },
      kind: "list",
    },
    {
      key: "warehouse",
      label: "Warehouse stock",
      message: "Show stock chart for warehouse {warehouse}",
      tool: "erpnext_stock_chart",
      args: { warehouse: "{warehouse}", limit: 10 },
      kind: "chart",
    },
  ],
  count: 4,
  data: [
    {
      item_code: "WIDGET-A",
      warehouse: "Stores - C",
      actual_qty: 42,
      reserved_qty: 4,
      projected_qty: 38,
      valuation_rate: 12.5,
      stock_value: 525,
    },
    {
      item_code: "WIDGET-B",
      warehouse: "Stores - C",
      actual_qty: 8,
      reserved_qty: 2,
      projected_qty: 6,
      valuation_rate: 44,
      stock_value: 352,
    },
    {
      item_code: "GADGET-1",
      warehouse: "Finished Goods - C",
      actual_qty: 0,
      reserved_qty: 0,
      projected_qty: 20,
      valuation_rate: 18,
      stock_value: 0,
    },
    {
      item_code: "BOLT-M6",
      warehouse: "Stores - C",
      actual_qty: 1200,
      reserved_qty: 80,
      projected_qty: 1120,
      valuation_rate: 0.15,
      stock_value: 180,
    },
  ],
  refreshRequest: {
    toolName: "erpnext_stock_balance",
    arguments: { limit: 50 },
  },
};

const STOCK_ITEM_FIXTURES: Record<string, StockItemDetail> = {
  "WIDGET-A": {
    item: {
      item_name: "Widget A",
      item_group: "Products",
      stock_uom: "Nos",
      standard_rate: 15,
    },
    movements: [
      {
        name: "MAT-STE-0001",
        stock_entry_type: "Material Receipt",
        posting_date: "2026-08-10",
      },
      {
        name: "MAT-STE-0002",
        stock_entry_type: "Material Transfer",
        posting_date: "2026-08-12",
      },
    ],
  },
  "WIDGET-B": {
    item: {
      item_name: "Widget B",
      item_group: "Products",
      stock_uom: "Nos",
      standard_rate: 48,
    },
    movements: [
      {
        name: "MAT-STE-0003",
        stock_entry_type: "Material Issue",
        posting_date: "2026-08-11",
      },
    ],
  },
  "GADGET-1": {
    item: {
      item_name: "Gadget 1",
      item_group: "Products",
      stock_uom: "Nos",
      standard_rate: 22,
    },
    movements: [],
  },
  "BOLT-M6": {
    item: {
      item_name: "Hex Bolt M6",
      item_group: "Raw Material",
      stock_uom: "Nos",
      standard_rate: 0.2,
    },
    movements: [
      {
        name: "MAT-STE-0004",
        stock_entry_type: "Material Receipt",
        posting_date: "2026-08-08",
      },
    ],
  },
};

export function fixtureItemDetail(itemCode: string): StockItemDetail {
  return STOCK_ITEM_FIXTURES[itemCode] ?? {
    item: { item_name: itemCode, item_group: "Products", stock_uom: "Nos" },
    movements: [],
  };
}

export function isFixtureMode(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(globalThis.location.search).has("fixture");
}
