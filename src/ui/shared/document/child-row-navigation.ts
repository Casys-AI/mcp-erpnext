import {
  fillTemplate,
  hasUnfilledTemplate,
  hintLabel,
  type Jump,
  jumpFromHint,
  type NavHint,
} from "../jumps.ts";
import type { ChildTableRow } from "./types.ts";

export interface ChildRowNavigationAsk {
  label: string;
  message: string;
}

function rowTemplateVars(row: ChildTableRow): Record<string, string> {
  const vars = Object.fromEntries(
    Object.entries(row).flatMap(([key, value]) => {
      if (typeof value !== "string" && typeof value !== "number") return [];
      const normalized = String(value).trim();
      return normalized ? [[key, normalized]] : [];
    }),
  );
  if (!vars.item && vars.item_code) vars.item = vars.item_code;
  return vars;
}

function mergedTemplateVars(
  rootVars: Record<string, string>,
  row: ChildTableRow,
): Record<string, string> {
  const rowVars = rowTemplateVars(row);
  // Une ligne ne peut pas réécrire l'identité de sa fiche parente. Seules ses
  // variables propres (notamment `item`) complètent les gabarits non résolus.
  const vars = { ...rowVars, ...rootVars };
  if (rowVars.item) vars.item = rowVars.item;
  return vars;
}

function rowActionLabel(label: string, vars: Record<string, string>): string {
  return vars.item ? `${label} · ${vars.item}` : label;
}

/**
 * Résout uniquement les hints qui avaient besoin d'une valeur de ligne.
 * Les relations déjà résolues au niveau de la fiche restent dans sa barre
 * d'actions et ne sont jamais répétées sur chaque article.
 */
export function childRowNavigationJumps({
  hints,
  rootVars,
  row,
  availableTools,
  subtitle,
}: {
  hints: readonly NavHint[];
  rootVars: Record<string, string>;
  row: ChildTableRow;
  availableTools: readonly string[] | undefined;
  subtitle?: string;
}): Jump[] {
  if (!availableTools) return [];
  const vars = mergedTemplateVars(rootVars, row);
  return hints.flatMap((hint) => {
    if (!hint.tool || !availableTools.includes(hint.tool)) return [];
    if (jumpFromHint(hint, rootVars, subtitle)) return [];
    const jump = jumpFromHint(hint, vars, subtitle);
    return jump ? [{ ...jump, label: rowActionLabel(jump.label, vars) }] : [];
  });
}

/** Repli conversationnel d'une action qui ne devient concrète qu'à la ligne. */
export function childRowNavigationAsks({
  hints,
  rootVars,
  row,
}: {
  hints: readonly NavHint[];
  rootVars: Record<string, string>;
  row: ChildTableRow;
}): ChildRowNavigationAsk[] {
  const vars = mergedTemplateVars(rootVars, row);
  return hints.flatMap((hint) => {
    if (!hint.message) return [];
    const rootMessage = fillTemplate(hint.message, rootVars);
    if (!hasUnfilledTemplate(rootMessage)) return [];
    const message = fillTemplate(hint.message, vars);
    if (hasUnfilledTemplate(message)) return [];
    return [{
      label: rowActionLabel(hintLabel(hint), vars),
      message,
    }];
  });
}
