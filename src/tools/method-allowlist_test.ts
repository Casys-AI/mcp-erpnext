/**
 * Tests for method-allowlist.ts
 *
 * @module lib/erpnext/tests/tools/method-allowlist_test
 */

import { assertEquals } from "@std/assert";
import {
  isMethodAllowed,
  isValidMethodPath,
  loadMethodAllowlist,
} from "./method-allowlist.ts";

Deno.test("isValidMethodPath - accepts dotted paths", () => {
  assertEquals(isValidMethodPath("frappe.client.get_count"), true);
  assertEquals(isValidMethodPath("my_app.api.reconcile"), true);
  assertEquals(isValidMethodPath("a"), true);
});

Deno.test("isValidMethodPath - rejects malformed paths", () => {
  for (
    const bad of [
      "",
      ".",
      "frappe..client",
      ".frappe.client",
      "frappe.client.",
      "frappe.client.*",
      "frappe client",
      "frappe/client",
    ]
  ) {
    assertEquals(isValidMethodPath(bad), false, bad);
  }
});

Deno.test("isMethodAllowed - deny-by-default with an empty allowlist", () => {
  assertEquals(isMethodAllowed("frappe.client.get_count", []), false);
});

Deno.test("isMethodAllowed - '*' allows anything", () => {
  assertEquals(isMethodAllowed("my_app.api.anything", ["*"]), true);
});

Deno.test("isMethodAllowed - exact match", () => {
  const list = ["frappe.client.get_count"];
  assertEquals(isMethodAllowed("frappe.client.get_count", list), true);
  assertEquals(isMethodAllowed("frappe.client.get_list", list), false);
});

Deno.test("isMethodAllowed - 'prefix.*' wildcard matches methods under the prefix", () => {
  const list = ["my_app.api.*"];
  assertEquals(isMethodAllowed("my_app.api.reconcile", list), true);
  assertEquals(isMethodAllowed("my_app.api.sub.reconcile", list), true);
  assertEquals(isMethodAllowed("my_app.other.reconcile", list), false);
});

Deno.test("isMethodAllowed - 'prefix.*' does not match the bare prefix itself", () => {
  assertEquals(isMethodAllowed("my_app.api", ["my_app.api.*"]), false);
});

Deno.test("loadMethodAllowlist - parses a comma-separated env var", () => {
  using _ = withAllowlist("frappe.client.get_count, my_app.api.*");
  assertEquals(loadMethodAllowlist(), [
    "frappe.client.get_count",
    "my_app.api.*",
  ]);
});

Deno.test("loadMethodAllowlist - unset or blank yields an empty list", () => {
  using _ = withAllowlist(undefined);
  assertEquals(loadMethodAllowlist(), []);
});

function withAllowlist(value?: string): Disposable {
  const previous = Deno.env.get("ERPNEXT_METHOD_ALLOWLIST");
  Deno.env.delete("ERPNEXT_METHOD_ALLOWLIST");
  if (value !== undefined) Deno.env.set("ERPNEXT_METHOD_ALLOWLIST", value);

  return {
    [Symbol.dispose]() {
      Deno.env.delete("ERPNEXT_METHOD_ALLOWLIST");
      if (previous !== undefined) {
        Deno.env.set("ERPNEXT_METHOD_ALLOWLIST", previous);
      }
    },
  };
}
