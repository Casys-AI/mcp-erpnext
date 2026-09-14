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
