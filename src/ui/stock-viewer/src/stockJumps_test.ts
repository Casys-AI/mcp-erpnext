import { assertEquals } from "@std/assert";
import { setLangSource } from "../../shared/i18n.ts";
import { buildStockRowJump } from "./stockJumps.ts";
import type { NavHint } from "../../shared/jumps.ts";

// Copie des STOCK_HINTS pour les tests — aucune dépendance vers src/tools.
const STOCK_HINTS: NavHint[] = [
  {
    key: "item",
    label: "Item",
    message: "Show item {id}",
    tool: "erpnext_item_get",
    args: { name: "{id}" },
    kind: "record",
  },
  {
    key: "movements",
    label: "Stock entries",
    message: "Show stock entries for item {id}",
    tool: "erpnext_doc_list",
    args: {
      doctype: "Stock Entry",
      fields: ["name", "posting_date", "stock_entry_type", "docstatus"],
      filters: [["Stock Entry Detail", "item_code", "=", "{id}"]],
      limit: 20,
    },
    kind: "list",
  },
  {
    key: "warehouse",
    label: "Warehouse stock",
    message: "Show stock chart for warehouse {warehouse}",
    tool: "erpnext_stock_chart",
    args: { warehouse: "{warehouse}", limit: 10 },
    kind: "chart",
  },
];

// ── Cas limites ────────────────────────────────────────────────────────────

Deno.test("buildStockRowJump — hints vides renvoie null", () => {
  assertEquals(buildStockRowJump([], { id: "A", warehouse: "W" }, "sub"), null);
});

Deno.test("buildStockRowJump — hints undefined renvoie null", () => {
  assertEquals(
    buildStockRowJump(undefined, { id: "A", warehouse: "W" }, "sub"),
    null,
  );
});

Deno.test("buildStockRowJump — hint sans outil renvoie null", () => {
  const hints: NavHint[] = [{ label: "Item", key: "item" }];
  assertEquals(
    buildStockRowJump(hints, { id: "WIDGET-A", warehouse: "W" }, "sub"),
    null,
  );
});

Deno.test("buildStockRowJump — hint sans outil mais avec message : null", () => {
  const hints: NavHint[] = [{ label: "Ask", message: "Tell me {id}" }];
  assertEquals(
    buildStockRowJump(hints, { id: "X", warehouse: "W" }, "sub"),
    null,
  );
});

// ── Cas heureux ────────────────────────────────────────────────────────────

Deno.test("buildStockRowJump — construit la fiche avec ses deux enfants", () => {
  setLangSource(() => "en");
  const jump = buildStockRowJump(
    STOCK_HINTS,
    { id: "WIDGET-A", warehouse: "Stores - C" },
    "linked to WIDGET-A",
  );
  assertEquals(jump?.kind, "record");
  assertEquals(jump?.tool.name, "erpnext_item_get");
  assertEquals(jump?.tool.args["name"], "WIDGET-A");
  assertEquals(jump?.subtitle, "linked to WIDGET-A");
  assertEquals(jump?.children?.length, 2);
});

Deno.test("buildStockRowJump — enfant mouvements : filtre item_code rempli", () => {
  setLangSource(() => "en");
  const jump = buildStockRowJump(
    STOCK_HINTS,
    { id: "GADGET-1", warehouse: "Finished Goods - C" },
    "sub",
  );
  const movChild = jump?.children?.find((c) => c.kind === "list");
  const filters = movChild?.tool.args["filters"] as string[][];
  assertEquals(filters?.[0]?.[3], "GADGET-1");
});

Deno.test("buildStockRowJump — enfant warehouse : template warehouse rempli", () => {
  setLangSource(() => "en");
  const jump = buildStockRowJump(
    STOCK_HINTS,
    { id: "BOLT-M6", warehouse: "Stores - C" },
    "sub",
  );
  const warehouseChild = jump?.children?.find((c) => c.kind === "chart");
  assertEquals(warehouseChild?.tool.args["warehouse"], "Stores - C");
});

Deno.test("buildStockRowJump — warehouse vide : le saut entrepôt est écarté", () => {
  setLangSource(() => "en");
  const hints: NavHint[] = [
    {
      key: "item",
      label: "Item",
      tool: "erpnext_item_get",
      args: { name: "{id}" },
      kind: "record",
    },
    {
      key: "warehouse",
      label: "Warehouse",
      tool: "erpnext_stock_chart",
      args: { warehouse: "{warehouse}" },
      kind: "chart",
    },
  ];
  const jump = buildStockRowJump(hints, { id: "X", warehouse: "" }, "sub");
  // l'article s'ouvre ; le graphique d'entrepôt, sans entrepôt, n'est pas proposé
  assertEquals(jump?.tool.name, "erpnext_item_get");
  assertEquals(
    jump?.children?.some((c) => c.tool.name === "erpnext_stock_chart") ?? false,
    false,
  );
});

Deno.test("buildStockRowJump — un seul hint (item seulement) : children absent", () => {
  setLangSource(() => "en");
  const hints: NavHint[] = [
    {
      key: "item",
      label: "Item",
      tool: "erpnext_item_get",
      args: { name: "{id}" },
      kind: "record",
    },
  ];
  const jump = buildStockRowJump(hints, { id: "X", warehouse: "W" }, "sub");
  assertEquals(jump?.children, undefined);
});

Deno.test("buildStockRowJump — enfant sans outil exclu des children", () => {
  setLangSource(() => "en");
  const hints: NavHint[] = [
    {
      key: "item",
      label: "Item",
      tool: "erpnext_item_get",
      args: { name: "{id}" },
      kind: "record",
    },
    // Ce hint n'a pas d'outil — il sera exclu des children.
    { label: "Ask something", message: "Tell me about {id}" },
  ];
  const jump = buildStockRowJump(hints, { id: "X", warehouse: "W" }, "sub");
  // Le hint sans outil n'apparaît pas dans les children.
  assertEquals(jump?.children, undefined);
});
