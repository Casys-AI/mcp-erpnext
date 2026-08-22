/**
 * Un saut : ce qu'un bouton « › » pousse sur la pile.
 *
 * Les hints que le serveur attache à ses résultats (`_sendMessageHints`,
 * `_jumps`) portent un outil et ses arguments, avec `{id}` / `{doctype}` à
 * remplir. Quand l'hôte relaie les outils, le saut empile un niveau et la vue
 * l'affiche elle-même ; sinon le même hint redevient une question posée au
 * modèle (« ~ »), exactement comme avant.
 */

import { levelKey } from "./nav-stack.ts";
import type { LevelInit, ToolCall } from "./nav-stack.ts";
import { t } from "./i18n.ts";
import { extractToolResultText, type ToolResultPayload } from "./refresh.ts";

export type JumpKind = "list" | "record" | "chart";

export interface Jump {
  label: string;
  kind: JumpKind;
  tool: ToolCall;
  subtitle?: string;
  /** La question équivalente pour le modèle, si l'hôte ne relaie pas. */
  message?: string;
  /** Les sauts qu'offrira le niveau ouvert (une fiche : ses listes, ses graphiques). */
  children?: Jump[];
}

/** Un hint tel que le serveur l'attache. */
export interface NavHint {
  key?: string;
  label: string;
  /** La phrase envoyée quand l'hôte ne relaie pas les outils — absente sur un saut pur. */
  message?: string;
  tool?: string;
  args?: Record<string, unknown>;
  kind?: JumpKind;
}

export interface HostCapabilitiesLike {
  serverTools?: unknown;
}

/** Les sauts n'existent que si l'hôte relaie les outils serveur. */
export function canJump(caps: HostCapabilitiesLike | undefined): boolean {
  return Boolean(caps?.serverTools);
}

/** Remplit `{clé}` dans toutes les chaînes d'une valeur, tableaux compris. */
export function fillTemplate<T>(value: T, vars: Record<string, string>): T {
  if (typeof value === "string") {
    return value.replace(
      /\{(\w+)\}/g,
      (match, name: string) =>
        Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : match,
    ) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => fillTemplate(item, vars)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map((
        [k, v],
      ) => [k, fillTemplate(v, vars)]),
    ) as T;
  }
  return value;
}

/** Le libellé d'un hint : le catalogue si la clé y est, sinon le serveur. */
export function hintLabel(hint: NavHint): string {
  if (!hint.key) return hint.label;
  const key = `doclist.hint.${hint.key}`;
  const translated = t(key);
  return translated === key ? hint.label : translated;
}

/** Un hint → un saut, ou null s'il n'a pas d'outil (il reste une question). */
/** Un gabarit `{clé}` reste quelque part dans la valeur. */
export function hasUnfilledTemplate(value: unknown): boolean {
  if (typeof value === "string") return /\{\w+\}/.test(value);
  if (Array.isArray(value)) return value.some(hasUnfilledTemplate);
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(
      hasUnfilledTemplate,
    );
  }
  return false;
}

/**
 * Le saut d'un hint, ou `null` s'il ne peut pas partir tel quel : pas
 * d'outil, ou un gabarit que `vars` ne remplit pas (une valeur vide compte
 * comme absente — un `{party}` sans tiers ne doit jamais partir au serveur).
 */
export function jumpFromHint(
  hint: NavHint,
  vars: Record<string, string>,
  subtitle?: string,
): Jump | null {
  if (!hint.tool) return null;
  const filled = Object.fromEntries(
    Object.entries(vars).filter(([, v]) => v !== ""),
  );
  const args = fillTemplate(hint.args ?? {}, filled);
  if (hasUnfilledTemplate(args)) return null;
  return {
    label: hintLabel(hint),
    kind: hint.kind ?? "list",
    tool: { name: hint.tool, args },
    subtitle,
    message: hint.message ? fillTemplate(hint.message, filled) : undefined,
  };
}

/** Le niveau à empiler pour un saut — vide et en chargement. */
export function levelFromJump(jump: Jump): LevelInit {
  return {
    title: jump.label,
    kind: jump.kind,
    tool: jump.tool,
    subtitle: jump.subtitle,
    loading: true,
    jumps: jump.children,
    key: levelKey(jump.tool),
  };
}

export interface LoadedBody {
  body?: unknown;
  count?: number;
  error?: string;
}

/** Lit le corps d'un niveau dans la réponse d'un outil. */
export function bodyFromResult(result: ToolResultPayload): LoadedBody {
  const text = extractToolResultText(result);
  if (result.isError) return { error: text ?? t("common.error.tool_failed") };
  if (!text) return { error: t("common.error.no_payload") };
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const data = parsed.data;
    const count = typeof parsed.count === "number"
      ? parsed.count
      : Array.isArray(data)
      ? data.length
      : undefined;
    return { body: parsed, count };
  } catch {
    return { error: t("common.error.parse_failed") };
  }
}

export interface ToolHost {
  callServerTool(
    params: { name: string; arguments: Record<string, unknown> },
    options?: { timeout?: number },
  ): Promise<ToolResultPayload>;
}

export async function loadLevelBody(
  host: ToolHost,
  tool: ToolCall,
  timeout = 10_000,
): Promise<LoadedBody> {
  try {
    const result = await host.callServerTool(
      { name: tool.name, arguments: tool.args },
      { timeout },
    );
    return bodyFromResult(result);
  } catch (cause) {
    return {
      error: cause instanceof Error
        ? cause.message
        : t("common.error.tool_failed"),
    };
  }
}
