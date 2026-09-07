/**
 * Operations Tools Tests
 *
 * Tests for erpnext_doc_create and other generic operation tools.
 *
 * @module lib/erpnext/tests/tools/operations_test
 */

import { assertEquals, assertRejects, assertStrictEquals } from "@std/assert";
import { operationsTools } from "./operations.ts";
import { FrappeAPIError } from "../api/frappe-client.ts";
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
  const result = await tool.handler(
    { doctype: "Sales Order", name: "SO-001" },
    makeCtx(mockClient),
  ) as Record<string, unknown>;

  assertEquals(submittedDoc.disable_rounded_total, 1);
  assertEquals((result.warnings as string[]).length, 1);
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

// ── erpnext_file_upload ────────────────────────────────────────────────────

Deno.test("erpnext_file_upload - validates input and delegates to the client", async () => {
  const tool = getTool("erpnext_file_upload");
  await assertRejects(
    () =>
      tool.handler({
        file_name: "nested/report.pdf",
        content_base64: "YQ==",
        attached_to_doctype: "Task",
        attached_to_name: "TASK-001",
      }, makeCtx(makeMockClient())),
    Error,
    "filename without a path",
  );
  await assertRejects(
    () =>
      tool.handler({
        file_name: "report.pdf",
        content_base64: "YQ==",
        attached_to_doctype: "Task",
        attached_to_name: "TASK-001",
        attached_to_field: 42,
      }, makeCtx(makeMockClient())),
    Error,
    "attached_to_field",
  );

  let captured: Record<string, unknown> = {};
  const result = await tool.handler(
    {
      file_name: "report.pdf",
      content_base64: "YQ==",
      attached_to_doctype: "Task",
      attached_to_name: "TASK-001",
      attached_to_field: "attachment",
      is_private: false,
    },
    makeCtx(makeMockClient({
      uploadFile: async (input: Record<string, unknown>) => {
        captured = input;
        return { name: "FILE-001" };
      },
    })),
  ) as Record<string, unknown>;

  assertEquals(captured, {
    fileName: "report.pdf",
    contentBase64: "YQ==",
    attachedToDoctype: "Task",
    attachedToName: "TASK-001",
    attachedToField: "attachment",
    isPrivate: false,
  });
  assertEquals(result.message, "report.pdf attached to Task TASK-001");
});

Deno.test("erpnext_file_upload - defaults to private", async () => {
  let isPrivate: boolean | undefined;
  await getTool("erpnext_file_upload").handler(
    {
      file_name: "report.pdf",
      content_base64: "YQ==",
      attached_to_doctype: "Task",
      attached_to_name: "TASK-001",
    },
    makeCtx(makeMockClient({
      uploadFile: async (input: { isPrivate: boolean }) => {
        isPrivate = input.isPrivate;
        return { name: "FILE-001" };
      },
    })),
  );
  assertEquals(isPrivate, true);
});

