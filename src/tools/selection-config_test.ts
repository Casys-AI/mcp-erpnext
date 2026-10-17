import { assert, assertEquals, assertThrows } from "@std/assert";
import { getCategories } from "./mod.ts";
import { readSelectionConfig } from "./selection-config.ts";
import { resolveToolSelection, ToolFilterError } from "./selection.ts";

const envOf = (vars: Record<string, string | undefined>) => (key: string) =>
  vars[key];
const noEnv = envOf({});

Deno.test("readSelectionConfig - nothing set means nothing defined", () => {
  const config = readSelectionConfig(["--http", "--port=1"], noEnv);
  assertEquals(config, { sources: {}, warnings: [] });
});

Deno.test("readSelectionConfig - parses the three CLI flags", () => {
  const config = readSelectionConfig(
    [
      "--categories=sales,inventory",
      "--exclude-categories=buy",
      "--exclude-tools=erpnext_file_list,erpnext_file_upload",
    ],
    noEnv,
  );
  assertEquals(config.categories, ["sales", "inventory"]);
  assertEquals(config.excludeCategories, ["buy"]);
  assertEquals(config.excludeTools, [
    "erpnext_file_list",
    "erpnext_file_upload",
  ]);
  assertEquals(config.sources, {
    categories: "cli",
    excludeCategories: "cli",
    excludeTools: "cli",
  });
});

Deno.test("readSelectionConfig - parses the three environment variables", () => {
  const config = readSelectionConfig(
    [],
    envOf({
      ERPNEXT_CATEGORIES: "sales",
      ERPNEXT_EXCLUDE_CATEGORIES: "buy,operations",
      ERPNEXT_EXCLUDE_TOOLS: "erpnext_file_list",
    }),
  );
  assertEquals(config.categories, ["sales"]);
  assertEquals(config.excludeCategories, ["buy", "operations"]);
  assertEquals(config.excludeTools, ["erpnext_file_list"]);
  assertEquals(config.sources, {
    categories: "env",
    excludeCategories: "env",
    excludeTools: "env",
  });
});

Deno.test("readSelectionConfig - CLI wins over env, per option", () => {
  const config = readSelectionConfig(
    ["--exclude-categories=buy"],
    envOf({
      ERPNEXT_EXCLUDE_CATEGORIES: "operations",
      ERPNEXT_EXCLUDE_TOOLS: "erpnext_file_list",
    }),
  );
  assertEquals(config.excludeCategories, ["buy"]);
  assertEquals(config.excludeTools, ["erpnext_file_list"]);
  assertEquals(config.sources, {
    excludeCategories: "cli",
    excludeTools: "env",
  });
});

Deno.test("readSelectionConfig - blank or missing env var is not set", () => {
  for (const blank of ["", "   ", "\t\n"]) {
    const config = readSelectionConfig(
      [],
      envOf({
        ERPNEXT_CATEGORIES: blank,
        ERPNEXT_EXCLUDE_CATEGORIES: blank,
        ERPNEXT_EXCLUDE_TOOLS: blank,
      }),
    );
    assertEquals(config, { sources: {}, warnings: [] });
  }
});

Deno.test("readSelectionConfig - trims, drops empty entries and duplicates", () => {
  const config = readSelectionConfig(
    ["--exclude-tools= erpnext_a , ,erpnext_b,erpnext_a,"],
    noEnv,
  );
  assertEquals(config.excludeTools, ["erpnext_a", "erpnext_b"]);
});

Deno.test("readSelectionConfig - exclusion flag without '=' fails instead of being ignored", () => {
  for (
    const [flag, key] of [
      ["--exclude-categories", "excludeCategories"],
      ["--exclude-tools", "excludeTools"],
    ]
  ) {
    const error = assertThrows(
      () => readSelectionConfig([flag, "buy"], noEnv),
      ToolFilterError,
    );
    assertEquals(error.code, "INVALID_TOOL_FILTER");
    assertEquals(error.reason, "MALFORMED_FLAG");
    assertEquals(error.context.option, key);
    assertEquals(error.context.flag, flag);
    assert(error.recovery.includes(`${flag}=a,b`));
  }
});

