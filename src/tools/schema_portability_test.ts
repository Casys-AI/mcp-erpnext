/**
 * Schema portability across MCP hosts.
 *
 * Every tool's `inputSchema` is copied by the host into its model provider's
 * function declarations, and some hosts refuse the whole tool list over one
 * schema node. This file walks every registered tool and enforces only the
 * rules a host is known to apply. Each rule cites its source, and none is
 * invented: a rule that shipped 3.0.x tools already break without any
 * documented rejection does not belong here.
 *
 * Regression this guards: 3.1.0-beta shipped `erpnext_doc_list.filters` as
 * `{type: "array", anyOf: [...]}` with no `items`, which made VS Code Copilot
 * throw for the whole tool list (same failure as issue #2, fixed in 2.2.0).
 *
 * @module lib/erpnext/tools/schema_portability_test
 */

import { assert, assertEquals } from "@std/assert";
import { allTools } from "./mod.ts";
import { operationsTools } from "./operations.ts";

type Schema = Record<string, unknown>;

interface Violation {
  path: string;
  rule: string;
}

const SUBSCHEMA_MAPS = ["properties", "patternProperties", "dependencies"];
const SUBSCHEMA_SINGLE = [
  "items",
  "additionalProperties",
  "not",
  "if",
  "then",
  "else",
  "contains",
];
const SUBSCHEMA_LISTS = ["anyOf", "allOf", "oneOf", "prefixItems"];

function isSchema(value: unknown): value is Schema {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Calls `visit` on every schema node reachable from `root`, with its JSON path. */
function walk(
  root: unknown,
  visit: (node: Schema, path: string) => void,
  path = "",
): void {
  if (!isSchema(root)) return;
  visit(root, path);
  for (const key of SUBSCHEMA_MAPS) {
    const map = root[key];
    if (isSchema(map)) {
      for (const [name, child] of Object.entries(map)) {
        walk(child, visit, `${path}/${key}/${name}`);
      }
    }
  }
  for (const key of SUBSCHEMA_SINGLE) {
    const child = root[key];
    if (Array.isArray(child)) {
      child.forEach((item, i) => walk(item, visit, `${path}/${key}/${i}`));
    } else {
      walk(child, visit, `${path}/${key}`);
    }
  }
  for (const key of SUBSCHEMA_LISTS) {
    const list = root[key];
    if (Array.isArray(list)) {
      list.forEach((item, i) => walk(item, visit, `${path}/${key}/${i}`));
    }
  }
}

/**
 * Host rules.
 *
 * 1. VS Code Copilot Chat: `array-without-items`.
 *    microsoft/vscode `extensions/copilot/src/extension/tools/common/
 *    toolSchemaNormalizer.ts` (main) throws "tool parameters array type must
 *    have items" for a node with `type === "array"` and no `items`; the loop
 *    over the tools has no try/catch, so one node breaks the whole request
 *    (microsoft/vscode#325618). Independent of the model family.
 *
 * 2. Gemini `parameters` path: `type-with-anyof`.
 *    `processJsonSchema` in @google/genai throws "type and anyOf cannot be
 *    both populated" for a node holding both keys.
 *
 * 3. Gemini `parameters` path: `prefix-items`.
 *    The `parameters` field is an OpenAPI 3.0 subset that has no
 *    `prefixItems` (Gemini API FunctionDeclaration reference).
 *
 * Not enforced: array-valued `type` (e.g. `["string", "array"]` in
 * `assignment.ts`) and `oneOf`. Stable 3.0.x already ships the former and no
 * host rejection is documented for either.
 */
export function findPortabilityViolations(inputSchema: unknown): Violation[] {
  const violations: Violation[] = [];
  walk(inputSchema, (node, path) => {
    if (node.type === "array" && !("items" in node)) {
      violations.push({ path, rule: "array-without-items" });
    }
    if ("type" in node && "anyOf" in node) {
      violations.push({ path, rule: "type-with-anyof" });
    }
    if ("prefixItems" in node) {
      violations.push({ path, rule: "prefix-items" });
    }
  });
  return violations;
}

Deno.test("schema portability - the checker flags the beta.11 doc_list filters node", () => {
  // Shape shipped in 3.1.0-beta.2..beta.11 (see the module comment).
  const betaFilters = {
    type: "object",
    properties: {
      filters: {
        type: "array",
        items: {
          type: "array",
          anyOf: [
            {
              prefixItems: [{ type: "string" }, { type: "string" }, {
                oneOf: [{ type: "string" }, { type: "number" }],
              }],
              minItems: 3,
              maxItems: 3,
            },
            { items: { type: "string" } },
          ],
        },
      },
    },
  };

  assertEquals(findPortabilityViolations(betaFilters), [
    { path: "/properties/filters/items", rule: "array-without-items" },
    { path: "/properties/filters/items", rule: "type-with-anyof" },
    { path: "/properties/filters/items/anyOf/0", rule: "prefix-items" },
  ]);
});

Deno.test("schema portability - the checker accepts a portable nested array", () => {
  assertEquals(
    findPortabilityViolations({
      type: "object",
      properties: {
        rows: {
          type: "array",
          items: { type: "array", items: { anyOf: [{ type: "string" }] } },
        },
      },
    }),
    [],
  );
});

Deno.test("schema portability - every tool input schema passes the host rules", () => {
  assert(allTools.length > 0);
  const offenders = allTools.flatMap((tool) =>
    findPortabilityViolations(tool.inputSchema).map((violation) =>
      `${tool.name}${violation.path}: ${violation.rule}`
    )
  );
  assertEquals(offenders, []);
});

Deno.test("schema portability - erpnext_doc_list filters keep the shape hosts accept", () => {
  const tool = operationsTools.find((t) => t.name === "erpnext_doc_list")!;
  const filters = (tool.inputSchema.properties as Record<string, Schema>)
    .filters;

  assertEquals(filters.type, "array");
  const tuple = filters.items as Schema;
  assertEquals(tuple.type, "array");
  const value = (tuple.items as Schema).anyOf as Schema[];
  assertEquals(
    value.map((branch) => branch.type),
    ["string", "number", "boolean", "null", "array"],
  );
  // The nested in / not in array must carry its own `items`.
  assert(isSchema(value[4].items));

  const serialized = JSON.stringify(filters);
  for (const forbidden of ["prefixItems", "oneOf", '"type":["']) {
    assert(
      !serialized.includes(forbidden),
      `filters must not use ${forbidden}`,
    );
  }
});
