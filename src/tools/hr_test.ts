/**
 * HR Tools Tests
 *
 * Focused on link resolution: these handlers accept an employee identifier, and
 * the distinction between "resolves a display name" and "requires an opaque ID"
 * is invisible from the schema — it lives in the handler body. That asymmetry
 * shipped as a real bug on three create handlers, so it is pinned here.
 *
 * @module lib/erpnext/tests/tools/hr_test
 */

// deno-lint-ignore-file no-explicit-any

import { assertEquals, assertRejects } from "@std/assert";
import { hrTools } from "./hr.ts";
import { FrappeAPIError, type FrappeClient } from "../api/frappe-client.ts";
import type { ErpNextToolContext } from "./types.ts";

type AnyFn = (...args: any[]) => any;

function makeMockClient(overrides: Record<string, AnyFn> = {}): FrappeClient {
  const mock: Record<string, AnyFn> = {
    list: async () => [],
    get: async () => ({ name: "TEST-001" }),
    create: async (_doctype: string, data: unknown) => ({
      name: "NEW-001",
      ...(data as object),
    }),
    update: async () => ({ name: "TEST-001" }),
    delete: async () => {},
    callMethod: async () => null,
    ...overrides,
  };
  return mock as unknown as FrappeClient;
}

function makeCtx(client: FrappeClient): ErpNextToolContext {
  return { client };
}

function getTool(name: string) {
  const tool = hrTools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool;
}

/** A client where `identifier` is not a valid ID but matches `matches` by name. */
function clientResolving(
  identifier: string,
  matches: Array<Record<string, unknown>>,
  onCreate?: (data: Record<string, unknown>) => void,
): FrappeClient {
  return makeMockClient({
    get: async (_doctype: string, name: string) => {
      if (name === identifier) throw new FrappeAPIError("Not Found", 404, null);
      return { name };
    },
    list: async (doctype: string) => (doctype === "Employee" ? matches : []),
    create: async (_doctype: string, data: unknown) => {
      onCreate?.(data as Record<string, unknown>);
      return { name: "NEW-001", ...(data as object) };
    },
  });
}

// ── write paths ─────────────────────────────────────────────────────────────

Deno.test("erpnext_leave_application_create - accepts an employee name, not just an ID", async () => {
  let created: Record<string, unknown> | undefined;
  const client = clientResolving(
    "John Smith",
    [{ name: "HR-EMP-00042", employee_name: "John Smith" }],
    (d) => created = d,
  );

  await getTool("erpnext_leave_application_create").handler(
    {
      employee: "John Smith",
      leave_type: "Casual Leave",
      from_date: "2026-08-01",
      to_date: "2026-08-02",
    },
    makeCtx(client),
  );

  assertEquals(created?.employee, "HR-EMP-00042");
});

Deno.test("erpnext_leave_application_create - refuses to guess between two employees", async () => {
  // The invariant: nothing is created when the name is ambiguous. Filing leave
  // against the wrong person is not something the agent can detect afterwards.
  let createCalled = false;
  const client = clientResolving("John", [
    { name: "HR-EMP-00042", employee_name: "John" },
    { name: "HR-EMP-00099", employee_name: "John" },
  ], () => createCalled = true);

  const error = await assertRejects(
    () =>
      getTool("erpnext_leave_application_create").handler(
        {
          employee: "John",
          leave_type: "Casual Leave",
          from_date: "2026-08-01",
          to_date: "2026-08-02",
        },
        makeCtx(client),
      ),
    Error,
  );

  assertEquals(createCalled, false, "must not create against a guess");
  assertEquals(error.message.includes("HR-EMP-00042"), true);
  assertEquals(error.message.includes("HR-EMP-00099"), true);
});

Deno.test("erpnext_expense_claim_create - accepts an employee name, not just an ID", async () => {
  let created: Record<string, unknown> | undefined;
  const client = clientResolving(
    "Jane Doe",
    [{ name: "HR-EMP-00007", employee_name: "Jane Doe" }],
    (d) => created = d,
  );

  await getTool("erpnext_expense_claim_create").handler(
    {
      employee: "Jane Doe",
      expenses: [{ expense_type: "Travel", amount: 120 }],
    },
    makeCtx(client),
  );

  assertEquals(created?.employee, "HR-EMP-00007");
});

// ── read path ───────────────────────────────────────────────────────────────

Deno.test("erpnext_employee_get - honours its description and resolves a name", async () => {
  // Its description promises a name works. It previously did not resolve at all,
  // so an agent following the description got a 404 — a description that lies is
  // the same defect class the write-path fixes addressed.
  const client = clientResolving("Jane Doe", [
    { name: "HR-EMP-00007", employee_name: "Jane Doe" },
  ]);

  const result = await getTool("erpnext_employee_get").handler(
    { name: "Jane Doe" },
    makeCtx(client),
  ) as any;

  assertEquals(result.data.name, "HR-EMP-00007");
});
