/**
 * Logique pure de navigation pour le kanban-viewer.
 *
 * Pas d'import Preact — testable directement avec Deno.
 * Les hints que le serveur attache à un résultat (`_sendMessageHints`)
 * sont convertis en sauts de navigation typés.
 */

export function kanbanNavVars(
  cardId: string,
  doctype: string,
): Record<string, string> {
  return { id: cardId, doctype };
}
