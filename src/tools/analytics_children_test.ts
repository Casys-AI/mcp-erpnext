import { assertEquals } from "@std/assert";
import { FrappeAPIError } from "../api/frappe-client.ts";
import type { FrappeClient } from "../api/frappe-client.ts";
import type { FrappeListOptions } from "../api/types.ts";
import { analyticsTools } from "./analytics.ts";

const childCases: Array<[string, Record<string, unknown>, string, string]> = [
  [
    "erpnext_sales_chart",
    { group_by: "item" },
    "Sales Invoice Item",
    "Sales Invoice",
  ],
  [
    "erpnext_product_radar",
    { items: ["A", "B"] },
    "Sales Order Item",
    "Sales Order",
  ],
  ["erpnext_price_vs_qty", {}, "Sales Order Item", "Sales Order"],
  [
    "erpnext_gross_profit",
    { group_by: "item" },
    "Sales Invoice Item",
    "Sales Invoice",
  ],
  [
    "erpnext_gross_profit",
    { group_by: "customer" },
    "Sales Invoice Item",
    "Sales Invoice",
  ],
];

for (const [name, input, child, parent] of childCases) {
  Deno.test(`${name} ${input.group_by ?? ""} - child reads carry the permission parent`, async () => {
    let childCalls = 0;
    const client = {
      list: async (doctype: string, options: FrappeListOptions = {}) => {
        if (doctype === child) {
          childCalls++;
          if (options.parent !== parent) {
            throw new FrappeAPIError("Insufficient Permission", 403, null);
          }
        }
        return [];
      },
    } as unknown as FrappeClient;
    const tool = analyticsTools.find((tool) => tool.name === name)!;
    await tool.handler(input, { client });
    assertEquals(childCalls, 1);
  });
}
