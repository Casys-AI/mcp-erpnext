/**
 * Logique pure de navigation pour invoice-viewer.
 * Pas d'import Preact — testable dans Deno directement.
 *
 * Extrait depuis les `_sendMessageHints` du serveur les deux sauts utiles à la
 * vue : le saut vers la liste des paiements (key "payments") et le saut vers la
 * fiche du tiers (key "customer" ou "supplier"). Renvoie null quand un hint est
 * absent ou n'a pas d'outil associé (= question seule, chemin de secours).
 */
import type { Jump, NavHint } from "../../shared/jumps.ts";
import { jumpFromHint } from "../../shared/jumps.ts";

export interface InvoiceJumps {
  payments: Jump | null;
  party: Jump | null;
}

/**
 * Construit les sauts paiements + tiers depuis la liste de hints serveur.
 *
 * @param hints    `_sendMessageHints` du payload ; null/vide → { null, null }.
 * @param vars     Variables à substituer : { id, doctype, party }.
 * @param subtitle Note de pied du niveau ouvert, ex. « liée à SINV-1 ».
 */
export function invoiceJumps(
  hints: NavHint[] | null | undefined,
  vars: Record<string, string>,
  subtitle: string,
): InvoiceJumps {
  if (!hints?.length) return { payments: null, party: null };
  const paymentsHint = hints.find((h) => h.key === "payments") ?? null;
  const partyHint =
    hints.find((h) => h.key === "customer" || h.key === "supplier") ?? null;
  return {
    payments: paymentsHint ? jumpFromHint(paymentsHint, vars, subtitle) : null,
    party: partyHint ? jumpFromHint(partyHint, vars, subtitle) : null,
  };
}
