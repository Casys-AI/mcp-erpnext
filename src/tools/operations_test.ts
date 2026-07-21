/**
 * Operations Tools Tests
 *
 * Tests for erpnext_doc_create and other generic operation tools.
 *
 * @module lib/erpnext/tests/tools/operations_test
 */

import { assertEquals, assertRejects } from "@std/assert";
import { operationsTools } from "./operations.ts";
import type { FrappeClient } from "../api/frappe-client.ts";
import type { ErpNextToolContext } from "./types.ts";

// deno-lint-ignore no-explicit-any
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
    invalidate: () => {},
    ...overrides,
  };
  return mock as unknown as FrappeClient;
}

function makeCtx(client: FrappeClient): ErpNextToolContext {
  return { client };
}

function getTool(name: string) {
  const tool = operationsTools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool;
}

// ── erpnext_doc_create ──────────────────────────────────────────────────────

Deno.test("erpnext_doc_create - exists in operations tools", () => {
  const tool = getTool("erpnext_doc_create");
  assertEquals(tool.name, "erpnext_doc_create");
  assertEquals(tool.category, "operations");
});

Deno.test("erpnext_doc_create - throws if doctype missing", async () => {
  const tool = getTool("erpnext_doc_create");
  await assertRejects(
    () => tool.handler({ data: {} }, makeCtx(makeMockClient())),
    Error,
    "doctype",
  );
});

Deno.test("erpnext_doc_create - throws if data missing", async () => {
  const tool = getTool("erpnext_doc_create");
  await assertRejects(
    () => tool.handler({ doctype: "Item" }, makeCtx(makeMockClient())),
    Error,
    "data",
  );
});

Deno.test("erpnext_doc_create - throws if data is not object", async () => {
  const tool = getTool("erpnext_doc_create");
  await assertRejects(
    () =>
      tool.handler({ doctype: "Item", data: "bad" }, makeCtx(makeMockClient())),
    Error,
    "data",
  );
});

Deno.test("erpnext_doc_create - calls client.create with correct args", async () => {
  let capturedDoctype = "";
  let capturedData: Record<string, unknown> = {};

  const mockClient = makeMockClient({
    create: async (doctype: string, data: Record<string, unknown>) => {
      capturedDoctype = doctype;
      capturedData = data;
      return { name: "Transit", ...data };
    },
  });

  const tool = getTool("erpnext_doc_create");
  const result = await tool.handler(
    {
      doctype: "Warehouse Type",
      data: { name: "Transit", warehouse_type: "Transit" },
    },
    makeCtx(mockClient),
  ) as Record<string, unknown>;

  assertEquals(capturedDoctype, "Warehouse Type");
  assertEquals(capturedData.name, "Transit");
  assertEquals(capturedData.warehouse_type, "Transit");

  const doc = result.data as Record<string, unknown>;
  assertEquals(doc.name, "Transit");
  assertEquals(typeof result.message, "string");
});

Deno.test("erpnext_doc_create - works with Item Group (tree doctype)", async () => {
  const mockClient = makeMockClient({
    create: async (_doctype: string, data: Record<string, unknown>) => ({
      name: "Products",
      ...data,
    }),
  });

  const tool = getTool("erpnext_doc_create");
  const result = await tool.handler(
    {
      doctype: "Item Group",
      data: {
        name: "Products",
        item_group_name: "Products",
        parent_item_group: "All Item Groups",
      },
    },
    makeCtx(mockClient),
  ) as Record<string, unknown>;

  const doc = result.data as Record<string, unknown>;
  assertEquals(doc.name, "Products");
  assertEquals(doc.parent_item_group, "All Item Groups");
});

// ── erpnext_doc_submit ───────────────────────────────────────────────────────

Deno.test("erpnext_doc_submit - skips cache on the pre-submit get and invalidates after", async () => {
  let getSkipCache: boolean | undefined;
  let invalidatedDoctype = "";
  let invalidatedName = "";

  const mockClient = makeMockClient({
    get: async (
      _doctype: string,
      _name: string,
      opts?: { skipCache?: boolean },
    ) => {
      getSkipCache = opts?.skipCache;
      return { name: "SO-001", modified: "2026-01-01 00:00:00" };
    },
    callMethod: async () => ({ name: "SO-001", docstatus: 1 }),
    invalidate: (doctype: string, name?: string) => {
      invalidatedDoctype = doctype;
      invalidatedName = name ?? "";
    },
  });

  const tool = getTool("erpnext_doc_submit");
  await tool.handler(
    { doctype: "Sales Order", name: "SO-001" },
    makeCtx(mockClient),
  );

  assertEquals(getSkipCache, true);
  assertEquals(invalidatedDoctype, "Sales Order");
  assertEquals(invalidatedName, "SO-001");
});

