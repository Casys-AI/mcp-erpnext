/**
 * Le mode de mise en page d'une vue : large, panneau latéral, ou mobile.
 *
 * La maquette Direction B v2 décrit trois traitements, et le piège est qu'ils
 * ne forment pas une échelle de largeurs : le panneau latéral fait 380 px et
 * empile ses lignes, le mobile fait 390 px et garde son tableau. Le plus
 * étroit des deux est celui qui abandonne le moins de structure.
 *
 * Ce qui les sépare n'est donc pas la place disponible mais le contexte, et le
 * signal qui l'expose est le pointeur : un téléphone est grossier, un panneau
 * latéral de bureau est fin, à largeur identique. C'est aussi ce qui justifie
 * les lignes de 40 px du mobile — une cible tactile n'a de sens qu'au doigt.
 *
 *   « Les listes restent des tableaux. Trois colonnes, ligne de 40 px,
 *     en-têtes conservés. » — chapeau de la section mobile · 390
 */

import { useEffect, useState } from "preact/hooks";
import { isNarrow, useContainerWidth } from "./useContainerWidth";
import { useHostContext } from "./host-context-hook";

export type ViewerLayout = "wide" | "panel" | "mobile";

const LAYOUTS: ViewerLayout[] = ["wide", "panel", "mobile"];

/**
 * Surcharge explicite par l'URL — `?layout=mobile`.
 *
 * Sert à relire une mise en page sans l'appareil correspondant, et laisse un
 * hôte MCP qui connaît son contexte le déclarer plutôt que de le faire deviner.
 * Même esprit que le `?theme=` de casys-theme.ts.
 */
export function layoutFromSearch(
  search = location.search,
): ViewerLayout | null {
  const value = new URLSearchParams(search).get("layout");
  return LAYOUTS.includes(value as ViewerLayout) ? value as ViewerLayout : null;
}

/**
 * Vrai sur un pointeur grossier — doigt, stylet — plutôt qu'une souris.
 *
 * Repli navigateur seulement : quand l'hôte déclare `deviceCapabilities`,
 * c'est lui qui tranche (voir useViewerLayout). `matchMedia` interroge
 * l'appareil qui affiche la fenêtre, pas le contexte que l'hôte donne à
 * l'iframe — les deux peuvent différer.
 */
function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const query = matchMedia("(pointer: coarse)");
    setCoarse(query.matches);
    const onChange = (event: MediaQueryListEvent) => setCoarse(event.matches);
    // Un appareil hybride bascule quand on passe du trackpad à l'écran.
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return coarse;
}

/**
 * Le doigt selon l'hôte, ou selon le navigateur à défaut.
 *
 * `touch` seul ne suffit pas : un portable à écran tactile piloté à la souris
 * déclare `touch: true, hover: true`, et ce n'est pas un téléphone. On ne
 * bascule en mobile que si le doigt est là ET que le survol n'y est pas —
 * c'est cette absence qui justifie les cibles de 40 px.
 */
function useTouchInput(): boolean {
  const host = useHostContext();
  const fromBrowser = useCoarsePointer();
  const caps = host.deviceCapabilities;
  if (caps?.touch !== undefined) {
    return caps.touch && caps.hover !== true;
  }
  return fromBrowser;
}

export function useViewerLayout<T extends HTMLElement>() {
  const [ref, measured] = useContainerWidth<T>();
  const host = useHostContext();
  const touch = useTouchInput();
  const forced = typeof location === "undefined" ? null : layoutFromSearch();

  // La largeur de l'hôte prime sur la mesure quand il la donne : elle décrit
  // la place réellement accordée, là où le ResizeObserver mesure ce que
  // l'iframe a bien voulu prendre.
  const width = host.containerDimensions?.width ??
    host.containerDimensions?.maxWidth ??
    measured;

  // Une tablette au doigt mais au large garde la mise en page large : c'est la
  // place qui manque au mobile, le doigt ne fait que trancher entre les deux
  // traitements étroits.
  const detected: ViewerLayout = !isNarrow(width)
    ? "wide"
    : touch
    ? "mobile"
    : "panel";

  const layout = forced ?? detected;

  return { ref, width, layout } as const;
}
