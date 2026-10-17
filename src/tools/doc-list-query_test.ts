/**
 * Query contract of the Frappe list tools: filters, pagination, child-table
 * ordering. Each case documents what Frappe (v14/v15/v16) does with the value.
 *
 * @module lib/erpnext/tools/doc-list-query_test
 */

import { assert, assertEquals, assertThrows } from "@std/assert";
import {
  FRAPPE_FILTERS_INPUT_SCHEMA,
  hasChildTableFilter,
  parseFrappeFilters,
  parsePagination,
  planListQuery,
} from "./doc-list-query.ts";
import { parseToolInputError, ToolInputError } from "./errors.ts";

const TOOL = "erpnext_doc_list";

function rejection(run: () => unknown): ToolInputError {
  const error = assertThrows(run, ToolInputError);
  // Every rejection is machine-readable on the wire.
  const parsed = parseToolInputError(error.message);
  assert(parsed, `not parseable: ${error.message}`);
  assertEquals(parsed.tool, TOOL);
  assertEquals(parsed.code, error.code);
  assert(parsed.recovery.length > 0);
  return error;
}

// ── Filters ─────────────────────────────────────────────────────────────────

Deno.test("parseFrappeFilters - absent means no filter", () => {
  assertEquals(parseFrappeFilters(TOOL, undefined), []);
  assertEquals(parseFrappeFilters(TOOL, []), []);
});

Deno.test("parseFrappeFilters - accepts 3-element filters with every value type", () => {
  const filters = [
    ["status", "=", "Open"],
    ["grand_total", ">", 100],
    ["disabled", "=", false],
    ["customer", "is", null],
    ["status", "in", ["Open", "Closed"]],
    ["docstatus", "not in", [0, 2]],
    ["creation", "between", ["2026-01-01", "2026-12-31"]],
    ["status", "like", ""],
    // Frappe defaults an empty operator to "=".
    ["status", "", "Open"],
  ];
  assertEquals<unknown>(parseFrappeFilters(TOOL, filters), filters);
});

Deno.test("parseFrappeFilters - accepts 4-element child-table filters", () => {
  const filters = [
    ["Sales Invoice Item", "sales_order", "=", "SO-0001"],
    ["Sales Invoice Item", "qty", ">", 5],
    ["Sales Invoice Item", "item_code", "in", ["A", "B"]],
    ["Sales Invoice Item", "warehouse", "is", null],
  ];
  assertEquals<unknown>(parseFrappeFilters(TOOL, filters), filters);
});

Deno.test("parseFrappeFilters - keeps 3.0.x string tuples longer than 4 (Frappe keeps the first 4)", () => {
  const legacy = [["a", "b", "c", "d", "e"]];
  assertEquals<unknown>(parseFrappeFilters(TOOL, legacy), legacy);
});

Deno.test("parseFrappeFilters - rejects what Frappe rejects: fewer than 3 elements", () => {
  for (const entry of [[], ["status"], ["status", "="]]) {
    const error = rejection(() => parseFrappeFilters(TOOL, [entry]));
    assertEquals(error.code, "INVALID_FILTER");
    assertEquals(error.context.index, 0);
    assertEquals(error.context.arity, entry.length);
    assert(error.message.includes("expected 3 or 4"), error.message);
  }
});

Deno.test('parseFrappeFilters - says "empty string" and does not alias the caller\'s tuple', () => {
  const entry = ["", "=", "x"];
  const error = rejection(() => parseFrappeFilters(TOOL, [entry]));
  assert(error.message.includes("got empty string"), error.message);
  assert(!error.message.includes("got string"), error.message);
  // The context carries no reference to the caller's own array.
  assertEquals(error.context.filter, undefined);
  entry.push("mutated");
  assertEquals(error.context.index, 0);
});

