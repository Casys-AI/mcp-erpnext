import {
  assert,
  assertEquals,
  assertInstanceOf,
  assertNotEquals,
  assertStrictEquals,
  assertThrows,
} from "@std/assert";
import { allTools, getCategories, toolsByCategory } from "./mod.ts";
import {
  assertNonEmptySelection,
  formatToolFilterMessage,
  isToolFilterError,
  resolveToolSelection,
  ToolFilterError,
} from "./selection.ts";

const FILE_TOOLS = [
  "erpnext_file_list",
  "erpnext_file_upload",
  "erpnext_file_download",
];

const names = (tools: readonly { name: string }[]) => tools.map((t) => t.name);

Deno.test("registry - 15 categories, each tool's category matches its registry key", () => {
  assertEquals(getCategories(), [
    "sales",
    "inventory",
    "accounting",
    "hr",
    "project",
    "purchasing",
    "delivery",
    "manufacturing",
    "crm",
    "assets",
    "operations",
    "setup",
    "analytics",
    "kanban",
    "buy",
  ]);
  for (const [category, tools] of Object.entries(toolsByCategory)) {
    for (const tool of tools) assertEquals(tool.category, category);
  }
  assertEquals(new Set(names(allTools)).size, allTools.length);
});

Deno.test("resolveToolSelection - no option returns allTools itself (stable guard)", () => {
  const selection = resolveToolSelection();
  assertStrictEquals(selection.tools, allTools);
  assertEquals(selection.tools.length, allTools.length);
  assertEquals(selection.categories, undefined);
  assertEquals(selection.warnings, []);
  assertStrictEquals(resolveToolSelection({}).tools, allTools);
});

Deno.test("resolveToolSelection - categories allow-list keeps the given order", () => {
  const selection = resolveToolSelection({ categories: ["sales"] });
  assertEquals(selection.tools.length, toolsByCategory.sales.length);
  assertEquals(names(selection.tools), names(toolsByCategory.sales));

  const ordered = resolveToolSelection({ categories: ["kanban", "sales"] });
  assertEquals(names(ordered.tools), [
    ...names(toolsByCategory.kanban),
    ...names(toolsByCategory.sales),
  ]);
});

Deno.test("resolveToolSelection - duplicate categories are counted once", () => {
  const selection = resolveToolSelection({ categories: ["sales", "sales"] });
  assertEquals(selection.tools.length, toolsByCategory.sales.length);
  assertEquals(selection.categories, ["sales"]);
});

Deno.test("resolveToolSelection - unknown allow-list category is ignored with a warning", () => {
  const selection = resolveToolSelection({ categories: ["sales", "slaes"] });
  assertEquals(selection.tools.length, toolsByCategory.sales.length);
  assertEquals(selection.warnings.length, 1);
  const [warning] = selection.warnings;
  assertEquals(warning.code, "INVALID_TOOL_FILTER");
  assertEquals(warning.reason, "UNKNOWN_CATEGORY");
  assertEquals(warning.context.received, ["slaes"]);
  assertEquals(warning.context.valid, getCategories());
  assert(warning.message.startsWith("[mcp-erpnext] INVALID_TOOL_FILTER: "));
  assert(warning.message.includes("Recovery: "));
});

Deno.test("resolveToolSelection - all-unknown allow-list yields 0 tools without throwing (library compat)", () => {
  const selection = resolveToolSelection({ categories: ["slaes"] });
  assertEquals(selection.tools, []);
  assertEquals(selection.warnings.length, 1);
});

Deno.test("resolveToolSelection - prototype keys are unknown categories, never tools", () => {
  for (
    const key of ["constructor", "toString", "__proto__", "hasOwnProperty"]
  ) {
    const alone = resolveToolSelection({ categories: [key] });
    assertEquals(alone.tools, [], key);
    assertEquals(alone.warnings.length, 1, key);
    assertEquals(alone.warnings[0].reason, "UNKNOWN_CATEGORY", key);
    assertEquals(alone.warnings[0].context.received, [key], key);
    const error = assertThrows(
      () => assertNonEmptySelection(alone),
      ToolFilterError,
    );
    assertEquals(error.reason, "EMPTY_SELECTION", key);

    const mixed = resolveToolSelection({ categories: [key, "sales"] });
    assertEquals(mixed.tools.length, toolsByCategory.sales.length, key);
    assert(mixed.tools.every((t) => typeof t === "object" && t.name), key);
    assertEquals(mixed.warnings.length, 1, key);

    const excluded = assertThrows(
      () => resolveToolSelection({ excludeCategories: [key] }),
      ToolFilterError,
    );
    assertEquals(excluded.reason, "UNKNOWN_CATEGORY", key);
  }
});