Deno.test("readSelectionConfig - legacy bare or spaced --categories is ignored with a warning", () => {
  for (const args of [["--categories"], ["--categories", "sales"]]) {
    const config = readSelectionConfig(args, noEnv);
    assertEquals(config.categories, undefined);
    assertEquals(config.sources.categories, undefined);
    assertEquals(config.warnings.length, 1);
    assertEquals(config.warnings[0].code, "INVALID_TOOL_FILTER");
    assertEquals(config.warnings[0].reason, "MALFORMED_FLAG");
    assertEquals(config.warnings[0].context.ignored, true);
    assertEquals(config.warnings[0].context.received, args.join(" "));
    assertEquals(
      resolveToolSelection(config).tools,
      resolveToolSelection().tools,
    );
  }
});

Deno.test("readSelectionConfig - ignored legacy flag keeps valid CLI and environment sources", () => {
  const fromEnv = readSelectionConfig(
    ["--categories", "sales"],
    envOf({ ERPNEXT_CATEGORIES: "inventory" }),
  );
  assertEquals(fromEnv.categories, ["inventory"]);
  assertEquals(fromEnv.sources.categories, "env");

  const fromCli = readSelectionConfig(
    ["--categories", "sales", "--categories=hr"],
    envOf({ ERPNEXT_CATEGORIES: "inventory" }),
  );
  assertEquals(fromCli.categories, ["hr"]);
  assertEquals(fromCli.sources.categories, "cli");
  assertEquals(fromCli.warnings.length, 1);
});

Deno.test("readSelectionConfig - empty CLI value fails (no silent 0-tool server)", () => {
  for (
    const arg of [
      "--categories=",
      "--exclude-categories=",
      "--exclude-tools=",
      "--exclude-tools= , ",
    ]
  ) {
    const error = assertThrows(
      () => readSelectionConfig([arg], noEnv),
      ToolFilterError,
    );
    assertEquals(error.reason, "EMPTY_VALUE");
    assertEquals(error.context.source, "cli");
  }
});

Deno.test("readSelectionConfig - an env var with only separators fails", () => {
  const error = assertThrows(
    () => readSelectionConfig([], envOf({ ERPNEXT_EXCLUDE_TOOLS: ",," })),
    ToolFilterError,
  );
  assertEquals(error.reason, "EMPTY_VALUE");
  assertEquals(error.context.source, "env");
  assert(error.message.includes("ERPNEXT_EXCLUDE_TOOLS"));
});

Deno.test("readSelectionConfig - repeated exclusion flag fails, repeated --categories warns and keeps the first", () => {
  const error = assertThrows(
    () =>
      readSelectionConfig(
        ["--exclude-tools=a", "--exclude-tools=b"],
        noEnv,
      ),
    ToolFilterError,
  );
  assertEquals(error.reason, "DUPLICATE_FLAG");

  const config = readSelectionConfig(
    ["--categories=sales", "--categories=hr"],
    noEnv,
  );
  assertEquals(config.categories, ["sales"]);
  assertEquals(config.warnings.length, 1);
  assertEquals(config.warnings[0].reason, "DUPLICATE_FLAG");
});

Deno.test("readSelectionConfig - deterministic for identical input", () => {
  const args = ["--exclude-categories=buy,operations"];
  assertEquals(
    readSelectionConfig(args, noEnv),
    readSelectionConfig(args, noEnv),
  );
});

Deno.test("config -> selection - env exclusion yields the final tool list", () => {
  const config = readSelectionConfig(
    [],
    envOf({ ERPNEXT_EXCLUDE_CATEGORIES: "buy" }),
  );
  const selection = resolveToolSelection(config);
  assert(!selection.tools.some((t) => t.name === "erpnext_buy_capture"));
  assertEquals(
    selection.tools.length,
    resolveToolSelection().tools.length - 1,
  );
});

Deno.test("config -> selection - typo in an exclusion fails, listing valid categories", () => {
  const config = readSelectionConfig(["--exclude-categories=slaes"], noEnv);
  const error = assertThrows(
    () => resolveToolSelection(config),
    ToolFilterError,
  );
  assertEquals(error.reason, "UNKNOWN_CATEGORY");
  assertEquals(error.context.valid, getCategories());
});
