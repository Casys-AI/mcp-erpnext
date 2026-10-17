/**
 * Tests du retour affiché après le partage d'une sélection.
 *
 * Le canal emprunté (contexte, message ou rien) est décidé par le contrôleur
 * de contexte actif ; `drill-down.ts` n'en garde que le libellé de retour,
 * traduit dans la langue courante.
 */

import { assertEquals } from "@std/assert";
import { type DrillDownChannel, sharedLabel } from "./drill-down.ts";
import { setLangSource } from "./i18n.ts";

Deno.test("sharedLabel : un libellé par canal, null pour none", () => {
  setLangSource(() => "fr-FR");
  const labels: Record<DrillDownChannel, string | null> = {
    context: "Sélection partagée — demandez le détail dans la conversation",
    message: "Envoyé à la conversation",
    none: null,
  };
  for (const [channel, label] of Object.entries(labels)) {
    assertEquals(sharedLabel(channel as DrillDownChannel), label);
  }
});
