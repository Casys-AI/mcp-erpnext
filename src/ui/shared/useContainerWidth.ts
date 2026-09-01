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

import { useLayoutEffect, useRef, useState } from "preact/hooks";
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

  // useLayoutEffect, pas useEffect : la mesure doit être posée avant que le
  // navigateur peigne. Le ResizeObserver ne livre sa première entrée qu'après
  // ce paint, et en aval `isNarrow(null)` est faux — un conteneur étroit se
  // rendrait donc « large » le temps d'une frame, exactement le clignotement
  // que le null initial cherchait à éviter.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    setWidth(contentWidth(element));
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}

/**
 * La largeur de contenu, dans la même boîte que `contentRect`.
 *
 * `getBoundingClientRect` compterait la bordure, or la coque en porte une de
 * 1 px de chaque côté (ui.tsx). La mesure initiale déciderait donc 2 px trop
 * large et le premier passage du ResizeObserver la corrigerait après le paint
 * — soit le clignotement qu'on retire ici, dans l'autre sens.
 */
function contentWidth(element: HTMLElement): number {
  const style = getComputedStyle(element);
  return element.clientWidth -
    parseFloat(style.paddingLeft) -
    parseFloat(style.paddingRight);
}

/** Vrai quand la mesure est faite et que le conteneur est sous le seuil. */
export function isNarrow(width: number | null): boolean {
  return width !== null && width < NARROW_BREAKPOINT;
}