Deno.test("erpnext_file_upload - is marked destructive", () => {
  assertEquals(
    getTool("erpnext_file_upload").annotations?.destructiveHint,
    true,
  );
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

// ── erpnext_method_call ─────────────────────────────────────────────────────

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

Deno.test("erpnext_method_call - exists in operations tools", () => {
  const tool = getTool("erpnext_method_call");
  assertEquals(tool.name, "erpnext_method_call");
  assertEquals(tool.category, "operations");
});

Deno.test("erpnext_method_call - deny-by-default when ERPNEXT_METHOD_ALLOWLIST is unset", async () => {
  using _ = withAllowlist(undefined);
  await assertRejects(
    () =>
      getTool("erpnext_method_call").handler(
        { method: "frappe.client.get_count" },
        makeCtx(makeMockClient()),
      ),
    Error,
    "is not permitted",
  );
});

Deno.test("erpnext_method_call - rejects a method not covered by the allowlist", async () => {
  using _ = withAllowlist("frappe.client.get_count");
  await assertRejects(
    () =>
      getTool("erpnext_method_call").handler(
        { method: "my_app.api.delete_everything" },
        makeCtx(makeMockClient()),
      ),
    Error,
    "is not permitted",
  );
});

Deno.test("erpnext_method_call - calls an exactly-allowlisted method via POST by default", async () => {
  using _ = withAllowlist("frappe.client.get_count");
  let seen: [string, Record<string, unknown>, string] | undefined;
  const tool = getTool("erpnext_method_call");
  const result = await tool.handler(
    { method: "frappe.client.get_count", args: { doctype: "Task" } },
    makeCtx(makeMockClient({
      callMethod: async (
        method: string,
        args: Record<string, unknown>,
        httpMethod: string,
      ) => {
        seen = [method, args, httpMethod];
        return 42;
      },
    })),
  );
  assertEquals(seen, [
    "frappe.client.get_count",
    { doctype: "Task" },
    "POST",
  ]);
  assertEquals(result, { data: 42 });
});

Deno.test("erpnext_method_call - allows a 'prefix.*' wildcard and passes http_method through", async () => {
  using _ = withAllowlist("my_app.api.*");
  let seenHttpMethod: string | undefined;
  const tool = getTool("erpnext_method_call");
  await tool.handler(
    { method: "my_app.api.reconcile", http_method: "GET" },
    makeCtx(makeMockClient({
      callMethod: async (
        _method: string,
        _args: Record<string, unknown>,
        httpMethod: string,
      ) => {
        seenHttpMethod = httpMethod;
        return null;
      },
    })),
  );
  assertEquals(seenHttpMethod, "GET");
});

Deno.test("erpnext_method_call - '*' allows any method", async () => {
  using _ = withAllowlist("*");
  const tool = getTool("erpnext_method_call");
  const result = await tool.handler(
    { method: "anything.goes.here" },
    makeCtx(makeMockClient({ callMethod: async () => "ok" })),
  );
  assertEquals(result, { data: "ok" });
});

Deno.test("erpnext_method_call - invalidates the given doctype/name after a mutating call", async () => {
  using _ = withAllowlist("my_app.api.*");
  let invalidated: [string, string] | undefined;
  const tool = getTool("erpnext_method_call");
  await tool.handler(
    {
      method: "my_app.api.mark_paid",
      invalidate: { doctype: "Sales Invoice", name: "SINV-001" },
    },
    makeCtx(makeMockClient({
      callMethod: async () => ({ ok: true }),
      invalidate: (doctype: string, name: string) => {
        invalidated = [doctype, name];
      },
    })),
  );
  assertEquals(invalidated, ["Sales Invoice", "SINV-001"]);
});

Deno.test("erpnext_method_call - rejects a missing or empty method", async () => {
  using _ = withAllowlist("*");
  await assertRejects(
    () =>
      getTool("erpnext_method_call").handler(
        { method: "  " },
        makeCtx(makeMockClient()),
      ),
    Error,
    "non-empty dotted path",
  );
});

Deno.test("erpnext_method_call - rejects a malformed method path", async () => {
  using _ = withAllowlist("*");
  await assertRejects(
    () =>
      getTool("erpnext_method_call").handler(
        { method: "frappe.client.*" },
        makeCtx(makeMockClient()),
      ),
    Error,
    "not a valid dotted path",
  );
});

Deno.test("erpnext_method_call - rejects a non-object args", async () => {
  using _ = withAllowlist("*");
  await assertRejects(
    () =>
      getTool("erpnext_method_call").handler(
        { method: "frappe.client.get_count", args: "nope" },
        makeCtx(makeMockClient()),
      ),
    Error,
    "'args' must be an object",
  );
});

Deno.test("erpnext_method_call - rejects an invalid http_method", async () => {
  using _ = withAllowlist("*");
  await assertRejects(
    () =>
      getTool("erpnext_method_call").handler(
        { method: "frappe.client.get_count", http_method: "DELETE" },
        makeCtx(makeMockClient()),
      ),
    Error,
    "'http_method' must be 'GET' or 'POST'",
  );
});

Deno.test("erpnext_method_call - rejects an incomplete invalidate object", async () => {
  using _ = withAllowlist("*");
  await assertRejects(
    () =>
      getTool("erpnext_method_call").handler(
        {
          method: "frappe.client.get_count",
          invalidate: { doctype: "Task" },
        },
        makeCtx(makeMockClient()),
      ),
    Error,
    "'invalidate' requires non-empty",
  );
});

// ── Purchase Invoice 417 hints (Issue 34) ────────────────────────────────────

Deno.test("erpnext_doc_create - Purchase Invoice without rounding flag is accepted", async () => {
  let captured: Record<string, unknown> = {};
  const result = await getTool("erpnext_doc_create").handler(
    { doctype: "Purchase Invoice", data: { supplier: "Acme" } },
    makeCtx(makeMockClient({
      create: async (_doctype: string, data: Record<string, unknown>) => {
        captured = data;
        return { name: "PINV-001", ...data };
      },
    })),
  ) as Record<string, unknown>;

  assertEquals(captured, { supplier: "Acme" });
  assertEquals(
    result.message,
    "Purchase Invoice PINV-001 created successfully",
  );
});

Deno.test("erpnext_doc_create - optional disable_rounded_total passes unchanged", async () => {
  for (const rounding of [0, 1] as const) {
    let captured: Record<string, unknown> = {};
    await getTool("erpnext_doc_create").handler(
      {
        doctype: "Purchase Invoice",
        data: { supplier: "Acme", disable_rounded_total: rounding },
      },
      makeCtx(makeMockClient({
        create: async (_doctype: string, data: Record<string, unknown>) => {
          captured = data;
          return { name: "PINV-001", ...data };
        },
      })),
    );
    assertEquals(captured.disable_rounded_total, rounding);
  }
});

Deno.test("erpnext_doc_create/update/submit - public schema stays generic", () => {
  const create = getTool("erpnext_doc_create");
  const update = getTool("erpnext_doc_update");
  const submit = getTool("erpnext_doc_submit");
  const createData = String(
    (create.inputSchema.properties?.data as { description?: string })
      ?.description ?? "",
  );
  const updateData = String(
    (update.inputSchema.properties?.data as { description?: string })
      ?.description ?? "",
  );
  const submitProps = submit.inputSchema.properties ?? {};

  assertEquals(create.description.includes("disable_rounded_total"), false);
  assertEquals(createData.includes("Purchase Invoice"), false);
  assertEquals(updateData.includes("Purchase Invoice"), false);
  assertEquals("expected_total" in submitProps, false);
  assertEquals("expected_currency" in submitProps, false);
  assertEquals(submit.inputSchema.required, ["doctype", "name"]);
});

Deno.test("erpnext_doc_submit - Purchase Invoice with only doctype/name matches baseline keys", async () => {
  const tool = getTool("erpnext_doc_submit");
  const so = await tool.handler(
    { doctype: "Sales Order", name: "SO-001" },
    makeCtx(makeMockClient({
      get: async () => ({ name: "SO-001", modified: "2026-01-01 00:00:00" }),
      callMethod: async () => ({ name: "SO-001", docstatus: 1 }),
    })),
  ) as Record<string, unknown>;
  const pi = await tool.handler(
    { doctype: "Purchase Invoice", name: "PINV-001" },
    makeCtx(makeMockClient({
      get: async (
        _doctype: string,
        _name: string,
        opts?: { skipCache?: boolean },
      ) => {
        assertEquals(opts?.skipCache, true);
        return { name: "PINV-001", modified: "2026-01-01 00:00:00" };
      },
      callMethod: async (
        _method: string,
        args: { doc: Record<string, unknown> },
      ) => {
        assertEquals(args.doc.modified, "2026-01-01 00:00:00");
        return { name: "PINV-001", docstatus: 1 };
      },
    })),
  ) as Record<string, unknown>;

  assertEquals(Object.keys(pi).sort(), Object.keys(so).sort());
  assertEquals(pi.message, "Purchase Invoice PINV-001 submitted successfully");
  assertEquals("total_verification" in pi, false);
});

Deno.test("erpnext_doc_submit - extra expected_* fields are ignored", async () => {
  const result = await getTool("erpnext_doc_submit").handler(
    {
      doctype: "Purchase Invoice",
      name: "PINV-001",
      expected_total: 3.6,
      expected_currency: "EUR",
    },
    makeCtx(makeMockClient({
      get: async () => ({ name: "PINV-001", modified: "2026-01-01 00:00:00" }),
      callMethod: async () => ({ name: "PINV-001", docstatus: 1 }),
    })),
  ) as Record<string, unknown>;

  assertEquals(
    result.message,
    "Purchase Invoice PINV-001 submitted successfully",
  );
  assertEquals("total_verification" in result, false);
});

Deno.test("erpnext_doc_submit - Purchase Invoice keeps rounded-total fallback", async () => {
  let submittedDoc: Record<string, unknown> = {};
  const result = await getTool("erpnext_doc_submit").handler(
    { doctype: "Purchase Invoice", name: "PINV-001" },
    makeCtx(makeMockClient({
      get: async () => ({
        name: "PINV-001",
        base_rounded_total: null,
        modified: "2026-01-01 00:00:00",
      }),
      callMethod: async (
        _method: string,
        args: { doc: Record<string, unknown> },
      ) => {
        submittedDoc = args.doc;
        return { name: "PINV-001", docstatus: 1 };
      },
    })),
  ) as Record<string, unknown>;

  assertEquals(submittedDoc.disable_rounded_total, 1);
  assertEquals((result.warnings as string[]).length, 1);
});

Deno.test("erpnext_doc_create/update/submit - known 417 hints preserve error identity", async () => {
  const cases: Array<{
    name: string;
    tool: string;
    input: Record<string, unknown>;
    method: "create" | "update" | "callMethod";
    error: FrappeAPIError;
    hint: string | undefined;
  }> = [
    {
      name: "empty HTML Party Account on create",
      tool: "erpnext_doc_create",
      input: { doctype: "Purchase Invoice", data: { supplier: "Acme" } },
      method: "create",
      error: new FrappeAPIError(
        "POST failed: Party Account <strong></strong> currency (None) and document currency (EUR) should be same",
        417,
        {
          message:
            "Party Account <strong></strong> currency (None) and document currency (EUR) should be same",
        },
        800,
      ),
      hint: "credit_to",
    },
    {
      name: "literal None Party Account on update",
      tool: "erpnext_doc_update",
      input: {
        doctype: "Purchase Invoice",
        name: "PINV-001",
        data: { bill_no: "X" },
      },
      method: "update",
      error: new FrappeAPIError(
        "POST failed: Party Account None currency (None) and document currency (EUR) should be same",
        417,
        {
          message:
            "Party Account None currency (None) and document currency (EUR) should be same",
        },
      ),
      hint: "credit_to",
    },
    {
      name: "GRNI missing default on submit",
      tool: "erpnext_doc_submit",
      input: { doctype: "Purchase Invoice", name: "PINV-001" },
      method: "callMethod",
      error: new FrappeAPIError(
        "Please set default Stock Received But Not Billed in Company",
        417,
        {
          message:
            "Please set default Stock Received But Not Billed in Company",
        },
      ),
      hint: "stock_received_but_not_billed",
    },
    {
      name: "named account is unchanged",
      tool: "erpnext_doc_create",
      input: { doctype: "Purchase Invoice", data: { supplier: "Acme" } },
      method: "create",
      error: new FrappeAPIError(
        "POST failed: Party Account Creditors - ABC currency (None) and document currency (EUR) should be same",
        417,
        {
          message:
            "Party Account Creditors - ABC currency (None) and document currency (EUR) should be same",
        },
      ),
      hint: undefined,
    },
    {
      name: "disabled GRNI is unchanged",
      tool: "erpnext_doc_create",
      input: { doctype: "Purchase Invoice", data: { supplier: "Acme" } },
      method: "create",
      error: new FrappeAPIError(
        "Account Stock Received But Not Billed - ACME is disabled",
        417,
        { message: "Account Stock Received But Not Billed - ACME is disabled" },
        500,
      ),
      hint: undefined,
    },
  ];

  for (const item of cases) {
    const prefix = item.error.message;
    const body = item.error.body;
    const retryAfter = item.error.retryAfterMs;
    let invalidated = 0;
    try {
      await getTool(item.tool).handler(
        item.input,
        makeCtx(makeMockClient({
          get: async () => ({
            name: "PINV-001",
            modified: "2026-01-01 00:00:00",
          }),
          [item.method]: async () => {
            throw item.error;
          },
          invalidate: () => {
            invalidated++;
          },
        })),
      );
      throw new Error(`expected throw: ${item.name}`);
    } catch (error) {
      assertStrictEquals(error, item.error, item.name);
      assertEquals(item.error.status, 417, item.name);
      assertEquals(item.error.body, body, item.name);
      assertEquals(item.error.retryAfterMs, retryAfter, item.name);
      assertEquals(item.error.message.startsWith(prefix), true, item.name);
      assertEquals(invalidated, 0, item.name);
      if (item.hint) {
        assertEquals(item.error.message.includes(item.hint), true, item.name);
      } else {
        assertEquals(item.error.message, prefix, item.name);
        assertEquals(
          item.error.message.includes("credit_to"),
          false,
          item.name,
        );
        assertEquals(
          item.error.message.includes("stock_received_but_not_billed"),
          false,
          item.name,
        );
      }
    }
  }
});
