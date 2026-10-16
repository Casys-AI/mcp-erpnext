import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  DASH,
  formatBytes,
  formatCurrency,
  formatDate,
  formatInteger,
  formatNumber,
  formatPercent,
  setLocaleSource,
  toNumber,
} from "./format.ts";

// Deno expose un navigator.language (en-US-u-va-posix) : on ne suppose donc
// pas de repli, on IMPOSE la locale — c'est ce que fait l'hôte en production.
setLocaleSource(() => "fr-FR");

Deno.test("toNumber accepte nombre, chaîne numérique, et rejette le reste", () => {
  assertEquals(toNumber(1200.5), 1200.5);
  assertEquals(toNumber("1200.50"), 1200.5);
  assertEquals(toNumber(" 42 "), 42);
  assertEquals(toNumber(""), null);
  assertEquals(toNumber("abc"), null);
  assertEquals(toNumber(null), null);
  assertEquals(toNumber(undefined), null);
  assertEquals(toNumber(NaN), null);
  assertEquals(toNumber(Infinity), null);
  assertEquals(toNumber({}), null);
});

// Chaque cas ci-dessous est un plantage trouvé par l'audit de déploiement :
// un champ absent du JSON ERPNext faisait tomber la vue entière.
Deno.test("l'absence rend un tiret, jamais une exception", () => {
  assertEquals(formatNumber(undefined), DASH); // stock actual_qty absent
  assertEquals(formatNumber(null), DASH); // kpi value null
  assertEquals(formatCurrency(undefined, "EUR"), DASH); // invoice grand_total absent
  assertEquals(formatInteger(""), DASH);
  assertEquals(formatPercent(null), DASH); // kpi deltaValue null
  assertEquals(formatDate(undefined), DASH);
  assertEquals(formatBytes(null), DASH);
});

Deno.test("formatNumber pose les séparateurs de la locale", () => {
  const out = formatNumber(1057);
  // fr-FR : « 1 057,00 » avec une espace insécable ; on teste la virgule et les deux décimales.
  assertStringIncludes(out, ",00");
  assertEquals(out.replace(/\s/g, ""), "1057,00");
  assertEquals(formatNumber("1200.5", 1).replace(/\s/g, ""), "1200,5");
});

Deno.test("formatInteger n'a pas de décimales", () => {
  assertEquals(formatInteger(1200.7).replace(/\s/g, ""), "1201");
  assertEquals(formatInteger(0), "0");
});

Deno.test("formatCurrency lit la devise du document, pas une constante", () => {
  assertStringIncludes(formatCurrency(2160, "EUR"), "€");
  assertStringIncludes(formatCurrency(2160, "GBP"), "£");
  assertStringIncludes(formatCurrency(2160, "USD"), "$");
});

Deno.test("formatCurrency sans devise rend le nombre seul", () => {
  const out = formatCurrency(2160, undefined);
  assertEquals(out.replace(/\s/g, ""), "2160,00");
  assertEquals(/[€$£]/.test(out), false);
});

Deno.test("formatCurrency survit à un code de devise inconnu", () => {
  const out = formatCurrency(10, "XXX-INVALIDE");
  assertStringIncludes(out, "XXX-INVALIDE");
  assertStringIncludes(out, "10");
});

Deno.test("formatPercent prend des pourcents, pas une fraction", () => {
  // ERPNext renvoie progress: 20, pas 0.2.
  assertStringIncludes(formatPercent(20), "20");
  assertStringIncludes(formatPercent(20), "%");
  assertStringIncludes(formatPercent(12.5, 1), "12,5");
});

Deno.test("formatDate rend une date ISO en date courte, et laisse passer l'illisible", () => {
  const out = formatDate("2026-08-18");
  assertStringIncludes(out, "2026");
  assertStringIncludes(out, "18");
  // Une chaîne qui ne se parse pas revient telle quelle — jamais « Invalid Date ».
  assertEquals(formatDate("pas-une-date"), "pas-une-date");
  assertEquals(formatDate(""), DASH);
});

Deno.test("formatBytes choisit l'unité et arrondit selon la taille", () => {
  assertEquals(formatBytes(512), "512 o");
  assertEquals(formatBytes(248 * 1024).replace(/\s/g, ""), "248Ko");
  assertEquals(formatBytes(1.2 * 1024 * 1024).replace(/\s/g, ""), "1,2Mo");
  assertEquals(formatBytes(-1), DASH);
});