Deno.test("parseFrappeFilters - names the offending entry", () => {
  const error = rejection(() =>
    parseFrappeFilters(TOOL, [["status", "=", "Open"], ["docstatus", "="]])
  );
  assert(error.message.includes("filters[1]"), error.message);
  assert(error.message.includes('["docstatus","="]'), error.message);
  assertEquals(error.context.index, 1);
});

Deno.test("parseFrappeFilters - rejects non-array filters and non-array entries", () => {
  for (
    const raw of [
      "status = Open",
      { status: "Open" },
      42,
      null,
      // A flat tuple is the classic mistake: it reads as three bad entries.
      ["status", "=", "Open"],
      [{ status: "Open" }],
      [null],
    ]
  ) {
    assertEquals(
      rejection(() => parseFrappeFilters(TOOL, raw)).code,
      "INVALID_FILTER",
      JSON.stringify(raw),
    );
  }
});

Deno.test("parseFrappeFilters - rejects wrongly typed positions", () => {
  const cases: Array<[unknown[], number]> = [
    [["docstatus", 1, 1], 1],
    [[1, "=", 1], 0],
    [["", "=", "x"], 0],
    [[null, "=", "x"], 0],
    [["Sales Invoice Item", 3, "=", "x"], 1],
    [["", "item_code", "=", "x"], 0],
    [["Sales Invoice Item", "item_code", null, "x"], 2],
  ];
  for (const [entry, position] of cases) {
    const error = rejection(() => parseFrappeFilters(TOOL, [entry]));
    assertEquals(error.context.position, position, JSON.stringify(entry));
  }
});

Deno.test("parseFrappeFilters - rejects unsupported values", () => {
  const cases: unknown[][] = [
    ["status", "=", { unexpected: true }],
    ["status", "in", ["Open", false]],
    ["status", "in", [null]],
    ["status", "in", [{}]],
    ["status", "in", [["nested"]]],
    ["grand_total", ">", Number.NaN],
    ["grand_total", ">", Number.POSITIVE_INFINITY],
    ["Sales Invoice Item", "qty", ">", undefined],
    ["Sales Invoice Item", "qty", ">", { $gt: 1 }],
  ];
  for (const entry of cases) {
    const error = rejection(() => parseFrappeFilters(TOOL, [entry]));
    assert(error.detail.includes("invalid value"), error.message);
  }
});

// ── Pagination ──────────────────────────────────────────────────────────────

Deno.test("parsePagination - defaults to 20 rows and no offset", () => {
  assertEquals(parsePagination(TOOL, {}), { limit: 20 });
});

Deno.test("parsePagination - forwards limit and offset untouched", () => {
  assertEquals(parsePagination(TOOL, { limit: 1 }), { limit: 1 });
  assertEquals(parsePagination(TOOL, { limit: 200, offset: 400 }), {
    limit: 200,
    offset: 400,
  });
  assertEquals(parsePagination(TOOL, { limit: 5, offset: 0 }), {
    limit: 5,
    offset: 0,
  });
});

Deno.test("parsePagination - has no server-side ceiling (Frappe has none)", () => {
  assertEquals(parsePagination(TOOL, { limit: 5_001 }), { limit: 5_001 });
  assertEquals(parsePagination(TOOL, { limit: 1_000_000, offset: 250_000 }), {
    limit: 1_000_000,
    offset: 250_000,
  });
  assertEquals(
    parsePagination(TOOL, { limit: Number.MAX_SAFE_INTEGER }).limit,
    Number.MAX_SAFE_INTEGER,
  );
});

Deno.test("parsePagination - limit 0 is Frappe's 'every row'", () => {
  assertEquals(parsePagination(TOOL, { limit: 0 }), { limit: 0 });
  assertEquals(parsePagination(TOOL, { limit: 0, offset: 0 }), {
    limit: 0,
    offset: 0,
  });
});

