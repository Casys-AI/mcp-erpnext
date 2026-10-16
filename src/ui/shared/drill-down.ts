/**
 * Partage d'une sélection avec la conversation.
 *
 * Un clic sur un point de données — une barre, une étape du funnel, la tuile
 * d'un KPI — ne parle plus à la place de l'utilisateur. Selon ce que l'hôte
 * déclare, il :
 *
 *   1. pousse la sélection dans le contexte du modèle (`updateModelContext`) :
 *      rien ne part tant que l'utilisateur n'écrit pas, seule la dernière
 *      sélection compte, et c'est lui qui formule la demande ;
 *   2. à défaut, envoie le message de drill-down comme avant (`sendMessage`),
 *      si l'hôte a un modèle de l'autre côté ;
 *   3. sinon ne fait rien — et le dit, pour que la vue n'affiche pas un
 *      retour mensonger.
 *
 * Le contexte poussé est borné par construction : un libellé et une valeur.
 * L'action suggérée reste réservée au fallback conversationnel explicite : le
 * contexte ne glisse ainsi aucune consigne cachée au modèle.
 */

import { t } from "./i18n.ts";

export type DrillDownChannel = "context" | "message" | "none";

export interface Selection {
  /** Titre de la vue tel qu'affiché (« Revenue Trend »). */
  view: string;
  /** Le point sélectionné (« Mars », « Leads »). */
  label: string;
  /** Valeur lisible associée (« 21 300 € »), si la vue l'a sous la main. */
  value?: string;
  /** L'action que le serveur suggère pour ce point (`_drillDown` résolu). */
  suggested: string;
}

interface TextBlock {
  type: "text";
  text: string;
}

interface SupportedContextModalities {
  text?: unknown;
  structuredContent?: unknown;
}

interface SupportedMessageModalities {
  text?: unknown;
  structuredContent?: unknown;
}

/** Ce que la vue lit des capacités de l'hôte — le reste ne nous regarde pas. */
export interface HostCapabilities {
  updateModelContext?: SupportedContextModalities;
  message?: SupportedMessageModalities;
  /** Présent uniquement pour garantir qu'il ne vaut jamais capacité message. */
  serverTools?: unknown;
}

/** Le strict nécessaire de `App` — structurel, pour tester sans le SDK. */
export interface DrillDownHost {
  getHostCapabilities(): HostCapabilities | undefined;
  updateModelContext(params: {
    content?: TextBlock[];
    structuredContent?: Record<string, unknown>;
  }): Promise<unknown>;
  sendMessage(
    params: { role: "user"; content: TextBlock[] },
  ): Promise<unknown>;
}

type ContextModality = "text" | "structuredContent";

function advertises(modality: unknown): boolean {
  return typeof modality === "object" && modality !== null;
}

function contextModality(
  caps: HostCapabilities | undefined,
): ContextModality | null {
  if (advertises(caps?.updateModelContext?.text)) return "text";
  if (advertises(caps?.updateModelContext?.structuredContent)) {
    return "structuredContent";
  }
  return null;
}

function canSendTextMessage(caps: HostCapabilities | undefined): boolean {
  return advertises(caps?.message?.text);
}

function requestWasRejected(result: unknown): boolean {
  return typeof result === "object" && result !== null &&
    "isError" in result && result.isError === true;
}

export function drillDownChannel(
  caps: HostCapabilities | undefined,
): DrillDownChannel {
  if (!caps) return "none";
  if (contextModality(caps)) return "context";
  if (canSendTextMessage(caps)) return "message";
  return "none";
}

/** Le texte poussé au modèle : une ligne, dans la langue de l'utilisateur. */
export function selectionContext(sel: Selection): string {
  return t("drill.context", {
    view: sel.view,
    label: sel.label,
    value: sel.value ? ` — ${sel.value}` : "",
  });
}

function selectionStructuredContent(sel: Selection): Record<string, unknown> {
  return {
    selection: {
      view: sel.view,
      label: sel.label,
      ...(sel.value ? { value: sel.value } : {}),
    },
  };
}

async function trySendMessage(
  host: DrillDownHost,
  suggested: string,
): Promise<boolean> {
  try {
    const result = await host.sendMessage({
      role: "user",
      content: [{ type: "text", text: suggested }],
    });
    return !requestWasRejected(result);
  } catch {
    return false;
  }
}

/**
 * Partage la sélection par le meilleur canal disponible et dit lequel.
 *
 * Un refus du contexte retombe sur `message.text` seulement si cette modalité
 * est elle aussi annoncée. Tout refus final vaut « none » : la vue n'a rien à
 * confirmer.
 */
export async function shareSelection(
  host: DrillDownHost,
  sel: Selection,
): Promise<DrillDownChannel> {
  const caps = host.getHostCapabilities();
  const modality = contextModality(caps);

  if (modality) {
    try {
      const params = modality === "text"
        ? { content: [{ type: "text" as const, text: selectionContext(sel) }] }
        : { structuredContent: selectionStructuredContent(sel) };
      const result = await host.updateModelContext(params);
      if (!requestWasRejected(result)) return "context";
    } catch {
      // Un hôte peut refuser une modalité pourtant annoncée. Le message texte
      // explicite reste alors le seul fallback autorisé.
    }

    if (canSendTextMessage(caps) && await trySendMessage(host, sel.suggested)) {
      return "message";
    }
    return "none";
  }

  if (canSendTextMessage(caps) && await trySendMessage(host, sel.suggested)) {
    return "message";
  }
  return "none";
}

/** Le retour à afficher pour le canal emprunté — null quand rien n'est parti. */
export function sharedLabel(channel: DrillDownChannel): string | null {
  switch (channel) {
    case "context":
      return t("drill.shared");
    case "message":
      return t("drill.sent");
    default:
      return null;
  }
}
