/**
 * Retour affiché après un clic sur un point de données.
 *
 * Un clic sur un point — une barre, une étape du funnel, la tuile d'un KPI —
 * ne parle plus à la place de l'utilisateur : la sélection est poussée dans le
 * contexte du modèle (voir `active-context.ts`), et c'est lui qui formule la
 * demande. Ce module ne garde que le canal effectivement emprunté et le
 * libellé de confirmation qui lui correspond, pour que la vue n'affiche pas un
 * retour mensonger.
 */

import { t } from "./i18n.ts";

export type DrillDownChannel = "context" | "message" | "none";

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
