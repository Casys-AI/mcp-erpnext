/**
 * Logique de navigation du funnel — sans import Preact.
 *
 * Règles :
 * - Ce fichier ne touche pas au DOM et ne dépend d'aucun framework.
 * - Tous les imports utilisent des chemins relatifs .ts pour que Deno
 *   puisse les résoudre lors des tests.
 * - `jumpFromHint` vit dans shared/jumps.ts ; on ne le duplique pas.
 */

import type { NavHint } from "../../shared/jumps.ts";

/**
 * Retourne le hint de saut serveur pour une étape du funnel, ou null.
 *
 * Cas limites :
 * - `stageJumps` absent ou vide → null
 * - `label` non présent dans la map → null
 * - `stageJumps[label]` sans propriété `tool` → le hint est retourné
 *   tel quel (jumpFromHint() retournera null en aval, comportement attendu)
 */
export function stageNavHint(
  stageJumps: Record<string, NavHint> | undefined,
  label: string,
): NavHint | null {
  if (!stageJumps) return null;
  return Object.prototype.hasOwnProperty.call(stageJumps, label)
    ? stageJumps[label]
    : null;
}

/**
 * Indique si une étape possède un saut serveur utilisable.
 * Raccourci : `jumpsEnabled && stageNavHint(stageJumps, label) !== null`.
 */
export function stageIsJumpable(
  stageJumps: Record<string, NavHint> | undefined,
  label: string,
  jumpsEnabled: boolean,
): boolean {
  if (!jumpsEnabled) return false;
  const hint = stageNavHint(stageJumps, label);
  return hint !== null && typeof hint.tool === "string";
}
