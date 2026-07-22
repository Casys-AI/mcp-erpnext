/**
 * Tests for submit-helpers.ts
 *
 * @module lib/erpnext/tests/tools/submit-helpers_test
 */

import { assertEquals } from "@std/assert";
import {
  roundedTotalFallbackWarning,
  withRoundedTotalFallback,
} from "./submit-helpers.ts";

Deno.test("withRoundedTotalFallback - sets disable_rounded_total when base_rounded_total is null", () => {
  const doc = { name: "SO-001", base_rounded_total: null };
  const result = withRoundedTotalFallback(doc);
  assertEquals(result.disable_rounded_total, 1);
});

Deno.test("withRoundedTotalFallback - sets disable_rounded_total when rounded_total is null", () => {
  const doc = { name: "SO-001", rounded_total: null };
  const result = withRoundedTotalFallback(doc);
  assertEquals(result.disable_rounded_total, 1);
});

Deno.test("withRoundedTotalFallback - leaves doc untouched when rounded totals are set", () => {
  const doc = {
    name: "SO-001",
    base_rounded_total: 100,
    rounded_total: 100,
  };
  const result = withRoundedTotalFallback(doc);
  assertEquals(result, doc);
});

Deno.test("withRoundedTotalFallback - leaves doc untouched when fields are absent (non-transactional doctype)", () => {
  const doc = { name: "Warehouse Type" };
  const result = withRoundedTotalFallback(doc);
  assertEquals(result, doc);
});

Deno.test("withRoundedTotalFallback - does not touch a doc that already has disable_rounded_total set to 1", () => {
  const doc = {
    name: "SO-001",
    base_rounded_total: null,
    disable_rounded_total: 1,
  };
  const result = withRoundedTotalFallback(doc);
  assertEquals(result, doc);
});

Deno.test("roundedTotalFallbackWarning - warns when the fallback patched the doc", () => {
  const original = { name: "SO-001", base_rounded_total: null };
  const patched = withRoundedTotalFallback(original);
  const warnings = roundedTotalFallbackWarning(original, patched);
  assertEquals(warnings.length, 1);
});

Deno.test("roundedTotalFallbackWarning - no warning when totals were already set", () => {
  const original = {
    name: "SO-001",
    base_rounded_total: 100,
    rounded_total: 100,
  };
  const patched = withRoundedTotalFallback(original);
  const warnings = roundedTotalFallbackWarning(original, patched);
  assertEquals(warnings, []);
});

Deno.test("roundedTotalFallbackWarning - no warning when disable_rounded_total was already 1", () => {
  const original = {
    name: "SO-001",
    base_rounded_total: null,
    disable_rounded_total: 1,
  };
  const patched = withRoundedTotalFallback(original);
  const warnings = roundedTotalFallbackWarning(original, patched);
  assertEquals(warnings, []);
});
