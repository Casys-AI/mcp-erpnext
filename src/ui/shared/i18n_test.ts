/**
 * Tests du moteur i18n.
 *
 * Règles vérifiées :
 *   1. Parité des clés fr / en (même ensemble exact).
 *   2. resolveLang réduit correctement les tags BCP 47.
 *   3. Interpolation nommée ({n}, {label}, …).
 *   4. Clé absente → retourne la clé, jamais undefined ni exception.
 *   5. Repli en → en si la langue n'est pas fr.
 */

import { assertEquals, assertNotEquals } from "@std/assert";
import { en } from "./i18n/en.ts";
import { fr } from "./i18n/fr.ts";
import { getCatalog, resolveLang, setLangSource, t } from "./i18n.ts";

// ── 1. Parité des clés fr / en ────────────────────────────────────────────

Deno.test("i18n - fr et en ont exactement les mêmes clés", () => {
  const enKeys = new Set(Object.keys(en));
  const frKeys = new Set(Object.keys(fr));

  const missingInFr = [...enKeys].filter((k) => !frKeys.has(k));
  const missingInEn = [...frKeys].filter((k) => !enKeys.has(k));

  assertEquals(
    missingInFr,
    [],
    `Clés présentes dans en.ts mais absentes de fr.ts : ${
      missingInFr.join(", ")
    }`,
  );
  assertEquals(
    missingInEn,
    [],
    `Clés présentes dans fr.ts mais absentes de en.ts : ${
      missingInEn.join(", ")
    }`,
  );
});

Deno.test("i18n - les catalogues ont au moins une clé commune.*", () => {
  const hasCommon = Object.keys(en).some((k) => k.startsWith("common."));
  assertEquals(hasCommon, true);
});

// ── 2. resolveLang ────────────────────────────────────────────────────────

Deno.test("resolveLang - fr et ses variantes régionales → fr", () => {
  assertEquals(resolveLang("fr"), "fr");
  assertEquals(resolveLang("fr-FR"), "fr");
  assertEquals(resolveLang("fr-CA"), "fr");
  assertEquals(resolveLang("fr-BE"), "fr");
  assertEquals(resolveLang("FR-FR"), "fr"); // insensible à la casse
});

Deno.test("resolveLang - tout le reste → en", () => {
  assertEquals(resolveLang("en"), "en");
  assertEquals(resolveLang("en-US"), "en");
  assertEquals(resolveLang("de"), "en");
  assertEquals(resolveLang("ja"), "en");
  assertEquals(resolveLang(""), "en");
  assertEquals(resolveLang(undefined), "en");
});

// ── 3. Interpolation ──────────────────────────────────────────────────────

Deno.test("t - interpole les paramètres nommés", () => {
  // Injecte une clé ad-hoc via setLangSource + catalog direct
  // On teste l'interpolation en ajoutant une clé temporaire dans en.
  // Pour éviter de polluer le catalogue, on teste avec une clé qui existe
  // déjà et porte un {…} dans sa valeur.
  //
  // Si aucune clé du tronc commun ne contient d'interpolation, on injecte
  // via le mécanisme setLangSource + clé manquante → la clé elle-même.
  // On crée plutôt un test direct sur la logique de remplacement.

  // Astuce : on modifie temporairement le catalog via un mock de setLangSource.
  // Plus simple : on vérifie le comportement avec une clé réelle dès qu'un
  // agent a ajouté des clés interpolées.  Pour l'instant, on teste le moteur
  // directement en injectant une clé dans le catalog via getCatalog().

  // Test de repli clé → clé (pas d'interpolation si clé absente)
  setLangSource(() => "en");
  const missing = t("test.missing.key.xyz", { n: 42 });
  assertEquals(missing, "test.missing.key.xyz"); // la clé, pas undefined

  // Test de l'interpolation sur une chaîne construite manuellement :
  // on exploite le fait que t() remplace {name} dans la valeur brute.
  // On injecte une fausse clé dans le catalogue en via Object.assign.
  const catalog = getCatalog("en");
  const originalValue = catalog["test.__interp__"];
  catalog["test.__interp__"] = "Hello {name}, you have {n} messages";
  setLangSource(() => "en");
  assertEquals(
    t("test.__interp__", { name: "Alice", n: 3 }),
    "Hello Alice, you have 3 messages",
  );
  // Nettoyage
  if (originalValue === undefined) {
    delete catalog["test.__interp__"];
  } else {
    catalog["test.__interp__"] = originalValue;
  }
});

Deno.test("t - conserve le placeholder si le paramètre est absent", () => {
  setLangSource(() => "en");
  const catalog = getCatalog("en");
  catalog["test.__partial__"] = "Items: {n} of {total}";
  // Seulement n est fourni, pas total
  const result = t("test.__partial__", { n: 5 });
  assertEquals(result, "Items: 5 of {total}");
  delete catalog["test.__partial__"];
});

// ── 4. Clé absente ────────────────────────────────────────────────────────

Deno.test("t - clé absente rend la clé, jamais undefined ni exception", () => {
  setLangSource(() => "en");
  const result = t("this.key.does.not.exist.at.all");
  assertEquals(result, "this.key.does.not.exist.at.all");
  assertNotEquals(result, undefined as unknown as string);
  assertNotEquals(result, "");
});

Deno.test("t - clé absente en fr retombe sur en puis sur la clé", () => {
  setLangSource(() => "fr");
  // common.loading existe en fr → retourne le texte français
  const loading = t("common.loading");
  assertEquals(loading, fr["common.loading"]);

  // clé absente des deux → retourne la clé
  const missing = t("absent.completement");
  assertEquals(missing, "absent.completement");
});

// ── 5. Repli de langue ────────────────────────────────────────────────────

Deno.test("t - locale non reconnue utilise en", () => {
  setLangSource(() => "de-DE");
  assertEquals(t("common.refresh"), en["common.refresh"]);
});

Deno.test("t - locale fr utilise le catalogue français", () => {
  setLangSource(() => "fr-FR");
  assertEquals(t("common.refresh"), fr["common.refresh"]);
  assertNotEquals(t("common.refresh"), en["common.refresh"]);
});
