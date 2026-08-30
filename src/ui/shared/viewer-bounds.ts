/** Dimensions verticales qu'un hôte MCP peut annoncer à une vue. */
export interface ViewerContainerDimensions {
  height?: unknown;
  maxHeight?: unknown;
}

function positivePixels(value: unknown): string | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? `${value}px`
    : null;
}

/**
 * Borne la racine sur le conteneur réel de l'hôte sans utiliser `100vh`.
 * Sans dimension annoncée, la vue reste intrinsèque et laisse l'auto-resize
 * du SDK négocier sa taille.
 */
export function viewerBoundsStyle(
  dimensions: ViewerContainerDimensions | undefined,
) {
  const height = positivePixels(dimensions?.height);
  if (height) return { height };
  const maxHeight = positivePixels(dimensions?.maxHeight);
  return maxHeight ? { maxHeight } : undefined;
}
