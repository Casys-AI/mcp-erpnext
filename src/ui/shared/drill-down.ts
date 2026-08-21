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
 * Le texte poussé est borné par construction : un libellé, une valeur, une
 * action suggérée. Pas de liste, pas de payload — un point, comme au clic.
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

/** Ce que la vue lit des capacités de l'hôte — le reste ne nous regarde pas. */
export interface HostCapabilities {
  updateModelContext?: unknown;
  message?: unknown;
  serverTools?: unknown;
}

/** Le strict nécessaire de `App` — structurel, pour tester sans le SDK. */
export interface DrillDownHost {
  getHostCapabilities(): HostCapabilities | undefined;
  updateModelContext(params: { content: TextBlock[] }): Promise<unknown>;
  sendMessage(
    params: { role: "user"; content: TextBlock[] },
  ): Promise<unknown>;
}

export function drillDownChannel(
  caps: HostCapabilities | undefined,
): DrillDownChannel {
  if (!caps) return "none";
  if (caps.updateModelContext) return "context";
  // `message` est la capacité explicite ; `serverTools` est le signal qu'on
  // lisait jusqu'ici — gardé pour les hôtes qui ne déclarent que lui.
  if (caps.message || caps.serverTools) return "message";
  return "none";
}

/** Le texte poussé au modèle : une ligne, dans la langue de l'utilisateur. */
export function selectionContext(sel: Selection): string {
  return t("drill.context", {
    view: sel.view,
    label: sel.label,
    value: sel.value ? ` — ${sel.value}` : "",
    suggested: sel.suggested,
  });
}

/**
 * Partage la sélection par le meilleur canal disponible et dit lequel.
 *
 * Un refus de l'hôte vaut « none » : la vue n'a rien à confirmer.
 */
export async function shareSelection(
  host: DrillDownHost,
  sel: Selection,
): Promise<DrillDownChannel> {
  const channel = drillDownChannel(host.getHostCapabilities());
  try {
    if (channel === "context") {
      await host.updateModelContext({
        content: [{ type: "text", text: selectionContext(sel) }],
      });
    } else if (channel === "message") {
      await host.sendMessage({
        role: "user",
        content: [{ type: "text", text: sel.suggested }],
      });
    }
  } catch {
    return "none";
  }
  return channel;
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
