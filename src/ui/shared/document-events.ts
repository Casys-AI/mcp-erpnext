/**
 * Changement canonique d'un document ERPNext.
 *
 * Le nom routable reste séparé de la payload : celle-ci peut circuler par un
 * appel local, un bus en mémoire ou, plus tard, comme `data` d'un événement
 * Compose sans dépendre d'aucun de ces transports.
 */

export const DOCUMENT_CHANGE_EVENT_NAME = "erpnext.document.changed" as const;

export const DOCUMENT_MUTATION_KINDS = [
  "update",
  "submit",
  "cancel",
  "attachment.added",
] as const;

export type DocumentMutationKind = typeof DOCUMENT_MUTATION_KINDS[number];

export interface DocumentChangeEvent {
  readonly doctype: string;
  readonly name: string;
  readonly mutation: DocumentMutationKind;
  /** Instant où le serveur a confirmé la mutation, au format ISO 8601. */
  readonly committedAt: string;
  /** Identifiant libre de l'émetteur, utile au diagnostic et non au routage. */
  readonly source?: string;
}

const DOCUMENT_MUTATIONS = new Set<string>(DOCUMENT_MUTATION_KINDS);
const ISO_DATE_TIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Garde d'entrée pour une payload reçue d'un transport éventuel. */
export function isDocumentChangeEvent(
  value: unknown,
): value is DocumentChangeEvent {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return isNonEmptyString(candidate.doctype) &&
    isNonEmptyString(candidate.name) &&
    typeof candidate.mutation === "string" &&
    DOCUMENT_MUTATIONS.has(candidate.mutation) &&
    typeof candidate.committedAt === "string" &&
    ISO_DATE_TIME.test(candidate.committedAt) &&
    Number.isFinite(Date.parse(candidate.committedAt)) &&
    (candidate.source === undefined || isNonEmptyString(candidate.source));
}
