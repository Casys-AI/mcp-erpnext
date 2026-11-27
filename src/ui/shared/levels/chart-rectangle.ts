type Point = { x: number; y: number };
type Bounds = Pick<DOMRectReadOnly, "bottom" | "left" | "right" | "top">;

export interface ChartSector {
  cx: number;
  cy: number;
  inner: number;
  outer: number;
  start: number;
  end: number;
}

function within(point: Point, rect: Bounds): boolean {
  return point.x >= rect.left && point.x <= rect.right &&
    point.y >= rect.top && point.y <= rect.bottom;
}

function segmentIntersects(
  from: Point,
  to: Point,
  rect: Bounds,
): boolean {
  let enter = 0;
  let exit = 1;
  for (
    const [start, finish, low, high] of [
      [from.x, to.x, rect.left, rect.right],
      [from.y, to.y, rect.top, rect.bottom],
    ]
  ) {
    const direction = finish - start;
    if (direction === 0) {
      if (start < low || start > high) return false;
      continue;
    }
    const first = (low - start) / direction;
    const last = (high - start) / direction;
    enter = Math.max(enter, Math.min(first, last));
    exit = Math.min(exit, Math.max(first, last));
  }
  return enter <= exit;
}

/** Intersect the filled mark, including the two circular and two radial edges. */
export function chartSectorIntersects(
  { cx, cy, inner, outer, start, end }: ChartSector,
  bounds: Bounds,
): boolean {
  if (outer <= 0 || start === end) return false;
  const rect = {
    left: bounds.left - cx,
    top: bounds.top - cy,
    right: bounds.right - cx,
    bottom: bounds.bottom - cy,
  };
  const angleOrigin = Math.min(start, end);
  const span = Math.min(360, Math.abs(end - start));
  const inAngle = ({ x, y }: Point) => {
    const angle = Math.atan2(-y, x) * 180 / Math.PI;
    return (((angle - angleOrigin) % 360) + 360) % 360 <= span;
  };
  const inSector = (point: Point) => {
    const distance = Math.hypot(point.x, point.y);
    return distance >= inner && distance <= outer &&
      (distance === 0 || inAngle(point));
  };
  const corners = [
    { x: rect.left, y: rect.top },
    { x: rect.left, y: rect.bottom },
    { x: rect.right, y: rect.top },
    { x: rect.right, y: rect.bottom },
  ];
  if (corners.some(inSector)) return true;
  const polar = (radius: number, angle: number) => {
    const rad = angle * Math.PI / 180;
    return { x: radius * Math.cos(rad), y: -radius * Math.sin(rad) };
  };
  if (
    [start, end].some((angle) =>
      segmentIntersects(polar(inner, angle), polar(outer, angle), rect)
    )
  ) return true;

  for (const radius of [inner, outer]) {
    if (radius === 0) continue;
    for (const x of [rect.left, rect.right]) {
      if (Math.abs(x) > radius) continue;
      const y = Math.sqrt(radius * radius - x * x);
      if (
        [{ x, y }, { x, y: -y }].some((point) =>
          within(point, rect) && inAngle(point)
        )
      ) return true;
    }
    for (const y of [rect.top, rect.bottom]) {
      if (Math.abs(y) > radius) continue;
      const x = Math.sqrt(radius * radius - y * y);
      if (
        [{ x, y }, { x: -x, y }].some((point) =>
          within(point, rect) && inAngle(point)
        )
      ) return true;
    }
  }
  return false;
}
