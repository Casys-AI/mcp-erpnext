/**
 * Method Allowlist Tests
 *
 * Pure unit tests for the erpnext_method_call gate — no FrappeClient needed.
 *
 * @module lib/erpnext/tests/tools/method-allowlist_test
 */

import { assertEquals } from "@std/assert";
import {
  isMethodAllowed,
  isValidMethodPath,
  parseMethodAllowlist,
} from "./method-allowlist.ts";

// ── isValidMethodPath ───────────────────────────────────────────────────────

Deno.test("isValidMethodPath - accepts dotted paths", () => {
  assertEquals(isValidMethodPath("frappe.client.get_count"), true);
  assertEquals(isValidMethodPath("my_app.api.do_thing"), true);
  assertEquals(isValidMethodPath("_private.api.x2"), true);
});

Deno.test("isValidMethodPath - rejects a bare single segment", () => {
  assertEquals(isValidMethodPath("ping"), false);
});

Deno.test("isValidMethodPath - rejects characters that could rewrite the URL", () => {
  assertEquals(isValidMethodPath("a.b?cmd=frappe.client.delete"), false);
  assertEquals(isValidMethodPath("a.b/../../login"), false);
  assertEquals(isValidMethodPath("a.b#frag"), false);
  assertEquals(isValidMethodPath("a.b c"), false);
  assertEquals(isValidMethodPath("a..b"), false);
  assertEquals(isValidMethodPath("1a.b"), false);
  assertEquals(isValidMethodPath(""), false);
});

// ── parseMethodAllowlist ────────────────────────────────────────────────────

Deno.test("parseMethodAllowlist - unset or empty yields no patterns", () => {
  assertEquals(parseMethodAllowlist(undefined), []);
  assertEquals(parseMethodAllowlist(""), []);
  assertEquals(parseMethodAllowlist("  ,  ,"), []);
});

Deno.test("parseMethodAllowlist - trims and drops empty entries", () => {
  assertEquals(
    parseMethodAllowlist(" my_app.api.* , frappe.client.get_count ,, "),
    ["my_app.api.*", "frappe.client.get_count"],
  );
});

// ── isMethodAllowed ─────────────────────────────────────────────────────────

Deno.test("isMethodAllowed - exact match", () => {
  const patterns = ["my_app.api.do_thing"];
  assertEquals(isMethodAllowed("my_app.api.do_thing", patterns), true);
  assertEquals(isMethodAllowed("my_app.api.do_thing_else", patterns), false);
  assertEquals(isMethodAllowed("my_app.api", patterns), false);
});

Deno.test("isMethodAllowed - prefix wildcard covers nested paths", () => {
  const patterns = ["my_app.api.*"];
  assertEquals(isMethodAllowed("my_app.api.do_thing", patterns), true);
  assertEquals(isMethodAllowed("my_app.api.sub.do_thing", patterns), true);
  // The prefix must end at a segment boundary, so a same-named neighbour module
  // must not slip through.
  assertEquals(isMethodAllowed("my_app.apixyz.do_thing", patterns), false);
  assertEquals(isMethodAllowed("my_app.api", patterns), false);
  assertEquals(isMethodAllowed("other_app.api.do_thing", patterns), false);
});

Deno.test("isMethodAllowed - bare star allows everything", () => {
  assertEquals(isMethodAllowed("frappe.client.delete", ["*"]), true);
});

// This is the pure matcher: nothing is in an empty list. "No allowlist means no
// restriction" is a policy the tool handler applies by not consulting the
// matcher at all, which is why the two answers differ for the same input.
Deno.test("isMethodAllowed - nothing matches an empty pattern list", () => {
  assertEquals(isMethodAllowed("frappe.client.get_count", []), false);
});

Deno.test("isMethodAllowed - matching is case-sensitive", () => {
  assertEquals(
    isMethodAllowed("My_App.api.do_thing", ["my_app.api.*"]),
    false,
  );
});
