/**
 * Largeur observée d'un conteneur, pour choisir une mise en page.
 *
 * On mesure le conteneur, pas la fenêtre : ces vues sont rendues dans une
 * iframe d'hôte MCP dont la largeur ne dit rien de celle de l'écran. Un
 * matchMedia sur la fenêtre donnerait « large » à un panneau de 380 px ouvert
 * dans un navigateur plein écran.
 *
 * Une requête de conteneur CSS suffirait à masquer des blocs, mais pas à
 * recomposer la ligne : la maquette étroite empile l'identifiant et le client
 * à gauche et pousse le montant à droite, ce qui suppose de savoir laquelle
 * des colonnes — dynamiques, dérivées du DocType — porte le montant.
 */

import { useEffect, useRef, useState } from "preact/hooks";
import type { RefObject } from "preact";

/** En deçà, la maquette abandonne le tableau pour des lignes empilées. */
export const NARROW_BREAKPOINT = 480;

export function useContainerWidth<T extends HTMLElement>(): [
  RefObject<T>,
  number | null,
] {
  const ref = useRef<T>(null);
  // null tant qu'on n'a pas mesuré : rendre « large » par défaut ferait
  // clignoter la vue étroite au premier paint.
  const [width, setWidth] = useState<number | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    if (typeof ResizeObserver === "undefined") {
      setWidth(element.getBoundingClientRect().width);
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}

/** Vrai quand la mesure est faite et que le conteneur est sous le seuil. */
export function isNarrow(width: number | null): boolean {
  return width !== null && width < NARROW_BREAKPOINT;
}
