import { assertEquals } from "@std/assert";
import { horizontalScrollEdges } from "./scroll.ts";

Deno.test("Kanban scroll edges describe physical overflow for RTL negative offsets", () => {
  assertEquals(horizontalScrollEdges(0, 500, 300, true), {
    left: true,
    right: false,
  });
  assertEquals(horizontalScrollEdges(-100, 500, 300, true), {
    left: true,
    right: true,
  });
  assertEquals(horizontalScrollEdges(-200, 500, 300, true), {
    left: false,
    right: true,
  });
  assertEquals(horizontalScrollEdges(0, 200, 300, true), {
    left: false,
    right: false,
  });
  assertEquals(horizontalScrollEdges(0, 500, 300, false), {
    left: false,
    right: true,
  });
  assertEquals(horizontalScrollEdges(200, 500, 300, false), {
    left: true,
    right: false,
  });
});

Deno.test("Kanban scroll edges: nothing overflows when content fits, in both directions", () => {
  for (const rtl of [false, true]) {
    assertEquals(horizontalScrollEdges(0, 300, 300, rtl), {
      left: false,
      right: false,
    });
    assertEquals(horizontalScrollEdges(0, 100, 300, rtl), {
      left: false,
      right: false,
    });
  }
});

Deno.test("Kanban scroll edges: sub-pixel offsets at either extremity do not light a fade", () => {
  // LTR: 0.5px from start, 0.5px short of the end.
  assertEquals(horizontalScrollEdges(0.5, 500, 300, false), {
    left: false,
    right: true,
  });
  assertEquals(horizontalScrollEdges(199.5, 500, 300, false), {
    left: true,
    right: false,
  });
  // RTL: -0.5px from start (right edge), -199.5px = leftmost extremity.
  assertEquals(horizontalScrollEdges(-0.5, 500, 300, true), {
    left: true,
    right: false,
  });
  assertEquals(horizontalScrollEdges(-199.5, 500, 300, true), {
    left: false,
    right: true,
  });
});
