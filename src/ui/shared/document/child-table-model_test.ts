import { assertEquals } from "@std/assert";
import {
  childTableColumnsForLayout,
  childTableHiddenEntries,
  childTableModelOf,
  humanizeDocumentKey,
  isChildTableValue,
} from "./child-table-model.ts";

Deno.test("childTableModelOf builds stable business columns from heterogeneous rows", () => {
  const table = childTableModelOf("items", [{
    idx: 1,
    parent: "SO-1",
    parenttype: "Sales Order",
    parentfield: "items",
    name: "ROW-a8fb",
    batch_no: "B-1",
    amount: 25,
    item_code: "ITEM-1",
    description: "Widget",
    qty: 2,
  }, {
    idx: 2,
    parent: "SO-1",
    amount: "15.50",
    item_code: "ITEM-2",
    qty: 1,
    warehouse: "Stores",
  }]);

  assertEquals(table.columns.map((column) => column.key), [
    "item_code",
    "description",
    "qty",
    "amount",
    "warehouse",
    "batch_no",
  ]);
  assertEquals(table.columns.map((column) => column.numeric), [
    false,
    false,
    true,
    true,
    false,
    false,
  ]);
  assertEquals(table.rows[0], {
    item_code: "ITEM-1",
    description: "Widget",
    qty: 2,
    amount: 25,
    batch_no: "B-1",
  });
  assertEquals("idx" in table.rows[0], false);
  assertEquals("name" in table.rows[0], false);
});

Deno.test("child table layouts expose four wide columns and three narrow columns", () => {
  const table = childTableModelOf("items", [{
    item_code: "ITEM-1",
    description: "Widget",
    qty: 2,
    amount: 25,
    warehouse: "Stores",
    batch_no: "B-1",
  }]);

  assertEquals(
    childTableColumnsForLayout(table, "wide").map((column) => column.key),
    ["item_code", "description", "qty", "amount"],
  );
  assertEquals(
    childTableColumnsForLayout(table, "panel").map((column) => column.key),
    ["item_code", "description", "qty"],
  );
  assertEquals(
    childTableColumnsForLayout(table, "mobile").map((column) => column.key),
    ["item_code", "description", "qty"],
  );
  assertEquals(
    childTableHiddenEntries(table, 0, "mobile").map((field) => field.key),
    ["amount", "warehouse", "batch_no"],
  );
  assertEquals(childTableHiddenEntries(table, 99, "wide"), []);
});

Deno.test("child table totals only exact additive fields", () => {
  assertEquals(
    childTableModelOf("items", [
      { amount: 10, score: 3 },
      { amount: "2.50", score: 4 },
      { amount: null, score: 5 },
    ]).total,
    { key: "amount", label: "Amount", value: 12.5 },
  );
  assertEquals(
    childTableModelOf("scores", [{ score: 3 }, { score: 4 }]).total,
    undefined,
  );
});

Deno.test("invalid or incomplete amount totals fall through safely", () => {
  assertEquals(
    childTableModelOf("items", [
      { amount: 10, base_amount: 20 },
      { amount: "not-a-number", base_amount: 5 },
      { base_amount: null },
    ]).total,
    { key: "base_amount", label: "Base amount", value: 25 },
  );
  assertEquals(
    childTableModelOf("items", [
      { amount: 10 },
      { amount: "not-a-number" },
    ]).total,
    undefined,
  );
});

Deno.test("name remains a business column outside Frappe child-row metadata", () => {
  const table = childTableModelOf("contacts", [{
    name: "Ada Lovelace",
    email: "ada@example.com",
  }]);
  assertEquals(table.columns.map((column) => column.key), ["name", "email"]);
});

Deno.test("nested child values are serialized before reaching components", () => {
  const table = childTableModelOf("steps", [{
    title: "Inspect",
    settings: { tolerance: 0.1 },
    tags: ["quality", "line-1"],
  }]);
  assertEquals(table.rows[0].settings, '{"tolerance":0.1}');
  assertEquals(table.rows[0].tags, '["quality","line-1"]');
  assertEquals(
    table.columns.find((column) => column.key === "settings")?.numeric,
    false,
  );
});

Deno.test("child table detection is explicit for non-empty object arrays", () => {
  assertEquals(
    isChildTableValue([{ item_code: "A" }, { item_code: "B" }]),
    true,
  );
  assertEquals(isChildTableValue([]), false);
  assertEquals(isChildTableValue(["A", "B"]), false);
  assertEquals(isChildTableValue([{ item_code: "A" }, "B"]), false);
});

Deno.test("humanizeDocumentKey handles snake, kebab, and camel case", () => {
  assertEquals(
    humanizeDocumentKey("expected_start_date"),
    "Expected start date",
  );
  assertEquals(humanizeDocumentKey("item-code"), "Item code");
  assertEquals(humanizeDocumentKey("baseGrandTotal"), "Base Grand Total");
});
