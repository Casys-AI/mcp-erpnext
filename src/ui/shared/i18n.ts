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
import { zh } from "./i18n/zh.ts";
import { zhHant } from "./i18n/zh-Hant.ts";
import { hi } from "./i18n/hi.ts";
import { bn } from "./i18n/bn.ts";
import { ta } from "./i18n/ta.ts";
import { ur } from "./i18n/ur.ts";

// ── Types ──────────────────────────────────────────────────────────────────

export const SUPPORTED_LANGS = [
  "en",
  "fr",
  "zh",
  "zh-Hant",
  "hi",
  "bn",
  "ta",
  "ur",
] as const;
export type Lang = typeof SUPPORTED_LANGS[number];

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
 * Réduit un BCP 47 au catalogue disponible. Le script chinois explicite
 * prime sur la région ; sans script, TW/HK/MO utilisent le traditionnel.
 * Les langues inconnues ou les tags invalides retombent sur l'anglais.
 */
export function resolveLang(locale?: string): Lang {
  if (typeof locale !== "string" || locale.length === 0) return "en";
  let parsed: Intl.Locale;
  try {
    parsed = new Intl.Locale(locale.trim());
  } catch {
    return "en";
  }
  const { language, script, region } = parsed;
  if (language === "zh") {
    if (script === "Hant") return "zh-Hant";
    if (script === "Hans") return "zh";
    return region && ["TW", "HK", "MO"].includes(region) ? "zh-Hant" : "zh";
  }
  if (
    language === "fr" || language === "hi" || language === "bn" ||
    language === "ta" || language === "ur"
  ) return language;
  return "en";
}

export function directionForLocale(locale?: string): "ltr" | "rtl" {
  return resolveLang(locale) === "ur" ? "rtl" : "ltr";
}

// ── currentLang ────────────────────────────────────────────────────────────

/** La langue courante, lue à chaque appel (pas mise en cache). */
export function currentLang(): Lang {
  return resolveLang(langSource());
}

// ── Catalogues ─────────────────────────────────────────────────────────────

const CATALOGS: Record<Lang, Record<string, string>> = {
  en,
  fr,
  zh,
  "zh-Hant": zhHant,
  hi,
  bn,
  ta,
  ur,
};

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
  return translate(currentLang(), key, params);
}

/** Scoped translation for a surface whose host context is already available. */
export function translatorForLocale(locale?: string): typeof t {
  const lang = resolveLang(locale);
  return (key, params) => translate(lang, key, params);
}

function translate(
  lang: Lang,
  key: string,
  params?: Record<string, unknown>,
): string {
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
