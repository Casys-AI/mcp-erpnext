import { assertEquals } from "@std/assert";
import { setLocaleSource } from "../../shared/format.ts";
import { formatDeltaPercent } from "./kpi-format.ts";

Deno.test("KPI delta preserves percentage points and localizes fractional growth", () => {
  setLocaleSource(() => "fr-FR");
  assertEquals(formatDeltaPercent(2.8).replace(/\s/g, ""), "2,8%");
  assertEquals(formatDeltaPercent(-2.8).replace(/\s/g, ""), "2,8%");
  assertEquals(formatDeltaPercent(0).replace(/\s/g, ""), "0%");
  assertEquals(formatDeltaPercent(250).replace(/\s/g, ""), "250%");
});

Deno.test("KPI delta follows a new host locale without changing its scale", () => {
  setLocaleSource(() => "en-US");
  assertEquals(formatDeltaPercent(12.5), "12.5%");
  setLocaleSource(() => "fr-FR");
  assertEquals(formatDeltaPercent(12.5).replace(/\s/g, ""), "12,5%");
});

Deno.test("KPI delta invalid values remain absent", () => {
  for (const value of [undefined, null, NaN, Infinity, "invalid"]) {
    assertEquals(formatDeltaPercent(value), "—");
  }
});
