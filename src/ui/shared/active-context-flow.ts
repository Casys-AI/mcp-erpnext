import {
  type ActiveContextHost,
  type ContextSelectionItem,
  replaceActiveContext,
} from "./active-context.ts";
import type { TextMessageHost } from "./host-message.ts";

export type ActiveContextActivation =
  | "context"
  | "message"
  | "none"
  | "superseded";

export type ActiveContextPresentationEffect =
  | "replace"
  | "failure"
  | "ignore";

/**
 * Traduit le canal effectivement emprunté en effet d'interface.
 *
 * Un fallback message réussi n'a pas remplacé le contexte distant : l'ancien
 * chip reste donc la seule vérité affichable, accompagné d'un échec discret.
 */
export function activeContextPresentationEffect(
  result: ActiveContextActivation,
): ActiveContextPresentationEffect {
  if (result === "context") return "replace";
  if (result === "superseded") return "ignore";
  return "failure";
}

/** Un saut inline déjà parti ne doit jamais doubler l'action par un prompt. */
export function contextFallbackForInlineJump(
  message: string | undefined,
  jumped: boolean,
): string | undefined {
  return jumped ? undefined : message;
}

export type ActiveContextFlowHost = ActiveContextHost & TextMessageHost;

/**
 * Active le snapshot complet par le contexte distant, et rien d'autre : aucun
 * message conversationnel ne part, ni en succès ni en échec. Un échec vaut
 * « none » ; une requête devenue obsolète vaut « superseded ».
 */
export async function activateContext(
  host: ActiveContextHost,
  items: readonly ContextSelectionItem[],
  isCurrent: () => boolean = () => true,
): Promise<ActiveContextActivation> {
  const contextResult = await replaceActiveContext(host, items);
  // Un remplacement réussi reste une vérité distante, même si la racine a
  // changé pendant l'await. Le hook doit pouvoir la synchroniser avant le
  // clear sérialisé de la nouvelle racine.
  if (contextResult === "shared") return "context";
  return isCurrent() ? "none" : "superseded";
}
