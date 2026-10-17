/**
 * Logique pure des sauts KPI — sans import Preact, testée seule sous Deno.
 *
 * Règle : si jumpsEnabled ET que le hint porte un outil → Jump (pile).
 * Sinon : drillDown inchangé (phrase au modèle), ou null si rien n'est dispo.
 */

import {
  type ClickIntent,
  type ClickIntentSingleResult,
  detailOnClickIntent,
} from "../../shared/click-intent.ts";
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

/**
 * Seule une courbe (sparkline) peut être ajoutée au contexte : un KPI scalaire
 * n'a pas de contexte disponible, même sur un hôte qui sait le recevoir.
 */
export function kpiContextEnabled(
  contextSupported: boolean,
  hasSparkline: boolean,
): boolean {
  return contextSupported && hasSparkline;
}

/** Ce que déclenche le clic simple sur un élément KPI. */
export type KpiClickAction = "context" | "detail" | "none";

/**
 * Règle unique : le clic est réservé au contexte quand l'élément peut être
 * sélectionné ; sinon il ouvre le détail local (un saut). Un détail purement
 * conversationnel (message au modèle) ne s'ouvre jamais au clic : le clic
 * reste sans effet (`none`) et le title annonce double-clic / Entrée.
 */
export function kpiClickAction(
  contextEnabled: boolean,
  hasJump: boolean,
  _hasMessage: boolean,
): KpiClickAction {
  if (contextEnabled) return "context";
  return hasJump ? "detail" : "none";
}

/** Libellé et indice du bouton de détail visible d'un élément KPI. */
export interface KpiDetailButtonSpec {
  actionLabelKey: string;
  hintKey: string;
}

/**
 * Bouton « détail » visible, la voie tactile du double-clic ou d'Entrée.
 * Il existe exactement quand ce double-clic est câblé : un détail existe et le
 * clic simple ne l'ouvre pas déjà (`detail`). Un saut ouvre un niveau, un
 * message interroge la conversation : le libellé dit l'action réelle.
 */
export function kpiDetailButtonSpec(
  target: "number" | "trend",
  click: KpiClickAction,
  hasJump: boolean,
  hasMessage: boolean,
): KpiDetailButtonSpec | null {
  if (click === "detail" || (!hasJump && !hasMessage)) return null;
  if (hasJump) {
    return {
      actionLabelKey: target === "number"
        ? "interaction.detail.open"
        : "kpi.drilldown.aria_trend",
      hintKey: "interaction.detail.button_hint",
    };
  }
  return {
    actionLabelKey: target === "number"
      ? "interaction.detail.ask"
      : "kpi.drilldown.aria_trend_ask",
    hintKey: "nav.ask",
  };
}

/**
 * Clé i18n du title de l'élément, ou undefined s'il n'a aucun geste utile.
 * Le texte dit toujours le geste réellement actif.
 */
export function kpiHintKey(
  target: "number" | "trend",
  contextEnabled: boolean,
  hasJump: boolean,
  hasMessage: boolean,
): string | undefined {
  if (!hasJump && !hasMessage) return undefined;
  if (contextEnabled) return "kpi.drilldown.title_context";
  if (hasJump) {
    return target === "number"
      ? "kpi.drilldown.title_detail"
      : "kpi.drilldown.title_trend";
  }
  return "kpi.drilldown.title_message";
}

/** aria-keyshortcuts aligné sur les gestes actifs (jamais un raccourci mort). */
export function kpiKeyShortcuts(
  contextEnabled: boolean,
  hasJump: boolean,
  hasMessage: boolean,
): string | undefined {
  if (contextEnabled) return "Space Enter";
  if (hasJump) return "Enter Space";
  return hasMessage ? "Enter" : undefined;
}

/**
 * L'intent d'arbitre d'un élément KPI. Mode `detail` : intent de détail local
 * (ni action simple, ni conversation). Sinon : clic = contexte, double-clic ou
 * Entrée = détail.
 */
export function kpiClickIntent(target: {
  key: string;
  click: KpiClickAction;
  hasJump: boolean;
  onSingle: () => ClickIntentSingleResult;
  onDouble: () => void;
  runConversation?: (
    action: () => void,
    restored: Promise<boolean>,
  ) => Promise<boolean>;
}): ClickIntent {
  if (target.click === "detail") {
    return detailOnClickIntent(target.key, target.onDouble);
  }
  return {
    key: target.key,
    onSingle: target.onSingle,
    onDouble: target.onDouble,
    runConversation: target.runConversation,
    doublePolicy: target.hasJump ? "local" : "after-context",
  };
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