Deno.test("parsePagination - limit 0 with offset > 0 is refused (Frappe would ignore the offset)", () => {
  const error = rejection(() =>
    parsePagination(TOOL, { limit: 0, offset: 40 })
  );
  assertEquals(error.code, "INVALID_PAGINATION");
  assertEquals(error.context, { limit: 0, offset: 40 });
  assert(error.message.includes("ignores 'offset' (40)"), error.message);
  assert(error.recovery.includes("positive 'limit'"), error.recovery);
});

Deno.test("parsePagination - rejects anything but a safe non-negative integer", () => {
  const invalid: Array<[string, Record<string, unknown>]> = [
    ["limit", { limit: -1 }],
    ["limit", { limit: 20.5 }],
    ["limit", { limit: "20" }],
    ["limit", { limit: null }],
    ["limit", { limit: true }],
    ["limit", { limit: Number.NaN }],
    ["limit", { limit: Number.POSITIVE_INFINITY }],
    // 1e21 is an "integer" for JSON Schema but String(1e21) is "1e+21".
    ["limit", { limit: 1e21 }],
    ["offset", { offset: -1 }],
    ["offset", { offset: 1.5 }],
    ["offset", { offset: "0" }],
    ["offset", { offset: null }],
    ["offset", { offset: 1e21 }],
  ];
  for (const [field, input] of invalid) {
    const error = rejection(() => parsePagination(TOOL, input));
    assertEquals(error.code, "INVALID_PAGINATION");
    assertEquals(error.context.field, field, JSON.stringify(input));
  }
});

// ── Child-table ordering / de-duplication ───────────────────────────────────

const CHILD = ["Sales Invoice Item", "sales_order", "=", "SO-1"];

Deno.test("hasChildTableFilter - only a filter on another doctype joins a child table", () => {
  assertEquals(hasChildTableFilter("Sales Invoice", []), false);
  assertEquals(
    hasChildTableFilter("Sales Invoice", [["status", "=", "Paid"]]),
    false,
  );
  assertEquals(hasChildTableFilter("Sales Invoice", [CHILD]), true);
  // A 4-element filter that names the listed doctype itself joins nothing.
  assertEquals(
    hasChildTableFilter("Sales Invoice", [[
      "Sales Invoice",
      "status",
      "=",
      "x",
    ]]),
    false,
  );
  // 3.0.x tuples longer than 4 are read by Frappe as 4-element filters.
  assertEquals(
    hasChildTableFilter("Sales Invoice", [[...CHILD, "extra"]]),
    true,
  );
});

Deno.test("planListQuery - without a child filter nothing changes from 3.0.x", () => {
  const fields = ["name", "modified"];
  assertEquals(planListQuery("Task", { filters: [], fields }), {
    order_by: "modified desc",
  });
  assertEquals(
    planListQuery("Task", {
      filters: [["status", "=", "Open"]],
      fields,
      order_by: "name asc",
    }),
    { order_by: "name asc" },
  );
  // An explicit empty ordering is forwarded as it always was.
  assertEquals(planListQuery("Task", { filters: [], fields, order_by: "" }), {
    order_by: "",
  });
});

Deno.test("planListQuery - qualifies the default ordering and groups when a child filter joins", () => {
  assertEquals(
    planListQuery("Sales Invoice", {
      filters: [CHILD],
      fields: ["name", "modified"],
    }),
    {
      order_by: "`tabSales Invoice`.modified desc",
      group_by: "`tabSales Invoice`.name",
    },
  );
});

Deno.test("planListQuery - qualifies a simple caller ordering when a child filter joins", () => {
  const plan = (order_by: string) =>
    planListQuery("Timesheet", {
      filters: [["Timesheet Detail", "task", "=", "TASK-1"]],
      fields: ["name"],
      order_by,
    });

  assertEquals(plan("name asc"), {
    order_by: "`tabTimesheet`.name asc",
    group_by: "`tabTimesheet`.name",
  });
  assertEquals(
    plan("modified DESC, name").order_by,
    "`tabTimesheet`.modified DESC, `tabTimesheet`.name",
  );
  assertEquals(plan("creation").order_by, "`tabTimesheet`.creation");
});

