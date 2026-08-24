/**
 * L'état d'une confirmation, sans Preact : ce que la feuille affiche et ce
 * qu'un « Confirmer » déclenche. Testé seul — c'est la pièce qui empêche
 * qu'un clic suffise à une action irréversible.
 */

export interface PendingConfirm {
  /** L'identifiant du document, dans l'eyebrow : « ACC-SINV-2026-00042 ». */
  subject: string;
  /** La question, courte : « Annuler la facture ? ». */
  title: string;
  /** Ce qui va se passer, en une phrase. */
  detail: string;
  /** Le verbe de l'action, sur le bouton danger : « Annuler la facture ». */
  actionLabel: string;
  onConfirm: () => void;
}

export type ConfirmSnapshot = PendingConfirm | null;

/** Une nouvelle demande remplace la précédente sans l'exécuter. */
export function requestConfirm(
  _current: ConfirmSnapshot,
  next: PendingConfirm,
): ConfirmSnapshot {
  return next;
}

/** Retour, Échap, voile : on ferme, rien ne part. */
export function dismissConfirm(): ConfirmSnapshot {
  return null;
}

/**
 * Confirmer : la feuille se ferme d'abord, l'action part ensuite — et une
 * seule fois, puisque l'état ne porte plus rien après.
 */
export function confirmPending(
  current: ConfirmSnapshot,
): { next: ConfirmSnapshot; run: (() => void) | null } {
  return { next: null, run: current?.onConfirm ?? null };
}
