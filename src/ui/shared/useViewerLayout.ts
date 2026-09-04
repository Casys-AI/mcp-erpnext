/**
 * Le mode de mise en page d'une vue : large, panneau latéral, ou mobile.
 *
 * Trois traitements, pas une échelle de largeurs : le panneau (380 px) empile
 * ses lignes, le mobile (390 px) garde son tableau à lignes de 40 px. C'est le
 * pointeur qui les sépare — un téléphone est grossier, un panneau de bureau
 * est fin, à largeur identique — et qui justifie les cibles tactiles.
 *
 * La décision vit désormais dans `@casys/mcp-view-components/layout`.
 *
 *   « Les listes restent des tableaux. Trois colonnes, ligne de 40 px,
 *     en-têtes conservés. » — chapeau de la section mobile · 390
 */

import {
  layoutFromSearch as kitLayoutFromSearch,
  useViewerLayout as useKitViewerLayout,
} from "@casys/mcp-view-components/layout";
import { useHostContext } from "./host-context-hook";

export type { ViewerLayout } from "@casys/mcp-view-components/layout";

export function layoutFromSearch(search = location.search) {
  return kitLayoutFromSearch(search);
}

export function useViewerLayout<T extends HTMLElement>() {
  const host = useHostContext();
  return useKitViewerLayout<T>(host);
}
