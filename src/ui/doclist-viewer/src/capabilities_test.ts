import { assertEquals } from "@std/assert";
import { canRefreshDoclistRoot } from "./capabilities.ts";

const REQUEST = {
  toolName: "erpnext_sales_invoice_list",
  arguments: { limit: 20 },
};

Deno.test("doclist refresh capability : proxy et outil exact affichent le contrôle", () => {
  assertEquals(
    canRefreshDoclistRoot({}, ["erpnext_sales_invoice_list"], REQUEST),
    true,
  );
});

Deno.test("doclist refresh capability : message-only, nom absent ou requête absente masquent le contrôle", () => {
  assertEquals(
    canRefreshDoclistRoot(
      undefined,
      ["erpnext_sales_invoice_list"],
      REQUEST,
    ),
    false,
  );
  assertEquals(canRefreshDoclistRoot({}, ["erpnext_doc_get"], REQUEST), false);
  assertEquals(
    canRefreshDoclistRoot({}, ["erpnext_sales_invoice_list"], null),
    false,
  );
});
