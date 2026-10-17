/**
 * Ce que le modèle lit d'un résultat d'outil.
 *
 * La spec MCP Apps sépare les deux lectures : `content` est la représentation
 * texte destinée au modèle, `structuredContent` est « not added to model
 * context » et `_meta` est « not intended for model context ». En pratique,
 * ChatGPT expose `structuredContent` au modèle et Claude Code le substitue au
 * texte : seul `_meta` est caché partout. L'enrichissement viewer (refresh,
 * sauts, manifeste d'outils) voyage donc dans `_meta["io.casys/viewer"]`, que
 * la vue reçoit avec le `CallToolResult` complet et refusionne dans les
 * données ; `content` et `structuredContent` ne portent que le métier.
 */

/** Clé `_meta` du bloc d'enrichissement viewer (versionné : `{ version: 1, … }`). */
export const VIEWER_META_KEY = "io.casys/viewer";

/**
 * Clés ajoutées pour la vue. Liste explicite plutôt qu'une règle de préfixe :
 * une future clé `_` destinée au modèle ne doit pas disparaître en silence.
 * Le test de contrat vérifie que `withUiRefreshRequest` n'ajoute rien d'autre.
 */
export const VIEWER_ONLY_RESULT_KEYS = [
  "_meta",
  "refreshRequest",
  "_availableTools",
  "_rowAction",
  "_sendMessageHints",
  "_drillDown",
  "_trendDrillDown",
  "_jumps",
  "_stageJumps",
  "_pointJumps",
  "_seriesPointJumps",
] as const;

/** Copie superficielle du résultat sans les clés réservées à la vue. */
export function modelVisiblePayload(
  result: Record<string, unknown>,
): Record<string, unknown> {
  const payload = { ...result };
  for (const key of VIEWER_ONLY_RESULT_KEYS) delete payload[key];
  return payload;
}

/**
 * Découpe un résultat enrichi en données métier (`data`, pour `content` et
 * `structuredContent`) et enrichissement viewer (`viewer`, pour
 * `_meta[VIEWER_META_KEY]`). `viewer` regroupe exactement les clés viewer
 * présentes, `_meta` excepté : le `_meta` imbriqué du résultat reste porté
 * par le `_meta` du `CallToolResult`, pas dupliqué dans le bloc.
 */
export function splitViewerResult(result: Record<string, unknown>): {
  data: Record<string, unknown>;
  viewer: Record<string, unknown>;
} {
  const viewer: Record<string, unknown> = {};
  for (const key of VIEWER_ONLY_RESULT_KEYS) {
    if (key !== "_meta" && key in result) viewer[key] = result[key];
  }
  return { data: modelVisiblePayload(result), viewer };
}
