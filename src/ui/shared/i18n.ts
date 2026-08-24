/**
 * Moteur i18n — pur, sans dépendance Preact ni ext-apps.
 *
 * Ce fichier doit passer `deno check` et `deno test` sans import map npm.
 * Il n'importe donc jamais preact/hooks.  Le hook useT() vit dans
 * i18n-hook.ts qui, lui, peut importer preact.
 *
 * Patron d'injection (même principe que format.ts / setLocaleSource) :
 *   host-context.ts appelle setLangSource(() => current.locale) au démarrage.
 *   t() et resolveLang() lisent la locale fraîche à chaque appel.
 *
 * Fallback : "en" — ce paquet est international, le français n'est pas la
 * langue par défaut.
 *
 * Interpolation : t("key", { n: 42 }) remplace {n} dans la chaîne.
 * Une clé absente rend la clé elle-même — jamais undefined, jamais une
 * exception.
 */

import { en } from "./i18n/en.ts";
import { fr } from "./i18n/fr.ts";

// ── Types ──────────────────────────────────────────────────────────────────

export type Lang = "fr" | "en";

// ── Source de langue (injection) ───────────────────────────────────────────

let langSource: () => string | undefined = () => undefined;

/**
 * Branche la locale de l'hôte sur le moteur.
 *
 * À appeler une fois dans host-context.ts, après que `current` est
 * initialisé, sur le même modèle que setLocaleSource dans format.ts.
 *
 *   setLangSource(() => current.locale);
 */
export function setLangSource(source: () => string | undefined): void {
  langSource = source;
}

// ── resolveLang ────────────────────────────────────────────────────────────

/**
 * Réduit un BCP 47 arbitraire en "fr" | "en".
 *
 * fr, fr-FR, fr-CA, fr-BE → "fr"
 * Tout le reste (en, de, ja, undefined, "") → "en"
 */
export function resolveLang(locale?: string): Lang {
  if (typeof locale !== "string" || locale.length === 0) return "en";
  const tag = locale.toLowerCase();
  if (tag === "fr" || tag.startsWith("fr-")) return "fr";
  return "en";
}

// ── currentLang ────────────────────────────────────────────────────────────

/** La langue courante, lue à chaque appel (pas mise en cache). */
export function currentLang(): Lang {
  return resolveLang(langSource());
}

// ── Catalogues ─────────────────────────────────────────────────────────────

const CATALOGS: Record<Lang, Record<string, string>> = { en, fr };

// ── t ─────────────────────────────────────────────────────────────────────

/**
 * Traduit une clé dans la langue courante.
 *
 * Chaîne de repli : lang → en → clé.
 * Jamais undefined, jamais une exception.
 *
 * @param key    Chemin stable en anglais, ex. "common.loading"
 * @param params Paramètres nommés pour l'interpolation, ex. { n: 24 }
 *
 * @example
 *   t("common.loading")              // → "Loading…" ou "Chargement…"
 *   t("doclist.rows.count", { n: 5}) // → "5 rows"  (clé définie par l'agent)
 */
export function t(key: string, params?: Record<string, unknown>): string {
  const lang = currentLang();
  const catalog = CATALOGS[lang];
  const raw: string = catalog[key] ?? en[key] ?? key;
  if (!params) return raw;
  return raw.replace(
    /\{(\w+)\}/g,
    (match, name: string) =>
      Object.prototype.hasOwnProperty.call(params, name)
        ? String(params[name])
        : match,
  );
}

// ── Accès aux catalogues (pour les tests de parité) ───────────────────────

/** Retourne le catalogue brut pour une langue donnée. */
export function getCatalog(lang: Lang): Record<string, string> {
  return CATALOGS[lang];
}