Deno.test("planListQuery - qualifies a backtick-quoted bare column too", () => {
  const plan = (order_by: string) =>
    planListQuery("Timesheet", {
      filters: [["Timesheet Detail", "task", "=", "TASK-1"]],
      fields: ["name"],
      order_by,
    });

  assertEquals(plan("`modified` desc"), {
    order_by: "`tabTimesheet`.modified desc",
    group_by: "`tabTimesheet`.name",
  });
  assertEquals(
    plan("`modified` desc, `name`").order_by,
    "`tabTimesheet`.modified desc, `tabTimesheet`.name",
  );
});

Deno.test("planListQuery - leaves already qualified or computed orderings alone", () => {
  const plan = (order_by: string) =>
    planListQuery("Sales Invoice", {
      filters: [CHILD],
      fields: ["name"],
      order_by,
    });

  // Qualified on the parent: kept, still one row per document.
  assertEquals(plan("`tabSales Invoice`.posting_date desc"), {
    order_by: "`tabSales Invoice`.posting_date desc",
    group_by: "`tabSales Invoice`.name",
  });
  // Qualified on the child, or an expression: the caller wants the joined
  // rows, so no group_by and no rewriting.
  assertEquals(plan("`tabSales Invoice Item`.idx asc"), {
    order_by: "`tabSales Invoice Item`.idx asc",
  });
  assertEquals(plan("field(status, 'Open', 'Paid')"), {
    order_by: "field(status, 'Open', 'Paid')",
  });
  // Mixed: the bare column is qualified, the child one is not touched.
  assertEquals(plan("modified desc, `tabSales Invoice Item`.idx"), {
    order_by: "`tabSales Invoice`.modified desc, `tabSales Invoice Item`.idx",
  });
});

Deno.test("planListQuery - keeps the joined rows when child columns or expressions are selected", () => {
  for (
    const fields of [
      ["name", "`tabSales Invoice Item`.qty"],
      ["name", "count(*) as total"],
      ["name", "customer as c"],
    ]
  ) {
    assertEquals(
      planListQuery("Sales Invoice", { filters: [CHILD], fields }),
      { order_by: "`tabSales Invoice`.modified desc" },
      JSON.stringify(fields),
    );
  }
  // "*" only expands to the parent's columns.
  assertEquals(
    planListQuery("Sales Invoice", { filters: [CHILD], fields: ["*"] })
      .group_by,
    "`tabSales Invoice`.name",
  );
});

Deno.test("planListQuery - an empty caller ordering falls back to Frappe's own default", () => {
  assertEquals(
    planListQuery("Sales Invoice", {
      filters: [CHILD],
      fields: ["name"],
      order_by: "  ",
    }),
    {},
  );
});

Deno.test("planListQuery - a doctype Frappe's order-by sanitizer would refuse is never quoted", () => {
  // db_query.py only lets [a-z0-9-_ ,`'".()] through: an accented doctype
  // name cannot be wrapped as `tabÉcriture`.<column>.
  const doctype = "Écriture";
  const filters = [["Écriture Ligne", "compte", "=", "X"]];
  assertEquals(planListQuery(doctype, { filters, fields: ["name"] }), {});
  assertEquals(
    planListQuery(doctype, { filters, fields: ["name"], order_by: "name asc" }),
    { order_by: "name asc" },
  );
});

// ── Advertised schema ───────────────────────────────────────────────────────

Deno.test("FRAPPE_FILTERS_INPUT_SCHEMA - documents both forms and the error code", () => {
  const description = FRAPPE_FILTERS_INPUT_SCHEMA.description ?? "";
  for (
    const needle of [
      "[fieldname, operator, value]",
      "[child doctype, fieldname, operator, value]",
      "INVALID_FILTER",
    ]
  ) {
    assert(description.includes(needle), needle);
  }
});
