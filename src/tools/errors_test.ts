/**
 * ToolInputError: the rendered message is the wire contract.
 *
 * @module lib/erpnext/tools/errors_test
 */

import { assert, assertEquals, assertThrows } from "@std/assert";
import {
  formatToolInputError,
  isToolInputError,
  parseToolInputError,
  TOOL_INPUT_ERROR_CODES,
  ToolInputError,
} from "./errors.ts";

Deno.test("ToolInputError - renders '[tool] CODE: message. Recovery: recovery'", () => {
  const error = new ToolInputError(
    "erpnext_doc_list",
    "INVALID_FILTER",
    "filters[0] has 2 element(s); expected 3 or 4",
    { recovery: "Send [field, operator, value]." },
  );

  assertEquals(
    error.message,
    "[erpnext_doc_list] INVALID_FILTER: filters[0] has 2 element(s); expected 3 or 4. " +
      "Recovery: Send [field, operator, value].",
  );
  assertEquals(error.name, "ToolInputError");
  assert(error instanceof Error);
  assert(isToolInputError(error));
  assert(!isToolInputError(new Error("plain")));
});

Deno.test("ToolInputError - exposes typed code, context, recovery and retryable", () => {
  const context = { index: 1 };
  const error = new ToolInputError("t", "INVALID_INPUT", "bad", {
    recovery: "fix it",
    context,
  });

  assertEquals(error.tool, "t");
  assertEquals(error.code, "INVALID_INPUT");
  assertEquals(error.detail, "bad");
  assertEquals(error.recovery, "fix it");
  assertEquals(error.retryable, false);
  assertEquals(error.context, { index: 1 });
  // The context is a frozen copy: the caller's object can neither leak in nor
  // be mutated through the error.
  assert(Object.isFrozen(error.context));
  assert(error.context !== context);
  assertThrows(() => {
    (error.context as Record<string, unknown>).index = 2;
  }, TypeError);
  assertEquals(
    new ToolInputError("t", "INVALID_INPUT", "bad", {
      recovery: "retry",
      retryable: true,
    }).retryable,
    true,
  );
});

Deno.test("ToolInputError - never doubles the sentence punctuation", () => {
  assertEquals(
    formatToolInputError("t", "INVALID_INPUT", "bad input.", "Try again."),
    "[t] INVALID_INPUT: bad input. Recovery: Try again.",
  );
  assertEquals(
    formatToolInputError("t", "INVALID_INPUT", "bad input", "Try again"),
    "[t] INVALID_INPUT: bad input. Recovery: Try again.",
  );
});

Deno.test("parseToolInputError - is the exact inverse of the rendered message", () => {
  const error = new ToolInputError(
    "erpnext_doc_list",
    "INVALID_PAGINATION",
    "'limit' 0 means \"every row\". It drops 'offset' (40)",
    { recovery: "Use a positive 'limit'." },
  );

  assertEquals(parseToolInputError(error.message), {
    tool: "erpnext_doc_list",
    code: "INVALID_PAGINATION",
    message: "'limit' 0 means \"every row\". It drops 'offset' (40)",
    recovery: "Use a positive 'limit'.",
  });
});

Deno.test("parseToolInputError - returns null for text it did not render", () => {
  for (
    const text of [
      "",
      "Invalid arguments for erpnext_doc_list: Property /limit must be integer",
      "[erpnext_doc_list] something went wrong",
      "[erpnext_doc_list] lowercase: message. Recovery: x.",
    ]
  ) {
    assertEquals(parseToolInputError(text), null, text);
  }
});

Deno.test("ToolInputError codes - are unique upper-case identifiers", () => {
  assertEquals(
    new Set(TOOL_INPUT_ERROR_CODES).size,
    TOOL_INPUT_ERROR_CODES.length,
  );
  for (const code of TOOL_INPUT_ERROR_CODES) {
    assert(/^[A-Z][A-Z0-9_]*$/.test(code), code);
  }
});
