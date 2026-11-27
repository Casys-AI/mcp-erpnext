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
  funnelStageValueText,
  stageIsJumpable,
  stageNavHint,
} from "./funnel-nav.ts";

Deno.test("funnel stage values display the payload currency in the host locale", () => {
  setLocaleSource(() => "fr-FR");
  assertEquals(
    funnelStageValueText(1234.5, "EUR").replace(/\s/g, ""),
    "1234,50€",
  );
  assertStringIncludes(funnelStageValueText(1234.5, "GBP"), "£");
  setLocaleSource(() => "en-US");
  assertEquals(funnelStageValueText(1234.5, "USD"), "$1,234.50");
});

Deno.test("funnel stage values do not invent a currency or an absent amount", () => {
  setLocaleSource(() => "en-US");
  assertEquals(funnelStageValueText(1234.5, undefined), "1,234.50");
  for (const value of [undefined, null, 0, -1]) {
    assertEquals(funnelStageValueText(value, "EUR"), "—");
  }
});

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

Deno.test("stage click opens only a tool exposed to this viewer", () => {
  const jumps = { Leads: { label: "Leads", tool: "erpnext_lead_list" } };
  assertEquals(stageIsJumpable(jumps, "Leads", true, []), false);
  assertEquals(
    stageIsJumpable(jumps, "Leads", true, ["erpnext_lead_list"]),
    true,
  );
  assertEquals(stageIsJumpable(jumps, "constructor", true), false);
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

Deno.test("funnel charts expose context state and a keyboard shortcut on stages", async () => {
  const source = await Deno.readTextFile(
    new URL("./FunnelViewer.tsx", import.meta.url),
  );
  assertEquals(source.match(/data-visual-item=\{stage.label\}/g)?.length, 2);
  assertEquals(source.includes("onDblClick"), false);
  assertStringIncludes(source, "else onInspect(stage.label)");
  assertStringIncludes(source, "activeContext.activateMany");
  assertEquals(source.includes("<ContextPinButton"), false);
  assertStringIncludes(
    source,
    "aria-pressed={chart.contextEnabled ? pinned : undefined}",
  );
  assertStringIncludes(source, "aria-current={isSelected || undefined}");
  assertStringIncludes(source, "Shift+Space");
  assertEquals(
    source.match(/data-visual-selection-surface=\{chart.contextEnabled/g)
      ?.length,
    2,
  );
  assertEquals(source.match(/touchAction: chart.contextEnabled/g)?.length, 2);
  assertEquals(
    source.match(
      /bg-sunken outline outline-1 outline-accent-edge outline-offset-0/g,
    )
      ?.length,
    2,
  );
  assertStringIncludes(source, '"interaction.detail.ask"');
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
  assertStringIncludes(source, "currency: data.currency");
});
