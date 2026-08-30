/**
 * Logique pure des sauts KPI — sans import Preact, testée seule sous Deno.
 *
 * Règle : si jumpsEnabled ET que le hint porte un outil → Jump (pile).
 * Sinon : drillDown inchangé (phrase au modèle), ou null si rien n'est dispo.
 */

import { type Jump, jumpFromHint, type NavHint } from "../../shared/jumps.ts";

/** La paire de sauts portée par `_jumps` dans la réponse du serveur. */
export interface KpiJumps {
  number?: NavHint;
  trend?: NavHint;
}

/** L'action à déclencher quand on clique sur l'élément (nombre ou sparkline). */
export type KpiAction =
  | { kind: "jump"; jump: Jump }
  | { kind: "drill"; message: string }
  | null;

export type KpiActivation = "context" | "detail";

export interface KpiInteractionPlan {
  updateContext: boolean;
  toggleLevel: boolean;
  sendMessage: boolean;
}

/** Les gestes de contexte et de detail restent strictement independants. */
export function kpiInteractionPlan(
  activation: KpiActivation,
  hasJump: boolean,
  contextSupported: boolean,
  messageSupported: boolean,
): KpiInteractionPlan {
  if (activation === "context") {
    return {
      updateContext: contextSupported,
      toggleLevel: false,
      sendMessage: false,
    };
  }
  return {
    updateContext: false,
    toggleLevel: hasJump,
    sendMessage: !hasJump && messageSupported,
  };
}

/**
 * Action pour le nombre principal.
 *
 * - jumpsEnabled + hint number avec outil → saut (empile un niveau).
 * - Sinon, drillDown présent → phrase au modèle.
 * - Sinon → null (non cliquable).
 */
export function kpiNumberAction(
  jumps: KpiJumps | undefined,
  drillDown: string | undefined,
  jumpsEnabled: boolean,
): KpiAction {
  if (jumpsEnabled && jumps?.number) {
    const jump = jumpFromHint(jumps.number, {});
    if (jump) return { kind: "jump", jump };
  }
  if (drillDown) return { kind: "drill", message: drillDown };
  return null;
}

/**
 * Action pour la sparkline / tendance.
 *
 * - jumpsEnabled + hint trend avec outil → saut graphique (BarsLevel).
 * - Sinon, trendDrillDown présent → phrase au modèle.
 * - Sinon → null.
 */
export function kpiTrendAction(
  jumps: KpiJumps | undefined,
  trendDrillDown: string | undefined,
  jumpsEnabled: boolean,
): KpiAction {
  if (jumpsEnabled && jumps?.trend) {
    const jump = jumpFromHint(jumps.trend, {});
    if (jump) return { kind: "jump", jump };
  }
  if (trendDrillDown) return { kind: "drill", message: trendDrillDown };
  return null;
}
