import { assertEquals, assertNotEquals } from "@std/assert";
import {
  stockRowContextId,
  stockRowContextItem,
  stockRowDetailId,
} from "./stock-interactions.ts";
import type { StockEntry } from "./types.ts";

const ROW: StockEntry = {
  item_code: "BOLT M6",
  warehouse: "Stores - C",
  actual_qty: 12,
};

Deno.test("stock interaction - contexte compact conserve article, entrepot et quantite", () => {
  assertEquals(
    stockRowContextItem(ROW, "Stock Balance", "Actual", "12"),
    {
      id: "stock:BOLT%20M6:Stores%20-%20C",
      view: "Stock Balance",
      label: "BOLT M6",
      value: "Stores - C · Actual 12",
    },
  );
});

Deno.test("stock interaction - un meme article dans deux entrepots reste deux cibles", () => {
  const other = { ...ROW, warehouse: "Finished Goods - C" };
  assertNotEquals(stockRowContextId(ROW), stockRowContextId(other));
  assertNotEquals(stockRowDetailId(ROW), stockRowDetailId(other));
});

Deno.test("stock interaction - aria-controls pointe vers un id sans espace", () => {
  assertEquals(
    stockRowDetailId(ROW),
    "stock-row-detail-BOLT%20M6--Stores%20-%20C",
  );
  assertEquals(stockRowDetailId(ROW).includes(" "), false);
});
