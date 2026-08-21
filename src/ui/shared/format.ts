/**
 * Formateurs de nombres, de montants et de dates — un seul jeu pour les sept vues.
 *
 * Avant ce module, chaque vue avait les siens : neuf fonctions dans cinq
 * fichiers, huit en `fr-FR` figé et deux en `en-US`. Un même montant pouvait
 * donc s'écrire `1 057,00` dans une colonne et `1,057.00` dans la voisine.
 * Et aucune ne tolérait l'absence : un `grand_total` manquant dans le JSON
 * faisait planter l'affichage entier.
 *
 * Deux principes, donc :
 *
 *   1. La locale vient de l'hôte (`context.locale`, BCP 47), puis du
 *      navigateur, puis d'un repli. Elle n'est jamais écrite en dur.
 *   2. L'absence est une valeur. `null`, `undefined`, une chaîne vide ou un
 *      `NaN` rendent un tiret, jamais une exception — ERPNext ne garantit
 *      aucun champ, et une vue blanche est pire qu'une case vide.
 */

/** Ce qu'on affiche quand il n'y a rien à afficher. */
export const DASH = "—";

const FALLBACK_LOCALE = "fr-FR";

/**
 * Source de la locale, injectée plutôt qu'importée.
 *
 * Ce module ne tire ni Preact ni le SDK ext-apps : il doit rester pur pour
 * être testé sous Deno et réutilisé hors d'une vue. C'est donc
 * host-context.ts qui lui branche la locale de l'hôte au démarrage — la
 * dépendance va du magasin vers le formateur, jamais l'inverse.
 */
let localeSource: () => string | undefined = () => undefined;

export function setLocaleSource(source: () => string | undefined): void {
  localeSource = source;
}

/**
 * La locale courante.
 *
 * Lue à chaque appel et non mise en cache : le contexte hôte peut arriver
 * après le premier rendu, et un changement de langue côté client doit
 * reformater sans rechargement.
 */
export function currentLocale(): string {
  const injected = localeSource();
  if (typeof injected === "string" && injected.length > 0) return injected;
  if (typeof navigator !== "undefined" && navigator.language) {
    return navigator.language;
  }
  return FALLBACK_LOCALE;
}

/**
 * Coerce ce qu'ERPNext peut renvoyer vers un nombre, ou `null`.
 *
 * Les montants arrivent parfois en chaîne (`"1200.50"`), parfois absents,
 * parfois `null`. On accepte les trois sans broncher.
 */
export function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Nombre avec séparateurs de la locale. Tiret si absent. */
export function formatNumber(value: unknown, decimals = 2): string {
  const n = toNumber(value);
  if (n === null) return DASH;
  return n.toLocaleString(currentLocale(), {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Entier sans décimales — quantités, effectifs. Tiret si absent. */
export function formatInteger(value: unknown): string {
  return formatNumber(value, 0);
}

/**
 * Montant avec sa devise, selon la locale.
 *
 * La devise vient du document (`currency`), jamais d'une constante : une
 * société ERPNext en GBP ne doit pas voir des euros. Sans devise connue, on
 * rend le nombre seul plutôt qu'un symbole inventé.
 *
 * `Intl` rejette un code de devise inconnu : on retombe alors sur le nombre
 * suivi du code brut, ce qui reste lisible.
 */
export function formatCurrency(
  value: unknown,
  currency?: string | null,
): string {
  const n = toNumber(value);
  if (n === null) return DASH;
  const locale = currentLocale();
  if (!currency) {
    return n.toLocaleString(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  try {
    return n.toLocaleString(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch {
    return `${formatNumber(n, 2)} ${currency}`;
  }
}

/**
 * Pourcentage. Prend une valeur déjà en pourcents (20 → « 20 % »), pas une
 * fraction — c'est ce qu'ERPNext renvoie pour `progress` ou un taux.
 */
export function formatPercent(value: unknown, decimals = 0): string {
  const n = toNumber(value);
  if (n === null) return DASH;
  // Intl attend une fraction : 20 % se passe en 0,20.
  return (n / 100).toLocaleString(currentLocale(), {
    style: "percent",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Date ISO d'ERPNext (`2026-08-18`) vers une date courte de la locale.
 *
 * Une chaîne qui ne se parse pas est rendue telle quelle : mieux vaut une
 * date brute qu'un « Invalid Date ».
 */
export function formatDate(value: unknown): string {
  if (typeof value !== "string" || value === "") return DASH;
  const d = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(currentLocale(), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/** Taille de fichier lisible, en unités de 1024. */
export function formatBytes(value: unknown): string {
  const n = toNumber(value);
  if (n === null || n < 0) return DASH;
  const units = ["o", "Ko", "Mo", "Go"];
  let size = n;
  let i = 0;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  const decimals = i === 0 ? 0 : size < 10 ? 1 : 0;
  return `${formatNumber(size, decimals)} ${units[i]}`;
}
