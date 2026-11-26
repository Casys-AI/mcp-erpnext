/**
 * Le mode de mise en page d'une vue : large, panneau latéral, ou mobile.
 *
 * Trois traitements, pas une échelle de largeurs : le panneau (380 px) empile
 * ses lignes, le mobile (390 px) garde son tableau à lignes de 40 px. C'est le
 * pointeur qui les sépare — un téléphone est grossier, un panneau de bureau
 * est fin, à largeur identique — et qui justifie les cibles tactiles.
 *
 * La décision vit désormais dans `@mcpview/components/layout`.
 *
 *   « Les listes restent des tableaux. Trois colonnes, ligne de 40 px,
 *     en-têtes conservés. » — chapeau de la section mobile · 390
 */

import {
  layoutFromSearch as kitLayoutFromSearch,
  useViewerLayout as useKitViewerLayout,
} from "@mcpview/components/layout";
import { useLayoutEffect, useState } from "preact/hooks";
import { useHostContext } from "./host-context-hook.ts";

export type { ViewerLayout } from "@mcpview/components/layout";

export function layoutFromSearch(search = location.search) {
  return kitLayoutFromSearch(search);
}

export function useViewerLayout<T extends HTMLElement>() {
  const host = useHostContext();
  const [inPanel, setInPanel] = useState(false);
  // The host grants dimensions to the entire iframe. Each Compose panel has its
  // own space; let the SDK measure the native viewer inside that panel.
  const view = useKitViewerLayout<T>(
    inPanel ? { ...host, containerDimensions: undefined } : host,
  );
  useLayoutEffect(() => {
    setInPanel(Boolean(view.ref.current?.closest(".code-mode-panel-body")));
  }, [view.ref]);
  return view;
}
