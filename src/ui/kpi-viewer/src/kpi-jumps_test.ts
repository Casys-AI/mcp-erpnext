import { assertEquals, assertStringIncludes } from "@std/assert";
import { createClickIntentArbiter } from "../../shared/click-intent.ts";
import {
  kpiClickAction,
  kpiClickIntent,
  kpiContextEnabled,
  kpiHintKey,
  kpiInteractionPlan,
  type KpiJumps,
  kpiKeyShortcuts,
  kpiNumberAction,
  kpiTrendAction,
} from "./kpi-jumps.ts";

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

Deno.test("kpi interactions : clic simple ou Espace ne touche qu'au contexte", () => {
  assertEquals(kpiInteractionPlan("context", true, true, true), {
    updateContext: true,
    toggleLevel: false,
    sendMessage: false,
  });
  assertEquals(kpiInteractionPlan("context", true, false, true), {
    updateContext: false,
    toggleLevel: false,
    sendMessage: false,
  });
});

Deno.test("kpi interactions : double-clic ou Entree ne touche qu'au detail", () => {
  assertEquals(kpiInteractionPlan("detail", true, true, true), {
    updateContext: false,
    toggleLevel: true,
    sendMessage: false,
  });
  assertEquals(kpiInteractionPlan("detail", false, true, true), {
    updateContext: false,
    toggleLevel: false,
    sendMessage: true,
  });
});

Deno.test("kpi navigation detail is an action, not a mounted disclosure", async () => {
  const source = await Deno.readTextFile(
    new URL("./KpiViewer.tsx", import.meta.url),
  );

  assertEquals(source.includes("expandedTriggerKey"), false);
  assertEquals(source.includes("aria-expanded"), false);
  assertEquals(source.includes("DetailToggleButton"), false);
  assertStringIncludes(source, "onOpenJump");
  assertStringIncludes(source, "void nav.jump(jump)");
});

Deno.test("kpi sparkline wires explicit months to independent context targets", async () => {
  const source = await Deno.readTextFile(
    new URL("./KpiViewer.tsx", import.meta.url),
  );

  assertStringIncludes(source, "kpiSparklinePoints(data)");
  assertStringIncludes(source, "kpiTrendContextResource(data)");
  assertStringIncludes(source, "labels={sparklineLabels}");
  assertStringIncludes(source, "ariaLabels={trendPointAriaLabels}");
  assertStringIncludes(
    source,
    'class="group pointer-events-auto flex h-full',
  );
  assertStringIncludes(source, "event.stopPropagation()");
  assertStringIncludes(
    source,
    "activeContext.isSelected(trendPointContexts[index])",
  );
  assertStringIncludes(source, "onDblClick={trendDblClickEnabled");
  assertEquals(source.includes('role={trendInteractive ? "button"'), false);
  assertEquals(source.includes("event.detail > 0"), false);
});

// ── Grammaire du clic : élément × contexte disponible ─────────────────────

Deno.test("kpi-jumps : seule une courbe peut porter un contexte", () => {
  assertEquals(kpiContextEnabled(true, true), true);
  assertEquals(kpiContextEnabled(true, false), false); // KPI scalaire, hôte capable
  assertEquals(kpiContextEnabled(false, true), false); // courbe, hôte sans contexte
  assertEquals(kpiContextEnabled(false, false), false);
});

Deno.test("kpi-jumps : table de vérité de kpiClickAction (contexte × saut × message)", () => {
  const rows: Array<[boolean, boolean, boolean, string]> = [
    // contextEnabled, hasJump, hasMessage → clic simple
    [true, true, true, "context"],
    [true, true, false, "context"],
    [true, false, true, "context"],
    [true, false, false, "context"],
    [false, true, true, "detail"],
    [false, true, false, "detail"],
    [false, false, true, "none"], // message seul : jamais au clic
    [false, false, false, "none"],
  ];
  for (const [context, jump, message, expected] of rows) {
    assertEquals(
      kpiClickAction(context, jump, message),
      expected,
      `context=${context} jump=${jump} message=${message}`,
    );
  }
});

