/**
 * Lire le corps d'un niveau empilé.
 *
 * Un outil répond avec sa propre forme ; un niveau n'en retient que ce qu'il
 * sait rendre : une fiche (objet), des barres (libellés + valeurs), une
 * liste (`{ data: [] }`). Ces lectures sont pures et tolérantes — un corps
 * qui ne correspond pas donne `null`, jamais une exception.
 */

import type { NavHint } from "../jumps.ts";

export interface BarsBody {
  labels: string[];
  values: number[];
  unit?: string;
  /** Par libellé : le saut qu'une barre ouvre (enrichi par le serveur). */
  pointJumps?: Record<string, NavHint>;
}

/** `{ data: {...} }` ou l'objet lui-même — jamais un tableau. */
export function recordOf(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object") return null;
  const inner = (body as { data?: unknown }).data;
  const record = inner && typeof inner === "object" ? inner : body;
  return Array.isArray(record) ? null : record as Record<string, unknown>;
}

/**
 * `{ labels, values }`, ou la forme des outils graphiques
 * `{ labels, datasets: [{ values }] }` (première série).
 */
export function chartOf(body: unknown): BarsBody | null {
  if (!body || typeof body !== "object") return null;
  const b = body as {
    labels?: unknown;
    values?: unknown;
    unit?: unknown;
    datasets?: { values?: unknown }[];
    _pointJumps?: unknown;
  };
  if (!Array.isArray(b.labels)) return null;
  const values = Array.isArray(b.values)
    ? b.values
    : Array.isArray(b.datasets?.[0]?.values)
    ? b.datasets[0].values
    : null;
  if (!values) return null;
  return {
    labels: b.labels.map(String),
    values: values.map(Number),
    unit: typeof b.unit === "string" ? b.unit : undefined,
    pointJumps: b._pointJumps && typeof b._pointJumps === "object"
      ? b._pointJumps as Record<string, NavHint>
      : undefined,
  };
}

/** `{ data: [...] }` — la forme d'une liste. */
export function listOf<T extends { data?: unknown[] }>(
  body: unknown,
): T | null {
  if (!body || typeof body !== "object") return null;
  return Array.isArray((body as { data?: unknown }).data) ? body as T : null;
}
