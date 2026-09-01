/**
 * Décalage `scrollTop` pour amener un enfant dans le cadre d'un scroller,
 * sans toucher aux ancêtres — `scrollIntoView` remonterait jusqu'à l'iframe
 * hôte.
 *
 * Même règle que `block: "nearest"` : rien si déjà visible ; le minimum
 * sinon ; si l'enfant dépasse le cadre, on aligne le haut (début du détail,
 * pas le pied du squelette qu'on venait de viser).
 */

export function nearestScrollDelta(
  scroller: { top: number; bottom: number },
  child: { top: number; bottom: number },
): number {
  if (child.top >= scroller.top && child.bottom <= scroller.bottom) {
    return 0;
  }
  const childHeight = child.bottom - child.top;
  const frameHeight = scroller.bottom - scroller.top;
  if (childHeight >= frameHeight || child.top < scroller.top) {
    return child.top - scroller.top;
  }
  return child.bottom - scroller.bottom;
}
