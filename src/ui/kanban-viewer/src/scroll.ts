/**
 * Physical overflow edges of a horizontal scroller.
 *
 * `left` / `right` are the PHYSICAL sides that still hide content, whatever the
 * writing direction. In LTR `scrollLeft` runs 0 -> max; in RTL browsers report
 * it from 0 (start, rightmost) down to -max (leftmost), so the two cases are
 * mirrored. A 1px tolerance absorbs sub-pixel rounding.
 */
export function horizontalScrollEdges(
  scrollLeft: number,
  scrollWidth: number,
  clientWidth: number,
  rtl: boolean,
): { left: boolean; right: boolean } {
  const max = Math.max(0, scrollWidth - clientWidth);
  return rtl
    ? { left: scrollLeft > -max + 1, right: scrollLeft < -1 }
    : { left: scrollLeft > 1, right: scrollLeft < max - 1 };
}
