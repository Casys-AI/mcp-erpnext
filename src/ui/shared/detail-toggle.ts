/**
 * Un bouton explicite reagit au premier click d'un double-clic, jamais au
 * second. Le controle reste immediat sans ouvrir puis refermer le detail.
 */
export function acceptsDetailToggleClick(detail: number): boolean {
  return Number.isFinite(detail) && detail <= 1;
}
