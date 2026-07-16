import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import type { FrappeClient } from "../api/frappe-client.ts";
import {
  fetchDocAfterAssignment,
  prepareAssignment,
  validateAssignees,
} from "./assignment.ts";
import type { ErpNextToolContext } from "./types.ts";

// deno-lint-ignore no-explicit-any
type AnyFn = (...args: any[]) => any;

function makeCtx(overrides: Record<string, AnyFn> = {}): ErpNextToolContext {
  const client = {
    list: async () => [],
    get: async () => ({ name: "TEST-001" }),
    create: async () => ({ name: "TEST-001" }),
    update: async () => ({ name: "TEST-001" }),
    delete: async () => {},
    callMethod: async () => null,
    ...overrides,
  } as unknown as FrappeClient;
  return { client };
}

Deno.test("prepareAssignment returns undefined without assign_to", () => {
  assertEquals(prepareAssignment({}, "tool"), undefined);
});

Deno.test("prepareAssignment trims and deduplicates assignees", () => {
  const prepared = prepareAssignment(
    { assign_to: [" a@example.com ", "a@example.com", "b@example.com"] },
    "tool",
  );
  assertEquals(prepared?.assignees, ["a@example.com", "b@example.com"]);
});

Deno.test("prepareAssignment caps the number of distinct assignees", () => {
  const assignees = Array.from(
    { length: 51 },
    (_, i) => `user${i}@example.com`,
  );
  assertThrows(
    () => prepareAssignment({ assign_to: assignees }, "tool"),
    Error,
    "at most 50 distinct users per call (got 51)",
  );
});

Deno.test("prepareAssignment accepts exactly 50 distinct assignees", () => {
  const assignees = Array.from(
    { length: 50 },
    (_, i) => `user${i}@example.com`,
  );
  const prepared = prepareAssignment({ assign_to: assignees }, "tool");
  assertEquals(prepared?.assignees.length, 50);
});

Deno.test("validateAssignees reports the first missing user", async () => {
  await assertRejects(
    () =>
      validateAssignees(
        ["a@example.com", "b@example.com"],
        "tool",
        makeCtx({ list: async () => [{ name: "b@example.com", enabled: 1 }] }),
      ),
    Error,
    "User 'a@example.com' does not exist",
  );
});

Deno.test("fetchDocAfterAssignment marks re-fetch failures as post-assignment", async () => {
  const original = new Error("HTTP 502 Bad Gateway");
  const ctx = makeCtx({
    get: async () => {
      throw original;
    },
  });
  const rejection = await assertRejects(
    () =>
      fetchDocAfterAssignment("Task", "TASK-001", ctx, "erpnext_task_update"),
    Error,
    "Task TASK-001 assignment succeeded, but re-fetching the document failed: HTTP 502 Bad Gateway",
  );
  assertEquals((rejection as Error).cause, original);
});