Deno.test("erpnext_doc_submit - disables rounded total when base_rounded_total is null (fresh instance)", async () => {
  let submittedDoc: Record<string, unknown> = {};

  const mockClient = makeMockClient({
    get: async () => ({
      name: "SO-001",
      base_rounded_total: null,
      modified: "2026-01-01 00:00:00",
    }),
    callMethod: async (
      _method: string,
      args: { doc: Record<string, unknown> },
    ) => {
      submittedDoc = args.doc;
      return { name: "SO-001", docstatus: 1 };
    },
  });

  const tool = getTool("erpnext_doc_submit");
  await tool.handler(
    { doctype: "Sales Order", name: "SO-001" },
    makeCtx(mockClient),
  );

  assertEquals(submittedDoc.disable_rounded_total, 1);
});

// ── erpnext_doc_cancel ───────────────────────────────────────────────────────

Deno.test("erpnext_doc_cancel - invalidates cache after cancel", async () => {
  let invalidatedDoctype = "";
  let invalidatedName = "";

  const mockClient = makeMockClient({
    callMethod: async () => ({ name: "SO-001", docstatus: 2 }),
    invalidate: (doctype: string, name?: string) => {
      invalidatedDoctype = doctype;
      invalidatedName = name ?? "";
    },
  });

  const tool = getTool("erpnext_doc_cancel");
  await tool.handler(
    { doctype: "Sales Order", name: "SO-001" },
    makeCtx(mockClient),
  );

  assertEquals(invalidatedDoctype, "Sales Order");
  assertEquals(invalidatedName, "SO-001");
});

// ── erpnext_doc_list ────────────────────────────────────────────────────────

Deno.test("erpnext_doc_list - has _meta.ui for doclist-viewer", () => {
  const tool = getTool("erpnext_doc_list");
  assertEquals(tool._meta?.ui?.resourceUri, "ui://mcp-erpnext/doclist-viewer");
});

// ── erpnext_doc_update ──────────────────────────────────────────────────────

Deno.test("erpnext_doc_update - throws if doctype missing", async () => {
  const tool = getTool("erpnext_doc_update");
  await assertRejects(
    () => tool.handler({ name: "X", data: {} }, makeCtx(makeMockClient())),
    Error,
    "doctype",
  );
});

// ── erpnext_doc_delete ──────────────────────────────────────────────────────

Deno.test("erpnext_doc_delete - calls client.delete", async () => {
  let deletedDoctype = "";
  let deletedName = "";

  const mockClient = makeMockClient({
    delete: async (doctype: string, name: string) => {
      deletedDoctype = doctype;
      deletedName = name;
    },
  });

  const tool = getTool("erpnext_doc_delete");
  const result = await tool.handler(
    { doctype: "Customer", name: "CUST-001" },
    makeCtx(mockClient),
  ) as Record<string, unknown>;

  assertEquals(deletedDoctype, "Customer");
  assertEquals(deletedName, "CUST-001");
  assertEquals(result.deleted, true);
});

// ── erpnext_doc_assign ──────────────────────────────────────────────────────

Deno.test("erpnext_doc_assign - assigns through the native API and returns the fresh doc", async () => {
  let assignmentArgs: Record<string, unknown> = {};
  const result = await getTool("erpnext_doc_assign").handler(
    {
      doctype: "Issue",
      name: "ISS-001",
      assign_to: "user@example.com",
      assignment_priority: "High",
    },
    makeCtx(makeMockClient({
      list: async () => [{ name: "user@example.com", enabled: 1 }],
      get: async (_doctype: string, name: string) => ({
        name,
        status: "Open",
      }),
      callMethod: async (method: string, args: Record<string, unknown>) => {
        assertEquals(method, "frappe.desk.form.assign_to.add");
        assignmentArgs = args;
        return [{ owner: "user@example.com", name: "TODO-001" }];
      },
    })),
  ) as Record<string, unknown>;

  assertEquals(assignmentArgs, {
    doctype: "Issue",
    name: "ISS-001",
    assign_to: ["user@example.com"],
    priority: "High",
  });
  assertEquals(result.data, { name: "ISS-001", status: "Open" });
  assertEquals(
    result.message,
    "Issue ISS-001 is now assigned to user@example.com",
  );
  assertEquals(result.assignment, {
    notify_user: true,
    assignees: ["user@example.com"],
    todos: [{ owner: "user@example.com", name: "TODO-001" }],
  });
});

