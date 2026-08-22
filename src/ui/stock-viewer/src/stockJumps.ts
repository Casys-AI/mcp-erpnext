/**
 * Logique pure de sauts stock — sans import Preact.
 *
 * Le saut principal ouvre la fiche article (premier hint, kind "record").
 * Les hints suivants deviennent les enfants de la fiche (mouvements,
 * entrepôt), proposés par le RecordLevel sous forme de boutons « › ».
 *
 * Importé par StockViewer.tsx et testé seul par stockJumps_test.ts.
 */

// Import relatif pour compatibilité Deno (pas d'alias ~/ en dehors de Vite).
import { type Jump, jumpFromHint, type NavHint } from "../../shared/jumps.ts";

/**
 * Construit le saut de navigation pour une ligne de stock.
 *
 * @param hints    Les hints du résultat serveur (`data._sendMessageHints`).
 * @param vars     Variables à injecter : `id` = item_code, `warehouse`.
 * @param subtitle Sous-titre du niveau empilé (ex. « liées à WIDGET-A »).
 * @returns Le saut vers la fiche article avec ses enfants, ou null si le
 *          premier hint est absent ou ne porte pas d'outil.
 */
export function buildStockRowJump(
  hints: NavHint[] | undefined,
  vars: { id: string; warehouse: string },
  subtitle: string,
): Jump | null {
  if (!hints || hints.length === 0) return null;
  const [hintItem, ...rest] = hints;
  const jump = jumpFromHint(hintItem, vars, subtitle);
  if (!jump) return null;
  const children = rest
    .map((h) => jumpFromHint(h, vars))
    .filter((j): j is Jump => j !== null);
  return {
    ...jump,
    children: children.length > 0 ? children : undefined,
  };
}
