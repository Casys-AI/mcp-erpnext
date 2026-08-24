/** Contrat minimal d'un hôte capable de recevoir un message texte. */

interface MessageModalities {
  text?: unknown;
}

export interface TextMessageCapabilities {
  message?: MessageModalities;
  /** Une capacité outils n'implique jamais une capacité conversationnelle. */
  serverTools?: unknown;
}

interface TextBlock {
  type: "text";
  text: string;
}

export interface TextMessageHost {
  getHostCapabilities(): TextMessageCapabilities | undefined;
  sendMessage(params: {
    role: "user";
    content: TextBlock[];
  }): Promise<unknown>;
}

function advertises(modality: unknown): boolean {
  return typeof modality === "object" && modality !== null;
}

/** Seule la modalité `message.text` autorise une action conversationnelle. */
export function canSendTextMessage(
  caps: TextMessageCapabilities | undefined,
): boolean {
  return advertises(caps?.message?.text);
}

/**
 * Envoie un message seulement si l'hôte l'annonce et confirme le succès.
 * Certains hôtes résolvent la promesse avec `isError: true` : ce n'est pas un
 * succès et les appelants ne doivent pas l'afficher comme tel.
 */
export async function sendTextMessage(
  host: TextMessageHost,
  message: string,
): Promise<boolean> {
  if (!canSendTextMessage(host.getHostCapabilities())) return false;
  try {
    const result = await host.sendMessage({
      role: "user",
      content: [{ type: "text", text: message }],
    });
    return !(typeof result === "object" && result !== null &&
      "isError" in result && result.isError === true);
  } catch {
    return false;
  }
}
