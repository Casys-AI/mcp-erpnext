import { assertEquals } from "@std/assert";
import { chartSectorIntersects } from "./chart-rectangle.ts";

const donut = { cx: 0, cy: 0, inner: 5, outer: 10, start: 0, end: 360 };
const rect = (left: number, top: number, right: number, bottom: number) => ({
  left,
  top,
  right,
  bottom,
});

Deno.test("chart rectangle excludes the donut hole and empty corners of a circular mark", () => {
  assertEquals(chartSectorIntersects(donut, rect(-1, -1, 1, 1)), false);
  assertEquals(chartSectorIntersects(donut, rect(-8, -8, -7.5, -7.5)), false);
  assertEquals(chartSectorIntersects(donut, rect(-6, -1, -3, 1)), true);
  assertEquals(
    chartSectorIntersects({ ...donut, inner: 0 }, rect(-1, -1, 1, 1)),
    true,
  );
});

Deno.test("chart rectangle distinguishes neighboring sectors and handles angles across zero", () => {
  const right = { ...donut, start: 45, end: -45 };
  const upper = { ...donut, start: 45, end: 135 };
  const interior = rect(6, -1, 9, 1);
  assertEquals(chartSectorIntersects(right, interior), true);
  assertEquals(chartSectorIntersects(upper, interior), false);
  assertEquals(
    chartSectorIntersects({ ...right, start: 315, end: 405 }, interior),
    true,
  );
});

Deno.test("chart rectangle detects a crossing or fully contained sector with no rectangle corner inside", () => {
  const arc = { ...donut, start: 75, end: 105 };
  assertEquals(chartSectorIntersects(arc, rect(-3, -8, 3, -7)), true);
  assertEquals(chartSectorIntersects(arc, rect(-12, -12, 12, 12)), true);
  assertEquals(chartSectorIntersects(arc, rect(-3, -3, 3, -2)), false);
});
