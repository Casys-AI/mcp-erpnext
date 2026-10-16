import {
  type ActiveContextHost,
  type ContextSelectionItem,
  replaceActiveContext,
} from "./active-context.ts";
import { sendTextMessage, type TextMessageHost } from "./host-message.ts";

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

/**
 * Un message de repli ne peut porter une nouvelle sélection que lorsque le
 * contexte distant est vide avec certitude. Sinon le tour conserverait encore
 * le panier confirmé précédent.
 */
export function contextFallbackForConfirmedContext(
  message: string | undefined,
  hasConfirmedContext: boolean,
  remoteContextIsEmpty: boolean,
): string | undefined {
  return !hasConfirmedContext && remoteContextIsEmpty ? message : undefined;
}

export type ActiveContextFlowHost = ActiveContextHost & TextMessageHost;

/**
 * Active le snapshot complet puis, seulement si ce remplacement échoue,
 * tente l'ancien message conversationnel explicite. Un succès contexte ne
 * produit donc jamais un second envoi.
 */
export async function activateContextWithFallback(
  host: ActiveContextFlowHost,
  items: readonly ContextSelectionItem[],
  fallbackMessage?: string,
  isCurrent: () => boolean = () => true,
): Promise<ActiveContextActivation> {
  const contextResult = await replaceActiveContext(host, items);
  // Un remplacement réussi reste une vérité distante, même si la racine a
  // changé pendant l'await. Le hook doit pouvoir la synchroniser avant le
  // clear sérialisé de la nouvelle racine. La génération ne coupe que le
  // fallback conversationnel, qui ne doit jamais partir pour une vue périmée.
  if (contextResult === "shared") return "context";
  if (!isCurrent()) return "superseded";

  const message = fallbackMessage?.trim();
  if (!message) return "none";
  const sent = await sendTextMessage(host, message);
  if (!isCurrent()) return "superseded";
  return sent ? "message" : "none";
}
