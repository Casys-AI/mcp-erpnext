import { assertEquals } from "@std/assert";
import {
  canInteractWithStockRow,
  stockDetailCapabilities,
} from "./capabilities.ts";

Deno.test("stock detail capabilities : serveur complet expose les deux lectures", () => {
  assertEquals(
    stockDetailCapabilities({}, [
      "erpnext_item_get",
      "erpnext_stock_entry_list",
    ]),
    { canLoadItem: true, canLoadMovements: true },
  );
});

Deno.test("stock detail capabilities : une catégorie partielle garde seulement le nom exact", () => {
  assertEquals(
    stockDetailCapabilities({}, ["erpnext_item_get"]),
    { canLoadItem: true, canLoadMovements: false },
  );
  assertEquals(
    stockDetailCapabilities({}, ["erpnext_stock_entry_list"]),
    { canLoadItem: false, canLoadMovements: true },
  );
});

Deno.test("stock detail capabilities : message-only refuse les outils annoncés par le payload", () => {
  assertEquals(
    stockDetailCapabilities(undefined, [
      "erpnext_item_get",
      "erpnext_stock_entry_list",
    ]),
    { canLoadItem: false, canLoadMovements: false },
  );
});

Deno.test("stock detail capabilities : payload 3.0.x reste toléré, manifeste vide reste statique", () => {
  assertEquals(
    stockDetailCapabilities({}, undefined),
    { canLoadItem: true, canLoadMovements: true },
  );
  assertEquals(
    stockDetailCapabilities({}, []),
    { canLoadItem: false, canLoadMovements: false },
  );
});

Deno.test("stock mobile : message.text rend la ligne utile, sans canal elle reste statique", () => {
  assertEquals(
    canInteractWithStockRow({
      fixture: false,
      hasJump: false,
      canInspect: false,
      messagesEnabled: true,
    }),
    true,
  );
  assertEquals(
    canInteractWithStockRow({
      fixture: false,
      hasJump: false,
      canInspect: false,
      messagesEnabled: false,
    }),
    false,
  );
});
