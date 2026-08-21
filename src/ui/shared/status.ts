/**
 * Statut ERPNext → ton visuel.
 *
 * La maquette Direction B v2 n'a que quatre tons : `ok` (vert), `warn`
 * (orange), `bad` (rouge) et `neutral` (aucune couleur). Chaque ligne de
 * tableau porte un liseré gauche de 2 px dans le ton de son statut, et les
 * badges reprennent le même ton en fond translucide.
 *
 * Les tons sont rendus en CLASSES Tailwind, jamais en var() inline : Tailwind
 * élague les tokens qu'aucune classe ne référence, et un token élagué perd sa
 * valeur claire tout en gardant sa valeur sombre. Une couleur passée en style
 * inline marcherait donc en thème sombre et disparaîtrait en thème clair.
 */

export type Tone = "ok" | "warn" | "bad" | "neutral";

/** Liseré gauche de ligne — le motif signature du tableau. */
export const TONE_RULE: Record<Tone, string> = {
  ok: "border-l-ok",
  warn: "border-l-warn",
  bad: "border-l-bad",
  neutral: "border-l-transparent",
};

/** Badge de statut : fond translucide + texte dans le ton. */
export const TONE_BADGE: Record<Tone, string> = {
  ok: "bg-ok/14 text-ok",
  warn: "bg-warn/14 text-warn-text",
  bad: "bg-bad/14 text-bad",
  neutral: "bg-count text-ink-muted",
};

/** Montant ou valeur numérique colorée par son statut. */
export const TONE_AMOUNT: Record<Tone, string> = {
  ok: "text-ok",
  warn: "text-warn-text",
  bad: "text-bad",
  neutral: "text-ink-2",
};

/**
 * Table de correspondance statut → ton.
 *
 * Reprend le STATUS_TONE de doclist-viewer/src/components/StatusCell.tsx, à
 * deux écarts près imposés par la maquette :
 *
 *  - `info` n'existe plus. La direction n'a que quatre tons, et la maquette
 *    montre les lignes `unpaid` avec un liseré ORANGE (l.107) et le badge
 *    `unpaid` en orange (l.155) — donc `warn`, pas un quatrième bleu.
 *  - `Open` passe de `warning` à `warn` sans changement de sens, mais la
 *    colonne kanban `open` de la maquette (l.899) est cyan et non orange :
 *    un ticket ouvert n'est pas en retard. D'où `neutral` ici.
 *
 * ── Trois arbitrages qui te reviennent ──────────────────────────────────
 *
 * Le liseré est le seul signal d'alerte de la liste : trop de rouge le rend
 * illisible, trop peu masque les retards. Les valeurs ci-dessous sont mes
 * choix par défaut, à retourner si ton usage dit autre chose.
 *
 *  1. `Draft` → neutral. Rien n'est engagé tant que la pièce n'est pas
 *     soumise. À passer en `warn` si un brouillon qui traîne est, chez toi,
 *     une action en attente plutôt qu'un simple état.
 *  2. `Partly Paid` → warn, au même titre qu'`Unpaid`. À distinguer si un
 *     acompte encaissé vaut mieux qu'un impayé franc à tes yeux.
 *  3. `Cancelled` → neutral. La maquette grise les pièces annulées, ce qui
 *     plaide pour neutre ; ton STATUS_TONE actuel les mettait en `danger`.
 *     J'ai suivi la maquette — c'est un classement, pas un échec — mais
 *     c'est le choix le plus discutable des trois.
 */
const STATUS_TONE: Record<string, Tone> = {
  // Encaissé, livré, terminé.
  Paid: "ok",
  Completed: "ok",
  Submitted: "ok",
  Active: "ok",
  Enabled: "ok",

  // En attente d'une action.
  Unpaid: "warn",
  "Partly Paid": "warn",
  "Partly Delivered": "warn",
  Pending: "warn",
  "Pending Review": "warn",
  "To Bill": "warn",
  "To Deliver": "warn",
  "To Deliver and Bill": "warn",
  "On Hold": "warn",

  // En retard, en échec.
  Overdue: "bad",
  Failed: "bad",

  // Classé, sans alerte.
  Draft: "neutral",
  Open: "neutral",
  Working: "neutral",
  Cancelled: "neutral",
  Closed: "neutral",
  Disabled: "neutral",
  "Credit Note Issued": "neutral",
  Return: "neutral",
};

/**
 * Classe un statut ERPNext dans l'un des quatre tons.
 *
 * @param status Le champ `status` du document, tel que renvoyé par Frappe.
 */
export function toneForStatus(status: string): Tone {
  return STATUS_TONE[status] ?? "neutral";
}
