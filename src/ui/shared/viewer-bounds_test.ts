import { assertEquals } from "@std/assert";
import { viewerBoundsStyle } from "./viewer-bounds.ts";

Deno.test("viewer bounds - exact host height wins", () => {
  assertEquals(viewerBoundsStyle({ height: 640, maxHeight: 720 }), {
    height: "640px",
  });
});

Deno.test("viewer bounds - max height bounds an otherwise intrinsic view", () => {
  assertEquals(viewerBoundsStyle({ maxHeight: 720 }), {
    maxHeight: "720px",
  });
});

Deno.test("viewer bounds - invalid or absent dimensions stay intrinsic", () => {
  assertEquals(viewerBoundsStyle(undefined), undefined);
  assertEquals(viewerBoundsStyle({ height: 0, maxHeight: -1 }), undefined);
  assertEquals(viewerBoundsStyle({ height: Number.NaN }), undefined);
  assertEquals(viewerBoundsStyle({ height: "640" }), undefined);
});
