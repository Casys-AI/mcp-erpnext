/**
 * Choix de colonnes et arithmétique de liste — sans DOM, sans alias de bundler.
 *
 * Séparé de helpers.ts, qui touche au document (export CSV) et importe le
 * thème via l'alias `~` : deux dépendances qui rendent ce module intestable
 * hors navigateur. Ici tout est pur, donc vérifiable par `deno test`.
 */

/**
 * Champs de montant d'ERPNext, du plus parlant au moins parlant.
 *
 * En mode étroit une seule valeur numérique tient sur la ligne : la maquette y
 * montre le reste dû, pas le total facturé. L'ordre encode ce choix — ce qu'on
 * vient vérifier sur un panneau latéral, c'est ce qui reste à encaisser.
 */
const AMOUNT_FIELDS = [
  "outstanding_amount",
  "grand_total",
  "total",
  "amount",
  "base_grand_total",
  "qty",
];

/**
 * Désigne la colonne dont le montant s'affiche en mode étroit.
 *
 * Retombe sur la dernière colonne numérique quand aucun champ connu n'est
 * présent — un DocType quelconque n'a pas de raison d'employer le vocabulaire
 * comptable, mais garde ses nombres à droite.
 */
export function pickAmountColumn(
  columns: { id: string; numeric: boolean }[],
): string | undefined {
  for (const field of AMOUNT_FIELDS) {
    if (columns.some((column) => column.id === field)) return field;
  }
  const numeric = columns.filter((column) => column.numeric);
  return numeric.at(-1)?.id;
}

/** Somme d'une colonne sur l'ensemble des lignes, en ignorant les trous. */
export function sumColumn(
  rows: Record<string, unknown>[],
  key: string | undefined,
): number | null {
  if (!key) return null;
  let total = 0;
  let seen = false;
  for (const row of rows) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      total += value;
      seen = true;
    }
  }
  return seen ? total : null;
}

/**
 * Tronque un identifiant par la gauche : `ACC-SINV-2026-00046` → `…2026-00046`.
 *
 * Les noms ERPNext partagent de longs préfixes — série, société, exercice — et
 * ne se distinguent que par leur fin. Un `text-overflow: ellipsis` couperait
 * donc exactement ce qui identifie la ligne. On garde la queue.
 *
 * La coupe suit les tirets plutôt qu'un compte de caractères : ces noms sont
 * segmentés (`SÉRIE-TYPE-EXERCICE-NUMÉRO`), et trancher au milieu d'un segment
 * produit des `…V-2026-00046` qui ne veulent rien dire. On garde les deux
 * derniers segments, soit l'exercice et le numéro.
 *
 * Fait en JS et non en CSS (`direction: rtl`) parce que le réordonnancement
 * bidirectionnel déplace la ponctuation aux extrémités de la chaîne, ce qui
 * abîme précisément les identifiants à tirets.
 */
export function shortenId(value: string, max = 14, keepSegments = 2): string {
  if (value.length <= max) return value;
  const segments = value.split("-");
  if (segments.length <= keepSegments) return value;
  return `…${segments.slice(-keepSegments).join("-")}`;
}

/**
 * Les trois colonnes que gardent les mises en page étroites : pièce, tiers, dû.
 *
 * La maquette mobile fixe la grille à `92px 1fr 78px` — l'identifiant et le
 * montant ont une largeur arrêtée, le tiers prend ce qui reste. Choisir les
 * colonnes est donc un préalable à la grille, pas une conséquence.
 *
 * Le statut est délibérément absent : en étroit il ne s'affiche plus en badge,
 * il ne subsiste que dans le liseré de 2 px au bord de la ligne.
 */
export function pickNarrowColumns(
  columns: { id: string; numeric: boolean }[],
  amountKey: string | undefined,
  isStatus: (key: string) => boolean,
): { idKey?: string; labelKey?: string; amountKey?: string } {
  const idKey = columns[0]?.id;
  const labelKey = columns.find((column) =>
    column.id !== idKey &&
    column.id !== amountKey &&
    !column.numeric &&
    !isStatus(column.id)
  )?.id;
  return { idKey, labelKey, amountKey };
}