Deno.test("kpi-jumps : le title annonce toujours le geste réellement actif", () => {
  // Détail local sans contexte : le clic ouvre (clés autrefois mortes).
  assertEquals(
    kpiHintKey("number", false, true, false),
    "kpi.drilldown.title_detail",
  );
  assertEquals(
    kpiHintKey("trend", false, true, false),
    "kpi.drilldown.title_trend",
  );
  // Message seul : double-clic ou Entrée, pas un clic.
  assertEquals(
    kpiHintKey("number", false, false, true),
    "kpi.drilldown.title_message",
  );
  assertEquals(
    kpiHintKey("trend", false, false, true),
    "kpi.drilldown.title_message",
  );
  // Contexte + détail : les deux gestes.
  assertEquals(
    kpiHintKey("number", true, true, false),
    "kpi.drilldown.title_context",
  );
  assertEquals(
    kpiHintKey("trend", true, false, true),
    "kpi.drilldown.title_context",
  );
  // Aucun détail : aucun title trompeur.
  assertEquals(kpiHintKey("number", false, false, false), undefined);
  assertEquals(kpiHintKey("number", true, false, false), undefined);
});

Deno.test("kpi-jumps : aria-keyshortcuts suit les gestes actifs", () => {
  assertEquals(kpiKeyShortcuts(true, true, false), "Space Enter");
  assertEquals(kpiKeyShortcuts(true, false, false), "Space Enter");
  assertEquals(kpiKeyShortcuts(false, true, false), "Enter Space");
  assertEquals(kpiKeyShortcuts(false, false, true), "Enter");
  assertEquals(kpiKeyShortcuts(false, false, false), undefined);
});

/** Rejoue un élément KPI complet : dérivation du mode, intent, arbitre. */
function kpiElement(options: {
  sparkline: boolean;
  contextSupported: boolean;
  hasJump: boolean;
  hasMessage: boolean;
}) {
  const events: string[] = [];
  const contextEnabled = kpiContextEnabled(
    options.contextSupported,
    options.sparkline,
  );
  const click = kpiClickAction(
    contextEnabled,
    options.hasJump,
    options.hasMessage,
  );
  const intent = kpiClickIntent({
    key: "kpi:Revenue:value",
    click,
    hasJump: options.hasJump,
    onSingle: () => {
      if (!contextEnabled) return;
      events.push("context");
      return () => {
        events.push("revert");
      };
    },
    onDouble: () => events.push(options.hasJump ? "jump" : "message"),
  });
  const arbiter = createClickIntentArbiter(() => () => {});
  return { arbiter, intent, events, click };
}

const KPI_ELEMENT_MATRIX = [
  // Scalaire (outstanding, overdue, orders, margin) : jamais de contexte.
  {
    name: "scalar, host with context, jump",
    sparkline: false,
    contextSupported: true,
    hasJump: true,
    hasMessage: false,
    click: ["jump"],
    enter: ["jump"],
  },
  {
    name: "scalar, host without context, jump",
    sparkline: false,
    contextSupported: false,
    hasJump: true,
    hasMessage: false,
    click: ["jump"],
    enter: ["jump"],
  },
  {
    name: "scalar, host without context, message only",
    sparkline: false,
    contextSupported: false,
    hasJump: false,
    hasMessage: true,
    click: [], // jamais un message fabriqué au clic
    enter: ["message"],
  },
  // Sparkline (revenue) : le contexte réserve le clic quand l'hôte l'accepte.
  {
    name: "sparkline, host with context, jump",
    sparkline: true,
    contextSupported: true,
    hasJump: true,
    hasMessage: false,
    click: ["context"],
    enter: ["jump"],
  },
  {
    name: "sparkline, host without context, jump",
    sparkline: true,
    contextSupported: false,
    hasJump: true,
    hasMessage: false,
    click: ["jump"],
    enter: ["jump"],
  },
  {
    name: "sparkline, host without context, message only",
    sparkline: true,
    contextSupported: false,
    hasJump: false,
    hasMessage: true,
    click: [],
    enter: ["message"],
  },
] as const;

for (const row of KPI_ELEMENT_MATRIX) {
  Deno.test(`kpi element matrix - ${row.name}: click, then Enter`, () => {
    const clicked = kpiElement(row);
    clicked.arbiter.click(clicked.intent, 1);
    assertEquals(clicked.events, [...row.click]);

    const entered = kpiElement(row);
    entered.arbiter.keyDown(entered.intent, {
      key: "Enter",
      preventDefault() {},
    });
    assertEquals(entered.events, [...row.enter]);
  });
}

Deno.test("kpi element matrix - a scalar click on a host with context still opens the detail once through a native double-click", () => {
  const scalar = kpiElement({
    sparkline: false,
    contextSupported: true,
    hasJump: true,
    hasMessage: false,
  });
  assertEquals(scalar.click, "detail");

  scalar.arbiter.click(scalar.intent, 1);
  scalar.arbiter.click(scalar.intent, 2);
  scalar.arbiter.doubleClick(scalar.intent);

  assertEquals(scalar.events, ["jump"]);
});
