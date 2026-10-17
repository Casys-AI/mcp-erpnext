/**
 * Tests unitaires pour funnel-nav.ts — logique pure, sans Preact.
 *
 * Conventions :
 * - cas limites en premier
 * - imports avec extension .ts (Deno strict mode)
 */

import { assertEquals, assertStringIncludes } from "@std/assert";
import { setLocaleSource } from "../../shared/format.ts";
import {
  funnelStageInteractionPlan,
  funnelStageValueText,
  stageIsJumpable,
  stageNavHint,
} from "./funnel-nav.ts";

// ── stageNavHint ────────────────────────────────────────────────────────────

Deno.test("stageNavHint : retourne null quand stageJumps est undefined", () => {
  assertEquals(stageNavHint(undefined, "Leads"), null);
});

Deno.test("stageNavHint : retourne null quand stageJumps est vide", () => {
  assertEquals(stageNavHint({}, "Leads"), null);
});

Deno.test("stageNavHint : retourne null pour un libellé inconnu", () => {
  const jumps = {
    "Leads": { label: "Leads", tool: "erpnext_lead_list", args: {} },
  };
  assertEquals(stageNavHint(jumps, "Unknown"), null);
});

Deno.test("stageNavHint : retourne le hint de l'étape quand il existe", () => {
  const hint = {
    label: "Leads",
    tool: "erpnext_lead_list",
    args: { limit: 20 },
    kind: "list" as const,
  };
  const jumps = { "Leads": hint };
  assertEquals(stageNavHint(jumps, "Leads"), hint);
});

Deno.test("stageNavHint : retourne le hint même sans propriété tool (cas edge)", () => {
  // Un hint sans tool → jumpFromHint() retournera null côté appelant.
  // stageNavHint ne filtre pas : il laisse l'appelant décider.
  const hint = { label: "Leads", args: {} };
  const jumps = { "Leads": hint };
  assertEquals(stageNavHint(jumps, "Leads"), hint);
});

// ── stageIsJumpable ─────────────────────────────────────────────────────────

Deno.test("stageIsJumpable : false si jumpsEnabled est false", () => {
  const jumps = {
    "Leads": { label: "Leads", tool: "erpnext_lead_list", args: {} },
  };
  assertEquals(stageIsJumpable(jumps, "Leads", false), false);
});

Deno.test("stageIsJumpable : false si stageJumps est undefined", () => {
  assertEquals(stageIsJumpable(undefined, "Leads", true), false);
});

Deno.test("stageIsJumpable : false si le libellé est absent", () => {
  const jumps = {
    "Leads": { label: "Leads", tool: "erpnext_lead_list", args: {} },
  };
  assertEquals(stageIsJumpable(jumps, "Orders", true), false);
});

Deno.test("stageIsJumpable : false si le hint n'a pas de tool", () => {
  const jumps = { "Leads": { label: "Leads", args: {} } };
  assertEquals(stageIsJumpable(jumps, "Leads", true), false);
});

Deno.test("stageIsJumpable : true quand jumpsEnabled, étape connue, tool présent", () => {
  const jumps = {
    "Leads": {
      label: "Leads",
      tool: "erpnext_lead_list",
      args: { limit: 20 },
      kind: "list" as const,
    },
    "Opportunities": {
      label: "Opportunities",
      tool: "erpnext_opportunity_list",
      args: {},
      kind: "list" as const,
    },
  };
  assertEquals(stageIsJumpable(jumps, "Leads", true), true);
  assertEquals(stageIsJumpable(jumps, "Opportunities", true), true);
});

Deno.test("funnel interactions : clic simple ou Espace n'active que le contexte", () => {
  assertEquals(funnelStageInteractionPlan("context", true, true, true), {
    updateContext: true,
    toggleLevel: false,
    sendMessage: false,
  });
  assertEquals(funnelStageInteractionPlan("context", true, false, true), {
    updateContext: false,
    toggleLevel: false,
    sendMessage: false,
  });
});

Deno.test("funnel interactions : double-clic, Entree ou chevron n'active que le detail", () => {
  assertEquals(funnelStageInteractionPlan("detail", true, true, true), {
    updateContext: false,
    toggleLevel: true,
    sendMessage: false,
  });
  assertEquals(funnelStageInteractionPlan("detail", false, true, true), {
    updateContext: false,
    toggleLevel: false,
    sendMessage: true,
  });
});

Deno.test("funnel detail navigation is an action, not a mounted disclosure", async () => {
  const source = await Deno.readTextFile(
    new URL("./FunnelViewer.tsx", import.meta.url),
  );

  assertEquals(source.includes("isDetailExpanded"), false);
  assertEquals(source.includes("aria-expanded"), false);
  assertStringIncludes(source, "onOpenDetail");
  assertStringIncludes(source, "await nav.jump(jump)");
});

Deno.test("funnel context-only stages forward a fast second click", async () => {
  const source = await Deno.readTextFile(
    new URL("./FunnelViewer.tsx", import.meta.url),
  );

  assertEquals(source.includes("detailAvailable || event.detail < 2"), false);
  assertEquals(
    source.match(/clickIntent\.click\(intent, event\.detail\)/g)?.length,
    2,
  );
});

Deno.test("funnel stage value - carries the payload currency symbol, never a bare number", () => {
  setLocaleSource(() => "en-US");
  try {
    assertEquals(funnelStageValueText(4000, "EUR"), "€4,000.00");
    assertEquals(funnelStageValueText(3500.5, "GBP"), "£3,500.50");
  } finally {
    setLocaleSource(() => undefined);
  }
});

Deno.test("funnel stage value - no amount is a dash, no currency is a plain number, a bad currency degrades", () => {
  setLocaleSource(() => "en-US");
  try {
    assertEquals(funnelStageValueText(undefined, "EUR"), "—");
    assertEquals(funnelStageValueText(null, "EUR"), "—");
    assertEquals(funnelStageValueText(0, "EUR"), "—");
    assertEquals(funnelStageValueText(1200, undefined), "1,200.00");
    assertEquals(funnelStageValueText(1200, "EURO"), "1,200.00 EURO");
  } finally {
    setLocaleSource(() => undefined);
  }
});

Deno.test("funnel wide layout - stage values are formatted with the payload currency", async () => {
  const source = await Deno.readTextFile(
    new URL("./FunnelViewer.tsx", import.meta.url),
  );

  assertStringIncludes(source, "funnelStageValueText(stage.value, currency)");
  assertStringIncludes(source, "currency={data.currency}");
});
