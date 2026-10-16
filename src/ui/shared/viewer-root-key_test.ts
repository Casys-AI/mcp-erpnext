import { assertEquals } from "@std/assert";
import { viewerRootKey } from "./viewer-root-key.ts";

Deno.test("viewerRootKey canonicalizes the request and ignores refreshed data", () => {
  const first = viewerRootKey(
    "stock",
    {
      toolName: "erpnext_stock_balance",
      arguments: { warehouse: "Stores - C", limit: 50 },
    },
    { doctype: "Bin" },
  );
  const refreshed = viewerRootKey(
    "stock",
    {
      toolName: "erpnext_stock_balance",
      arguments: { limit: 50, warehouse: "Stores - C" },
    },
    { doctype: "Bin", title: "Stock refreshed" },
  );

  assertEquals(refreshed, first);
  assertEquals(
    viewerRootKey(
      "stock",
      {
        toolName: "erpnext_stock_balance",
        arguments: { warehouse: "Finished Goods - C", limit: 50 },
      },
      { doctype: "Bin" },
    ) === first,
    false,
  );
});

Deno.test("viewerRootKey distinguishes roots without a refresh request", () => {
  const invoices = viewerRootKey("doclist", undefined, {
    doctype: "Sales Invoice",
  });
  const orders = viewerRootKey("doclist", undefined, {
    doctype: "Sales Order",
  });
  assertEquals(invoices === orders, false);
});

Deno.test("viewerRootKey canonicalizes nested objects while preserving array order", () => {
  const request = {
    toolName: "erpnext_doc_list",
    arguments: {
      filters: { status: "Open", customer: "Acme" },
      fields: ["name", "status"],
    },
  };
  const key = viewerRootKey("doclist", request);
  assertEquals(
    viewerRootKey("doclist", {
      ...request,
      arguments: {
        fields: ["name", "status"],
        filters: { customer: "Acme", status: "Open" },
      },
    }),
    key,
  );
  assertEquals(
    viewerRootKey("doclist", {
      ...request,
      arguments: { ...request.arguments, fields: ["status", "name"] },
    }) === key,
    false,
  );
});
