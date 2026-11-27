import { useVisualItemGestures } from "@mcpview/components/preact/controls";
import { chartSectorIntersects } from "./chart-rectangle.ts";

export function useChartGestures<T extends HTMLElement>(
  options: Parameters<typeof useVisualItemGestures<T>>[0],
) {
  return useVisualItemGestures<T>({
    ...options,
    intersectsItem: chartMarkIntersects,
    getItemBounds: (item) =>
      item.hasAttribute("data-chart-no-range")
        ? new DOMRect()
        : (item.querySelector("[data-chart-geometry]") ?? item)
          .getBoundingClientRect(),
  });
}

// A stroke or filled area can resolve its nearest point before passing the
// click to the same gesture handlers as the exact mark.
export function activateNearestChartMark(
  surface: Element,
  id: string,
  event: MouseEvent,
): boolean {
  const mark = surface.querySelector(
    `[data-visual-item="${CSS.escape(id)}"]:not([data-chart-no-range])`,
  );
  if (!mark) return false;
  mark.dispatchEvent(
    new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      detail: event.detail,
      view: event.view,
    }),
  );
  return true;
}

export function chartMarkIntersects(mark: Element, rect: DOMRectReadOnly) {
  const geometry = mark.querySelector("[data-chart-geometry]") ?? mark;
  const sector = mark.getAttribute("data-chart-sector");
  if (!sector && !(geometry instanceof SVGCircleElement)) return true;
  if (!(geometry instanceof SVGGraphicsElement)) return true;
  const transform = geometry.getScreenCTM()?.inverse();
  if (!transform) return false;
  // Recharts lays out these marks in an axis-aligned SVG viewBox.
  const first = new DOMPoint(rect.left, rect.top).matrixTransform(transform);
  const last = new DOMPoint(rect.right, rect.bottom).matrixTransform(transform);
  const bounds = {
    left: Math.min(first.x, last.x),
    top: Math.min(first.y, last.y),
    right: Math.max(first.x, last.x),
    bottom: Math.max(first.y, last.y),
  };
  if (sector) {
    const [cx, cy, inner, outer, start, end] = sector.split(",").map(Number);
    return chartSectorIntersects({ cx, cy, inner, outer, start, end }, bounds);
  }
  if (geometry instanceof SVGCircleElement) {
    return chartSectorIntersects({
      cx: geometry.cx.baseVal.value,
      cy: geometry.cy.baseVal.value,
      inner: 0,
      outer: geometry.r.baseVal.value,
      start: 0,
      end: 360,
    }, bounds);
  }
  return true;
}
