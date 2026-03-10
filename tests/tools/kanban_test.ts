import { assert, assertEquals, assertRejects } from "jsr:@std/assert";
import { FrappeClient } from "../../src/api/frappe-client.ts";
import { kanbanTools } from "../../src/tools/kanban.ts";
import type { ErpNextToolContext } from "../../src/tools/types.ts";

// deno-lint-ignore no-explicit-any
type AnyFn = (...args: any[]) => any;

function makeMockClient(overrides: Record<string, AnyFn> = {}): FrappeClient {
  const mock: Record<string, AnyFn> = {
    list: async () => [],
    get: async () => ({ name: "TEST-001" }),
    create: async () => ({ name: "NEW-001" }),
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
  const tool = kanbanTools.find((entry) => entry.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool;
}

Deno.test("erpnext_kanban_get_board - returns a Task board with metadata and pagination", async () => {
  let capturedLimit = 0;
  let capturedOffset = 0;
  let capturedFields: string[] = [];
  let capturedFilters: unknown[] = [];

  const mockClient = makeMockClient({
    list: async (
      _doctype: string,
      opts: { limit?: number; limit_start?: number; fields?: string[]; filters?: unknown[] },
    ) => {
      capturedLimit = opts.limit ?? 0;
      capturedOffset = opts.limit_start ?? 0;
      capturedFields = opts.fields ?? [];
      capturedFilters = opts.filters ?? [];
      return [
        {
          name: "TASK-0001",
          subject: "Draft protocol",
          project: "Alpha",
          status: "Open",
          priority: "High",
          progress: 20,
        },
        {
          name: "TASK-0002",
          subject: "Review protocol",
          project: "Alpha",
          status: "Working",
          priority: "Medium",
          progress: 60,
        },
        {
          name: "TASK-0003",
          subject: "Ship protocol",
          project: "Alpha",
          status: "Completed",
          priority: "Low",
          progress: 100,
        },
      ];
    },
  });

  const tool = getTool("erpnext_kanban_get_board");
  const result = await tool.handler(
    { doctype: "Task", limit: 2, offset: 3, project: "Alpha", priority: "High" },
    makeCtx(mockClient),
  ) as Record<string, unknown>;

  assertEquals(capturedLimit, 3);
  assertEquals(capturedOffset, 3);
  assertEquals(capturedFields, [
    "name",
    "subject",
    "project",
    "status",
    "priority",
    "progress",
  ]);
  assertEquals(capturedFilters, [
    ["project", "=", "Alpha"],
    ["priority", "=", "High"],
  ]);
  assertEquals((result._meta as { ui: { resourceUri: string } }).ui.resourceUri, "ui://mcp-erpnext/kanban-viewer");
  assertEquals(result.doctype, "Task");
  assertEquals((result.columns as Array<{ id: string; count: number }>)[0].id, "open");
  assertEquals((result.columns as Array<{ id: string; count: number }>)[0].count, 1);
  assertEquals((result.pagination as { limit: number; offset: number; hasMore: boolean }).limit, 2);
  assertEquals((result.pagination as { limit: number; offset: number; hasMore: boolean }).offset, 3);
  assertEquals((result.pagination as { loadedCount: number }).loadedCount, 5);
  assertEquals((result.pagination as { limit: number; offset: number; hasMore: boolean }).hasMore, true);
  assertEquals((result.allowedTransitions as Array<{ fromColumn: string; toColumn: string }>)[0].fromColumn, "open");
});

Deno.test("erpnext_kanban_get_board - rejects unsupported doctypes", async () => {
  const tool = getTool("erpnext_kanban_get_board");
  await assertRejects(
    () => tool.handler({ doctype: "Sales Order" }, makeCtx(makeMockClient())),
    Error,
    "Unsupported kanban doctype",
  );
});

Deno.test("erpnext_kanban_get_board - returns an Opportunity board", async () => {
  let capturedFields: string[] = [];
  let capturedFilters: unknown[] = [];

  const mockClient = makeMockClient({
    list: async (
      _doctype: string,
      opts: { fields?: string[]; filters?: unknown[] },
    ) => {
      capturedFields = opts.fields ?? [];
      capturedFilters = opts.filters ?? [];
      return [
        {
          name: "CRM-OPP-2026-00001",
          title: "ACME renewal",
          opportunity_from: "Customer",
          party_name: "Acme Corp",
          status: "Open",
          opportunity_amount: 12500,
          currency: "EUR",
          probability: 70,
          opportunity_owner: "alice@example.com",
        },
      ];
    },
  });

  const tool = getTool("erpnext_kanban_get_board");
  const result = await tool.handler(
    {
      doctype: "Opportunity",
      opportunity_owner: "alice@example.com",
      party_name: "Acme Corp",
    },
    makeCtx(mockClient),
  ) as Record<string, unknown>;

  assertEquals(capturedFields, [
    "name",
    "title",
    "opportunity_from",
    "party_name",
    "status",
    "opportunity_amount",
    "currency",
    "probability",
    "opportunity_owner",
  ]);
  assertEquals(capturedFilters, [
    ["opportunity_owner", "=", "alice@example.com"],
    ["party_name", "=", "Acme Corp"],
  ]);
  assertEquals(result.doctype, "Opportunity");
  assertEquals((result.columns as Array<{ id: string }>)[0].id, "open");
  assertEquals((result.cards as Array<{ title: string }>)[0].title, "ACME renewal");
});

Deno.test("erpnext_kanban_get_board - returns an Issue board", async () => {
  let capturedFields: string[] = [];
  let capturedFilters: unknown[] = [];

  const mockClient = makeMockClient({
    list: async (
      _doctype: string,
      opts: { fields?: string[]; filters?: unknown[] },
    ) => {
      capturedFields = opts.fields ?? [];
      capturedFilters = opts.filters ?? [];
      return [
        {
          name: "ISS-2026-00001",
          subject: "Shipment damaged in transit",
          status: "Open",
          priority: "High",
          customer: "Acme Corp",
          raised_by: "alice@example.com",
        },
      ];
    },
  });

  const tool = getTool("erpnext_kanban_get_board");
  const result = await tool.handler(
    {
      doctype: "Issue",
      priority: "High",
      customer: "Acme Corp",
      raised_by: "alice@example.com",
    },
    makeCtx(mockClient),
  ) as Record<string, unknown>;

  assertEquals(capturedFields, [
    "name",
    "subject",
    "status",
    "priority",
    "customer",
    "raised_by",
  ]);
  assertEquals(capturedFilters, [
    ["priority", "=", "High"],
    ["customer", "=", "Acme Corp"],
    ["raised_by", "=", "alice@example.com"],
  ]);
  assertEquals(result.doctype, "Issue");
  assertEquals((result.columns as Array<{ id: string }>)[0].id, "open");
  assertEquals((result.cards as Array<{ title: string }>)[0].title, "Shipment damaged in transit");
});

Deno.test("erpnext_kanban_move_card - executes an allowed Task move", async () => {
  let updatedDoctype = "";
  let updatedName = "";
  let updatedData: Record<string, unknown> | undefined;

  const mockClient = makeMockClient({
    update: async (doctype: string, name: string, data: Record<string, unknown>) => {
      updatedDoctype = doctype;
      updatedName = name;
      updatedData = data;
      return {
        name,
        subject: "Draft protocol",
        project: "Alpha",
        status: "Working",
        priority: "High",
        progress: 20,
      };
    },
  });

  const tool = getTool("erpnext_kanban_move_card");
  const result = await tool.handler(
    {
      doctype: "Task",
      card_id: "TASK-0001",
      from_column: "open",
      to_column: "working",
    },
    makeCtx(mockClient),
  ) as Record<string, unknown>;

  assertEquals(updatedDoctype, "Task");
  assertEquals(updatedName, "TASK-0001");
  assertEquals(updatedData, { status: "Working" });
  assertEquals(result.ok, true);
  assertEquals((result.serverCard as { columnId: string }).columnId, "working");
});

Deno.test("erpnext_kanban_move_card - returns business error details for invalid Task moves", async () => {
  const tool = getTool("erpnext_kanban_move_card");
  const result = await tool.handler(
    {
      doctype: "Task",
      card_id: "TASK-0001",
      from_column: "working",
      to_column: "overdue",
    },
    makeCtx(makeMockClient({
      get: async () => ({
        name: "TASK-0001",
        subject: "Draft protocol",
        status: "Working",
      }),
    })),
  ) as Record<string, unknown>;

  assertEquals(result.ok, false);
  assertEquals(result.errorMessage, "Overdue is system-managed");
  assert(!("serverCard" in result) || result.serverCard === undefined);
});

Deno.test("erpnext_kanban_move_card - rejects stale client columns when server state changed", async () => {
  let updateCalled = false;

  const tool = getTool("erpnext_kanban_move_card");
  const result = await tool.handler(
    {
      doctype: "Task",
      card_id: "TASK-0001",
      from_column: "open",
      to_column: "working",
    },
    makeCtx(makeMockClient({
      get: async () => ({
        name: "TASK-0001",
        subject: "Draft protocol",
        status: "Completed",
      }),
      update: async () => {
        updateCalled = true;
        return {};
      },
    })),
  ) as Record<string, unknown>;

  assertEquals(updateCalled, false);
  assertEquals(result.ok, false);
  assertEquals(
    result.errorMessage,
    "Task moved on the server from open to completed. Refresh the board and try again.",
  );
});

Deno.test("erpnext_kanban_move_card - executes an allowed Opportunity move", async () => {
  let updatedDoctype = "";
  let updatedName = "";
  let updatedData: Record<string, unknown> | undefined;

  const mockClient = makeMockClient({
    get: async () => ({
      name: "CRM-OPP-2026-00001",
      title: "ACME renewal",
      status: "Open",
      party_name: "Acme Corp",
    }),
    update: async (doctype: string, name: string, data: Record<string, unknown>) => {
      updatedDoctype = doctype;
      updatedName = name;
      updatedData = data;
      return {
        name,
        title: "ACME renewal",
        opportunity_from: "Customer",
        party_name: "Acme Corp",
        status: "Quotation",
        opportunity_amount: 12500,
        currency: "EUR",
        probability: 70,
        opportunity_owner: "alice@example.com",
      };
    },
  });

  const tool = getTool("erpnext_kanban_move_card");
  const result = await tool.handler(
    {
      doctype: "Opportunity",
      card_id: "CRM-OPP-2026-00001",
      from_column: "open",
      to_column: "quotation",
    },
    makeCtx(mockClient),
  ) as Record<string, unknown>;

  assertEquals(updatedDoctype, "Opportunity");
  assertEquals(updatedName, "CRM-OPP-2026-00001");
  assertEquals(updatedData, { status: "Quotation" });
  assertEquals(result.ok, true);
  assertEquals((result.serverCard as { columnId: string }).columnId, "quotation");
});

Deno.test("erpnext_kanban_move_card - executes an allowed Issue move", async () => {
  let updatedDoctype = "";
  let updatedName = "";
  let updatedData: Record<string, unknown> | undefined;

  const mockClient = makeMockClient({
    get: async () => ({
      name: "ISS-2026-00001",
      subject: "Shipment damaged in transit",
      status: "Open",
      customer: "Acme Corp",
      raised_by: "alice@example.com",
    }),
    update: async (doctype: string, name: string, data: Record<string, unknown>) => {
      updatedDoctype = doctype;
      updatedName = name;
      updatedData = data;
      return {
        name,
        subject: "Shipment damaged in transit",
        status: "Resolved",
        priority: "High",
        customer: "Acme Corp",
        raised_by: "alice@example.com",
      };
    },
  });

  const tool = getTool("erpnext_kanban_move_card");
  const result = await tool.handler(
    {
      doctype: "Issue",
      card_id: "ISS-2026-00001",
      from_column: "open",
      to_column: "resolved",
    },
    makeCtx(mockClient),
  ) as Record<string, unknown>;

  assertEquals(updatedDoctype, "Issue");
  assertEquals(updatedName, "ISS-2026-00001");
  assertEquals(updatedData, { status: "Resolved" });
  assertEquals(result.ok, true);
  assertEquals((result.serverCard as { columnId: string }).columnId, "resolved");
});
