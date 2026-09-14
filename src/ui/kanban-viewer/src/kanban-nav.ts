/**
 * Logique pure de navigation pour le kanban-viewer.
 *
 * Pas d'import Preact — testable directement avec Deno.
 * Les hints que le serveur attache à un résultat (`_sendMessageHints`)
 * sont convertis en sauts de navigation typés.
 */

import type { NavHint } from "../../shared/jumps.ts";

const CARD_LIST_FIELDS: Readonly<Record<string, readonly string[]>> = {
  Task: ["name", "subject", "status", "priority", "project"],
  Opportunity: [
    "name",
    "title",
    "status",
    "party_name",
    "opportunity_amount",
    "currency",
  ],
  Issue: ["name", "subject", "status", "priority", "customer"],
};

/** Arguments are already literal; this hint must not undergo template filling. */
export function buildKanbanCardListHint(
  doctype: string,
  cardId: string,
): NavHint | null {
  if (!cardId.trim() || !Object.hasOwn(CARD_LIST_FIELDS, doctype)) return null;
  return {
    key: "view_list",
    label: `Show this ${doctype} in a list`,
    tool: "erpnext_doc_list",
    kind: "list",
    args: {
      doctype,
      filters: [["name", "=", cardId]],
      fields: [...CARD_LIST_FIELDS[doctype]],
      limit: 1,
    },
  };
}

export function kanbanNavVars(
  cardId: string,
  doctype: string,
): Record<string, string> {
  return { id: cardId, doctype };
}
