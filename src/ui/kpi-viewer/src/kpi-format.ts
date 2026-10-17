/**
 * Formatage pur des KPI — sans import Preact, testé seul sous Deno.
 *
 * Contrat payload → texte : le grand chiffre vient de `value`/`unit`/
 * `currency`, la ligne secondaire de `secondary` (union fermée, validée ici),
 * et `formattedValue` (texte serveur, anglais/en-US) ne sert que de légende
 * de repli quand `secondary` est absent. Aucune fonction ne lève : une donnée
 * inattendue donne moins d'information, jamais une vue blanche.
 */

import {
  currentLocale,
  formatCurrency,
  formatInteger,
  formatNumber,
  formatPercent,
  toNumber,
} from "../../shared/format.ts";
import type { KpiData } from "./types.ts";

/** Traducteur injecté : garde ce module testable sans catalogue Preact. */
export type KpiTranslate = (
  key: string,
  params?: Record<string, unknown>,
) => string;

export interface KpiParts {
  amount: string;
  unit: string;
}

export interface KpiSecondaryLine {
  label: string;
  value: string;
}

/**
 * Symbole d'une devise, ou son code brut si `Intl` la rejette
 * (« EURO » lève un RangeError).
 */
export function currencySymbol(currency: string): string {
  try {
    return new Intl.NumberFormat(currentLocale(), {
      style: "currency",
      currency,
    })
      .formatToParts(0)
      .find((part) => part.type === "currency")?.value ?? currency;
  } catch {
    return currency;
  }
}

/**
 * Montant et unité séparés, pour le rendu bipolaire 46px/26px (montant gros,
 * unité faufilée à droite). `null`, `undefined` et `NaN` valent 0.
 */
export function kpiParts(
  data: Pick<KpiData, "value" | "currency" | "unit">,
): KpiParts {
  const v = toNumber(data.value) ?? 0;
  if (data.currency) {
    return { amount: formatNumber(v, 2), unit: currencySymbol(data.currency) };
  }
  if (data.unit === "%") {
    const decimals = v % 1 === 0 ? 0 : 1;
    return { amount: formatNumber(v, decimals), unit: "%" };
  }
  const decimals = v % 1 === 0 ? 0 : 2;
  return { amount: formatNumber(v, decimals), unit: data.unit ?? "" };
}

/** Valeur de comparaison, formatée comme la valeur principale. */
export function formatDeltaValue(
  data: Pick<KpiData, "deltaValue" | "currency">,
): string {
  if (data.deltaValue == null) return "";
  const v = toNumber(data.deltaValue) ?? 0;
  if (data.currency) {
    return `${formatNumber(v, 2)} ${currencySymbol(data.currency)}`;
  }
  return formatNumber(v, 2);
}

/** `delta` est déjà en points de pourcentage ; le badge porte le sens. */
export function formatDeltaPercent(delta: unknown): string {
  const n = toNumber(delta);
  if (n === null) return formatPercent(delta);
  const magnitude = Math.abs(n);
  return formatPercent(magnitude, magnitude % 1 === 0 ? 0 : 1);
}

/** Le texte du grand chiffre, tel qu'il se lit (« 3 orders », « 40 % »). */
export function kpiMainText(parts: KpiParts): string {
  return [parts.amount, parts.unit].filter(Boolean).join(" ");
}

/**
 * Ligne secondaire localisée, ou `undefined` si le champ est absent ou
 * invalide (`kind` inconnu, valeur non finie, montant sans devise).
 */
export function kpiSecondary(
  data: Pick<KpiData, "secondary">,
  t: KpiTranslate,
): KpiSecondaryLine | undefined {
  const secondary: unknown = data.secondary;
  if (!secondary || typeof secondary !== "object") return undefined;
  const { kind, value, currency } = secondary as Record<string, unknown>;
  const n = toNumber(value);
  if (n === null) return undefined;
  if (kind === "invoice_count") {
    if (n < 0) return undefined;
    return {
      label: t("kpi.secondary.invoices"),
      value: formatInteger(n),
    };
  }
  if (kind === "amount") {
    if (typeof currency !== "string" || currency.trim() === "") {
      return undefined;
    }
    return {
      label: t("kpi.secondary.amount"),
      value: formatCurrency(n, currency.trim()),
    };
  }
  return undefined;
}

/** La ligne secondaire en un seul texte, pour le contexte modèle. */
export function kpiSecondaryText(
  data: Pick<KpiData, "secondary">,
  t: KpiTranslate,
): string | undefined {
  const line = kpiSecondary(data, t);
  return line ? `${line.label}: ${line.value}` : undefined;
}

function comparable(text: string): string {
  return text.replace(/[\s  ]+/g, "").toLowerCase();
}

/**
 * Légende de repli : le `formattedValue` du serveur, seulement quand aucune
 * ligne secondaire ne s'affiche et qu'il n'est pas déjà lu dans le grand
 * chiffre (« 3 orders »). Un ancien serveur reste ainsi lisible.
 */
export function kpiCaption(
  data: Pick<KpiData, "secondary" | "formattedValue">,
  parts: KpiParts,
  t: KpiTranslate,
): string | undefined {
  if (kpiSecondary(data, t)) return undefined;
  const text = data.formattedValue;
  if (typeof text !== "string" || text.trim() === "") return undefined;
  if (comparable(text) === comparable(kpiMainText(parts))) return undefined;
  return text.trim();
}