Deno.test("resolveToolSelection - excludeCategories removes a whole category", () => {
  const selection = resolveToolSelection({ excludeCategories: ["buy"] });
  assertEquals(selection.tools.length, allTools.length - 1);
  assert(!names(selection.tools).includes("erpnext_buy_capture"));
  assertEquals(selection.excludedCategories, ["buy"]);
  // Registry order is preserved.
  assertEquals(
    names(selection.tools),
    names(allTools).filter((n) => n !== "erpnext_buy_capture"),
  );
});

Deno.test("resolveToolSelection - excludeTools removes only the named tools", () => {
  const selection = resolveToolSelection({ excludeTools: FILE_TOOLS });
  assertEquals(selection.tools.length, allTools.length - FILE_TOOLS.length);
  for (const name of FILE_TOOLS) assert(!names(selection.tools).includes(name));
  for (
    const kept of ["erpnext_doc_get", "erpnext_doc_list", "erpnext_doc_submit"]
  ) {
    assert(names(selection.tools).includes(kept), kept);
  }
});

Deno.test("resolveToolSelection - include, excludeCategories and excludeTools combine", () => {
  const selection = resolveToolSelection({
    categories: ["operations", "sales", "buy"],
    excludeCategories: ["sales"],
    excludeTools: FILE_TOOLS,
  });
  assertEquals(
    names(selection.tools),
    [...names(toolsByCategory.operations), ...names(toolsByCategory.buy)]
      .filter((n) => !FILE_TOOLS.includes(n)),
  );
  assert(names(selection.tools).includes("erpnext_buy_capture"));
});

Deno.test("resolveToolSelection - excluding a tool outside the allow-list is a no-op", () => {
  const selection = resolveToolSelection({
    categories: ["sales"],
    excludeTools: ["erpnext_file_list"],
  });
  assertEquals(selection.tools.length, toolsByCategory.sales.length);
  assertEquals(selection.excludedTools, ["erpnext_file_list"]);
});

Deno.test("resolveToolSelection - excluding every category leaves 0 tools; the boundary guard throws", () => {
  const selection = resolveToolSelection({
    excludeCategories: getCategories(),
  });
  assertEquals(selection.tools, []);
  const error = assertThrows(
    () => assertNonEmptySelection(selection),
    ToolFilterError,
  );
  assertEquals(error.code, "INVALID_TOOL_FILTER");
  assertEquals(error.reason, "EMPTY_SELECTION");
  assertEquals(error.context.valid, getCategories());
  assertNonEmptySelection(resolveToolSelection());
});

Deno.test("resolveToolSelection - unknown excluded category throws a machine-readable error", () => {
  const error = assertThrows(
    () => resolveToolSelection({ excludeCategories: ["buy", "slaes"] }),
    ToolFilterError,
  );
  assertInstanceOf(error, ToolFilterError);
  assert(isToolFilterError(error));
  assertEquals(error.code, "INVALID_TOOL_FILTER");
  assertEquals(error.reason, "UNKNOWN_CATEGORY");
  assertEquals(error.retryable, false);
  assertEquals(error.context.received, ["slaes"]);
  assertEquals(error.context.valid, getCategories());
  assertEquals(error.context.option, "excludeCategories");
  assert(error.recovery.length > 0);
  assert(error.message.includes("valid categories: sales, inventory"));
  assertEquals(
    error.message,
    formatToolFilterMessage(error.detail, error.recovery),
  );
  assertEquals(
    error.message.startsWith(
      '[mcp-erpnext] INVALID_TOOL_FILTER: Unknown category "slaes"',
    ),
    true,
  );
  assert(/\. Recovery: .+$/.test(error.message));
});

Deno.test("resolveToolSelection - unknown excluded tool throws, validated against the full registry", () => {
  const error = assertThrows(
    () => resolveToolSelection({ excludeTools: ["erpnext_nope"] }),
    ToolFilterError,
  );
  assertEquals(error.reason, "UNKNOWN_TOOL");
  assertEquals(error.context.received, ["erpnext_nope"]);
  assertEquals(error.context.valid, names(allTools));
  assert(error.message.includes("erpnext_file_list"));
});

Deno.test("ToolFilterError - context is frozen and cannot be mutated", () => {
  const error = assertThrows(
    () => resolveToolSelection({ excludeTools: ["nope"] }),
    ToolFilterError,
  );
  assert(Object.isFrozen(error.context));
  assertThrows(() => {
    (error.context as Record<string, unknown>).reason = "x";
  });
  assertNotEquals(error.context.reason, "x");
});

Deno.test("resolveToolSelection - deterministic for identical input", () => {
  const options = {
    categories: ["sales", "operations"],
    excludeTools: ["erpnext_file_list"],
  };
  assertEquals(
    names(resolveToolSelection(options).tools),
    names(resolveToolSelection(options).tools),
  );
});
