import { assertEquals } from "@std/assert";
import {
  childRowNavigationAsks,
  childRowNavigationJumps,
} from "./child-row-navigation.ts";
import type { NavHint } from "../jumps.ts";

const hints: NavHint[] = [
  {
    key: "customer",
    label: "Customer",
    tool: "erpnext_customer_get",
    args: { name: "CUST-1" },
    kind: "record",
  },
  {
    key: "item",
    label: "Item",
    tool: "erpnext_item_get",
    args: { name: "{item}" },
    kind: "record",
  },
  {
    key: "stock",
    label: "Stock",
    tool: "erpnext_stock_balance",
    args: { item_code: "{item}", limit: 50 },
    kind: "list",
  },
  {
    key: "item-parent",
    label: "Item parent",
    tool: "erpnext_item_get",
    args: { name: "{item}", parent: "{id}" },
    kind: "record",
  },
];

Deno.test("child row navigation - item and stock become breadcrumb jumps", () => {
  const jumps = childRowNavigationJumps({
    hints,
    rootVars: { id: "SINV-1", name: "SINV-1", doctype: "Sales Invoice" },
    row: { item_code: "ITEM-1", qty: 2 },
    availableTools: [
      "erpnext_customer_get",
      "erpnext_item_get",
      "erpnext_stock_balance",
    ],
    subtitle: "linked to ITEM-1",
  });
  assertEquals(jumps.map((jump) => jump.label), [
    "Item · ITEM-1",
    "Stock · ITEM-1",
    "Item parent · ITEM-1",
  ]);
  assertEquals(jumps[0].tool, {
    name: "erpnext_item_get",
    args: { name: "ITEM-1" },
  });
  assertEquals(jumps[1].tool, {
    name: "erpnext_stock_balance",
    args: { item_code: "ITEM-1", limit: 50 },
  });
  assertEquals(jumps[2].tool, {
    name: "erpnext_item_get",
    args: { name: "ITEM-1", parent: "SINV-1" },
  });
});

Deno.test("child row navigation - cannot replace the parent identity", () => {
  const jump = childRowNavigationJumps({
    hints,
    rootVars: { id: "SINV-1" },
    row: { item_code: "ITEM-1", id: "CHILD-ID" },
    availableTools: ["erpnext_item_get"],
  }).find((candidate) => candidate.label === "Item parent · ITEM-1");
  assertEquals(jump?.tool.args, { name: "ITEM-1", parent: "SINV-1" });
});

Deno.test("child row navigation - fails closed without row value or exact tool", () => {
  assertEquals(
    childRowNavigationJumps({
      hints,
      rootVars: { id: "SINV-1" },
      row: { qty: 2 },
      availableTools: ["erpnext_item_get", "erpnext_stock_balance"],
    }),
    [],
  );
  assertEquals(
    childRowNavigationJumps({
      hints,
      rootVars: { id: "SINV-1" },
      row: { item_code: "ITEM-1" },
      availableTools: ["erpnext_item_get"],
    }).map((jump) => jump.label),
    ["Item · ITEM-1", "Item parent · ITEM-1"],
  );
  assertEquals(
    childRowNavigationJumps({
      hints,
      rootVars: { id: "SINV-1" },
      row: { item_code: "ITEM-1" },
      availableTools: undefined,
    }),
    [],
  );
});

Deno.test("child row navigation - resolves only row-level conversational hints", () => {
  const asks = childRowNavigationAsks({
    hints: [
      ...hints,
      {
        key: "item-message",
        label: "Explain item",
        message: "Explain {item} from {id}",
      },
      {
        key: "root-message",
        label: "Explain invoice",
        message: "Explain {id}",
      },
    ],
    rootVars: { id: "SINV-1" },
    row: { item_code: "ITEM-1", id: "CHILD-ID" },
  });
  assertEquals(asks, [{
    label: "Explain item · ITEM-1",
    message: "Explain ITEM-1 from SINV-1",
  }]);
});
