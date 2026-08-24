/**
 * Tests unitaires pour funnel-nav.ts — logique pure, sans Preact.
 *
 * Conventions :
 * - cas limites en premier
 * - imports avec extension .ts (Deno strict mode)
 */

import { assertEquals } from "@std/assert";
import { stageIsJumpable, stageNavHint } from "./funnel-nav.ts";

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
