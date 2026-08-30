import { assertEquals } from "@std/assert";
import { acceptsDetailToggleClick } from "./detail-toggle.ts";

Deno.test("detail toggle - clic, clavier et double-clic restent deterministes", () => {
  assertEquals(acceptsDetailToggleClick(0), true);
  assertEquals(acceptsDetailToggleClick(1), true);
  assertEquals(acceptsDetailToggleClick(2), false);
  assertEquals(acceptsDetailToggleClick(3), false);
  assertEquals(acceptsDetailToggleClick(Number.NaN), false);
});