Deno.test("erpnext_doc_assign - fails fast on a missing document before validating users", async () => {
  let listCalls = 0;
  let callMethodCalls = 0;
  await assertRejects(
    () =>
      getTool("erpnext_doc_assign").handler(
        { doctype: "Issue", name: "MISSING", assign_to: "user@example.com" },
        makeCtx(makeMockClient({
          get: async () => {
            throw new Error("Issue MISSING not found");
          },
          list: async () => {
            listCalls++;
            return [{ name: "user@example.com", enabled: 1 }];
          },
          callMethod: async () => {
            callMethodCalls++;
            return [];
          },
        })),
      ),
    Error,
    "not found",
  );
  assertEquals(listCalls, 0);
  assertEquals(callMethodCalls, 0);
});

Deno.test("erpnext_doc_assign - rejects unknown assignees before mutation", async () => {
  let callMethodCalls = 0;
  await assertRejects(
    () =>
      getTool("erpnext_doc_assign").handler(
        { doctype: "Task", name: "TASK-001", assign_to: "ghost@example.com" },
        makeCtx(makeMockClient({
          list: async () => [],
          callMethod: async () => {
            callMethodCalls++;
            return [];
          },
        })),
      ),
    Error,
    "does not exist",
  );
  assertEquals(callMethodCalls, 0);
});

Deno.test("erpnext_doc_assign - requires assign_to", async () => {
  await assertRejects(
    () =>
      getTool("erpnext_doc_assign").handler(
        { doctype: "Task", name: "TASK-001" },
        makeCtx(makeMockClient()),
      ),
    Error,
    "'assign_to' is required",
  );
});

// ── erpnext_doc_unassign ────────────────────────────────────────────────────

Deno.test("erpnext_doc_unassign - removes through the native API and returns remaining", async () => {
  let removeArgs: Record<string, unknown> = {};
  const result = await getTool("erpnext_doc_unassign").handler(
    { doctype: "Task", name: "TASK-001", assign_to: " user@example.com " },
    makeCtx(makeMockClient({
      callMethod: async (method: string, args: Record<string, unknown>) => {
        assertEquals(method, "frappe.desk.form.assign_to.remove");
        removeArgs = args;
        return [{ owner: "other@example.com", name: "TODO-002" }];
      },
      get: async (_doctype: string, name: string) => ({ name }),
    })),
  ) as Record<string, unknown>;

  assertEquals(removeArgs, {
    doctype: "Task",
    name: "TASK-001",
    assign_to: "user@example.com",
  });
  assertEquals(
    result.message,
    "user@example.com unassigned from Task TASK-001",
  );
  assertEquals(result.assignment, {
    removed: "user@example.com",
    remaining: [{ owner: "other@example.com", name: "TODO-002" }],
  });
});

Deno.test("erpnext_doc_unassign - contextualizes native errors", async () => {
  await assertRejects(
    () =>
      getTool("erpnext_doc_unassign").handler(
        { doctype: "Task", name: "TASK-001", assign_to: "user@example.com" },
        makeCtx(makeMockClient({
          callMethod: async () => {
            throw new Error("No assignment found");
          },
        })),
      ),
    Error,
    "Task TASK-001 unassignment failed: No assignment found",
  );
});

Deno.test("erpnext_doc_unassign - rejects a missing or empty assign_to", async () => {
  await assertRejects(
    () =>
      getTool("erpnext_doc_unassign").handler(
        { doctype: "Task", name: "TASK-001", assign_to: "  " },
        makeCtx(makeMockClient()),
      ),
    Error,
    "non-empty user email",
  );
});
