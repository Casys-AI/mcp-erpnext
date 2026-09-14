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
