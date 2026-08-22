import { assertEquals } from "@std/assert";
import { type KpiJumps, kpiNumberAction, kpiTrendAction } from "./kpi-jumps.ts";

// ── Fixtures ──────────────────────────────────────────────────────────────

/** Sauts réalistes issus de KPI_JUMPS["erpnext_kpi_revenue"]. */
const JUMPS: KpiJumps = {
  number: {
    label: "Sales orders this month",
    tool: "erpnext_sales_order_list",
    args: { date_from: "2026-08-01", date_to: "2026-08-31", limit: 20 },
    kind: "list",
  },
  trend: {
    label: "Revenue trend",
    tool: "erpnext_revenue_trend",
    args: { months: 12 },
    kind: "chart",
  },
};

/** Hint sans outil : ne peut produire qu'une question. */
const HINT_NO_TOOL: KpiJumps = {
  number: { label: "Demander", message: "Montre-moi le CA de ce mois" },
};

// ── Tests : cas limites d'abord ───────────────────────────────────────────

Deno.test("kpi-jumps : _jumps absent + drillDown → drill", () => {
  const action = kpiNumberAction(undefined, "Show invoices", true);
  assertEquals(action?.kind, "drill");
  assertEquals(
    (action as { kind: "drill"; message: string }).message,
    "Show invoices",
  );
});

Deno.test("kpi-jumps : _jumps absent + pas de drillDown → null", () => {
  assertEquals(kpiNumberAction(undefined, undefined, true), null);
  assertEquals(kpiTrendAction(undefined, undefined, false), null);
});

Deno.test("kpi-jumps : hint sans outil + jumpsEnabled → retombe sur drillDown", () => {
  const action = kpiNumberAction(HINT_NO_TOOL, "fallback message", true);
  assertEquals(action?.kind, "drill");
  assertEquals(
    (action as { kind: "drill"; message: string }).message,
    "fallback message",
  );
});

Deno.test("kpi-jumps : hint sans outil, pas de drillDown → null", () => {
  assertEquals(kpiNumberAction(HINT_NO_TOOL, undefined, true), null);
});

Deno.test("kpi-jumps : jumpsEnabled=false → retombe sur drillDown même si hint a un outil", () => {
  const action = kpiNumberAction(JUMPS, "Show invoices", false);
  assertEquals(action?.kind, "drill");
  assertEquals(
    (action as { kind: "drill"; message: string }).message,
    "Show invoices",
  );
});

// ── Tests : comportement nominal ──────────────────────────────────────────

Deno.test("kpi-jumps : jumpsEnabled + outil number → jump de type list", () => {
  const action = kpiNumberAction(JUMPS, "Show invoices", true);
  assertEquals(action?.kind, "jump");
  if (action?.kind === "jump") {
    assertEquals(action.jump.kind, "list");
    assertEquals(action.jump.tool.name, "erpnext_sales_order_list");
    assertEquals(action.jump.tool.args, {
      date_from: "2026-08-01",
      date_to: "2026-08-31",
      limit: 20,
    });
  }
});

Deno.test("kpi-jumps : jumpsEnabled + outil trend → jump de type chart", () => {
  const action = kpiTrendAction(JUMPS, "Show trend", true);
  assertEquals(action?.kind, "jump");
  if (action?.kind === "jump") {
    assertEquals(action.jump.kind, "chart");
    assertEquals(action.jump.tool.name, "erpnext_revenue_trend");
    assertEquals(action.jump.tool.args, { months: 12 });
  }
});

Deno.test("kpi-jumps : priorité jump sur drillDown quand jumpsEnabled", () => {
  // Le jump prend le dessus : drillDown est ignoré.
  const number = kpiNumberAction(JUMPS, "Should not be used", true);
  assertEquals(number?.kind, "jump");
  const trend = kpiTrendAction(JUMPS, "Should not be used", true);
  assertEquals(trend?.kind, "jump");
});

Deno.test("kpi-jumps : saut trend absent, number seul → trend retombe sur drillDown", () => {
  const jumpsNoTrend: KpiJumps = { number: JUMPS.number };
  const action = kpiTrendAction(jumpsNoTrend, "Voir la tendance", true);
  assertEquals(action?.kind, "drill");
});
