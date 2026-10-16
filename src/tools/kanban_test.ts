import {
  assert,
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "@std/assert";
import { FrappeAPIError } from "../api/frappe-client.ts";
import type { FrappeClient } from "../api/frappe-client.ts";
import type { FrappeListOptions } from "../api/types.ts";
import type { KanbanBoard } from "../kanban/types.ts";
import { kanbanTools } from "./kanban.ts";
import type { ErpNextToolContext } from "./types.ts";

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

function missingOpportunitySource(
  message = "Field not permitted in query: source",
) {
  return new FrappeAPIError(
    'GET /api/resource/Opportunity?fields=["source"] failed',
    417,
    {
      exc_type: "DataError",
      _server_messages: JSON.stringify([JSON.stringify({ message })]),
    },
  );
}

Deno.test("erpnext_kanban_get_board - retries the v16 source rename without changing pagination or filters", async () => {
  const calls: Array<{ doctype: string; options: FrappeListOptions }> = [];
  const mockClient = makeMockClient({
    list: async (doctype: string, options: FrappeListOptions) => {
      calls.push({ doctype, options });
      if (calls.length === 1) throw missingOpportunitySource();
      return [
        { name: "OPP-1", status: "Open", utm_source: "Website" },
        { name: "OPP-2", status: "Open", utm_source: "Referral" },
      ];
    },
  });
  const input = {
    doctype: "Opportunity",
    limit: 1,
    offset: 7,
    status: "Open",
    opportunity_owner: "sales@example.com",
    party_name: "Acme",
  };

  const result = await getTool("erpnext_kanban_get_board").handler(
    input,
    makeCtx(mockClient),
  ) as KanbanBoard;

  assertEquals(calls.length, 2);
  assertEquals(calls.map((call) => call.doctype), [
    "Opportunity",
    "Opportunity",
  ]);
  assert(calls[0].options.fields?.includes("source"));
  assert(!calls[0].options.fields?.includes("utm_source"));
  assertEquals(calls[1].options, {
    ...calls[0].options,
    fields: calls[0].options.fields?.map((field) =>
      field === "source" ? "utm_source" : field
    ),
  });
  assertEquals(calls[1].options.filters, [
    ["status", "=", "Open"],
    ["opportunity_owner", "=", "sales@example.com"],
    ["party_name", "=", "Acme"],
  ]);
  assertEquals(calls[1].options.limit, 2);
  assertEquals(calls[1].options.limit_start, 7);
  assertEquals(result.pagination, {
    limit: 1,
    offset: 7,
    loadedCount: 8,
    hasMore: true,
  });
  assertEquals(result.refreshArguments, input);
  assertEquals(result.cards.length, 1);
  assertEquals(result.cards[0].badges, [{ label: "Website", tone: "info" }]);
});

Deno.test("erpnext_kanban_get_board - handles localized v16 rejection and an empty board", async () => {
  let calls = 0;
  const result = await getTool("erpnext_kanban_get_board").handler(
    { doctype: "Opportunity" },
    makeCtx(makeMockClient({
      list: async () => {
        if (++calls === 1) {
          throw missingOpportunitySource(
            "Champ non autorisé dans la requête: source",
          );
        }
        return [];
      },
    })),
  ) as KanbanBoard;

  assertEquals(calls, 2);
  assertEquals(result.cards, []);
  assertEquals(result.pagination.hasMore, false);
});

Deno.test("erpnext_kanban_get_board - propagates unrelated errors without a source retry", async () => {
  const errors = [
    missingOpportunitySource("Field not permitted in query: source_detail"),
    missingOpportunitySource("Field not permitted in query: title"),
    missingOpportunitySource("Invalid filter expression"),
    new FrappeAPIError("Unauthorized", 401, {
      exc_type: "AuthenticationError",
    }),
    new FrappeAPIError("Permission denied", 403, {
      exc_type: "PermissionError",
    }),
    new FrappeAPIError("Network error", 0, null),
    new FrappeAPIError("Timed out", 408, null),
    new FrappeAPIError("Server error", 500, { exc_type: "DataError" }),
    new FrappeAPIError("Denied", 417, {
      exc_type: "PermissionError",
      message: "Field not permitted in query: source",
    }),
    new FrappeAPIError("source only appears in the request URL", 417, {
      exc_type: "DataError",
      _server_messages: "not-json",
    }),
    new Error("Field not permitted in query: source"),
  ];
  for (const error of errors) {
    let calls = 0;
    const actual = await assertRejects(() =>
      getTool("erpnext_kanban_get_board").handler(
        { doctype: "Opportunity" },
        makeCtx(makeMockClient({
          list: async () => {
            calls++;
            throw error;
          },
        })),
      )
    );
    assertStrictEquals(actual, error);
    assertEquals(calls, 1);
  }
});

Deno.test("erpnext_kanban_get_board - propagates the second failure and never loops", async () => {
  let calls = 0;
  const secondError = missingOpportunitySource(
    "Field not permitted in query: utm_source",
  );
  const actual = await assertRejects(() =>
    getTool("erpnext_kanban_get_board").handler(
      { doctype: "Opportunity" },
      makeCtx(makeMockClient({
        list: async () => {
          if (++calls === 1) throw missingOpportunitySource();
          throw secondError;
        },
      })),
    )
  );
  assertStrictEquals(actual, secondError);
  assertEquals(calls, 2);
});

Deno.test("erpnext_kanban_get_board - source compatibility never applies to Task or Issue", async () => {
  for (const doctype of ["Task", "Issue"]) {
    let calls = 0;
    const error = missingOpportunitySource();
    const actual = await assertRejects(() =>
      getTool("erpnext_kanban_get_board").handler(
        { doctype },
        makeCtx(makeMockClient({
          list: async () => {
            calls++;
            throw error;
          },
        })),
      )
    );
    assertStrictEquals(actual, error);
    assertEquals(calls, 1);
  }
});

Deno.test("erpnext_kanban_get_board - returns a Task board with metadata and pagination", async () => {
  let capturedLimit = 0;
  let capturedOffset = 0;
  let capturedFields: string[] = [];
  let capturedFilters: unknown[] = [];

  const mockClient = makeMockClient({
    list: async (
      _doctype: string,
      opts: {
        limit?: number;
        limit_start?: number;
        fields?: string[];
        filters?: unknown[];
      },
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
    {
      doctype: "Task",
      limit: 2,
      offset: 3,
      project: "Alpha",
      priority: "High",
    },
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
    "exp_start_date",
    "exp_end_date",
    "expected_time",
    "actual_time",
    "description",
    "_assign",
    "is_milestone",
  ]);
  assertEquals(capturedFilters, [
    ["project", "=", "Alpha"],
    ["priority", "=", "High"],
  ]);
  assertEquals(
    (result._meta as { ui: { resourceUri: string } }).ui.resourceUri,
    "ui://mcp-erpnext/kanban-viewer",
  );
  assertEquals(result.doctype, "Task");
  assertEquals(
    (result.columns as Array<{ id: string; count: number }>)[0].id,
    "open",
  );
  assertEquals(
    (result.columns as Array<{ id: string; count: number }>)[0].count,
    1,
  );
  assertEquals(
    (result.pagination as { limit: number; offset: number; hasMore: boolean })
      .limit,
    2,
  );
  assertEquals(
    (result.pagination as { limit: number; offset: number; hasMore: boolean })
      .offset,
    3,
  );
  assertEquals((result.pagination as { loadedCount: number }).loadedCount, 5);
  assertEquals(
    (result.pagination as { limit: number; offset: number; hasMore: boolean })
      .hasMore,
    true,
  );
  assertEquals(
    (result.allowedTransitions as Array<
      { fromColumn: string; toColumn: string }
    >)[0].fromColumn,
    "open",
  );
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
  let calls = 0;
  let capturedFields: string[] = [];
  let capturedFilters: unknown[] = [];

  const mockClient = makeMockClient({
    list: async (
      _doctype: string,
      opts: { fields?: string[]; filters?: unknown[] },
    ) => {
      calls++;
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
          source: "Referral",
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

  assertEquals(calls, 1);
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
    "expected_closing",
    "transaction_date",
    "contact_person",
    "source",
  ]);
  assertEquals(capturedFilters, [
    ["opportunity_owner", "=", "alice@example.com"],
    ["party_name", "=", "Acme Corp"],
  ]);
  assertEquals(result.doctype, "Opportunity");
  assertEquals((result as unknown as KanbanBoard).cards[0].badges?.at(-1), {
    label: "Referral",
    tone: "info",
  });
  assertEquals((result.columns as Array<{ id: string }>)[0].id, "open");
  assertEquals(
    (result.cards as Array<{ title: string }>)[0].title,
    "ACME renewal",
  );
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
    "resolution_by",
    "opening_date",
    "resolution_date",
    "first_responded_on",
    "_assign",
  ]);
  assertEquals(capturedFilters, [
    ["priority", "=", "High"],
    ["customer", "=", "Acme Corp"],
    ["raised_by", "=", "alice@example.com"],
  ]);
  assertEquals(result.doctype, "Issue");
  assertEquals((result.columns as Array<{ id: string }>)[0].id, "open");
  assertEquals(
    (result.cards as Array<{ title: string }>)[0].title,
    "Shipment damaged in transit",
  );
});

Deno.test("erpnext_kanban_get_board - Task cards include enriched fields", async () => {
  const mockClient = makeMockClient({
    list: async () => [
      {
        name: "TASK-0001",
        subject: "Draft protocol",
        project: "Alpha",
        status: "Open",
        priority: "High",
        progress: 20,
        exp_end_date: "2025-01-01",
        description: "<p>Some <b>HTML</b> description</p>",
        _assign: '["alice@example.com"]',
      },
    ],
  });

  const tool = getTool("erpnext_kanban_get_board");
  const result = await tool.handler(
    { doctype: "Task" },
    makeCtx(mockClient),
  ) as Record<string, unknown>;
  const cards = result.cards as Array<Record<string, unknown>>;
  assertEquals(cards[0].assignee, "alice@example.com");
  assertEquals(cards[0].description, "Some HTML description");
  assertEquals(cards[0].dueDate, "2025-01-01");
  const badges = cards[0].badges as Array<{ label: string }>;
  assert(badges.some((b) => b.label === "Overdue"));
});

Deno.test("erpnext_kanban_get_board - Opportunity cards include closing date and assignee", async () => {
  const mockClient = makeMockClient({
    list: async () => [
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
        expected_closing: "2025-06-15",
      },
    ],
  });

  const tool = getTool("erpnext_kanban_get_board");
  const result = await tool.handler(
    { doctype: "Opportunity" },
    makeCtx(mockClient),
  ) as Record<string, unknown>;
  const cards = result.cards as Array<Record<string, unknown>>;
  assertEquals(cards[0].assignee, "alice@example.com");
  assertEquals(cards[0].dueDate, "2025-06-15");
  const badges = cards[0].badges as Array<{ label: string }>;
  assert(badges.some((b) => b.label === "Overdue"));
});

Deno.test("erpnext_kanban_get_board - Issue cards include SLA breach badge", async () => {
  const mockClient = makeMockClient({
    list: async () => [
      {
        name: "ISS-2026-00001",
        subject: "Shipment damaged",
        status: "Open",
        priority: "High",
        customer: "Acme Corp",
        raised_by: "alice@example.com",
        resolution_by: "2025-01-01",
        _assign: '["bob@example.com"]',
      },
    ],
  });

  const tool = getTool("erpnext_kanban_get_board");
  const result = await tool.handler(
    { doctype: "Issue" },
    makeCtx(mockClient),
  ) as Record<string, unknown>;
  const cards = result.cards as Array<Record<string, unknown>>;
  assertEquals(cards[0].assignee, "bob@example.com");
  assertEquals(cards[0].dueDate, "2025-01-01");
  const badges = cards[0].badges as Array<{ label: string }>;
  assert(badges.some((b) => b.label === "SLA breach"));
});

Deno.test("erpnext_kanban_move_card - executes an allowed Task move", async () => {
  let updatedDoctype = "";
  let updatedName = "";
  let updatedData: Record<string, unknown> | undefined;

  const mockClient = makeMockClient({
    update: async (
      doctype: string,
      name: string,
      data: Record<string, unknown>,
    ) => {
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
    update: async (
      doctype: string,
      name: string,
      data: Record<string, unknown>,
    ) => {
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
  assertEquals(
    (result.serverCard as { columnId: string }).columnId,
    "quotation",
  );
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
    update: async (
      doctype: string,
      name: string,
      data: Record<string, unknown>,
    ) => {
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
  assertEquals(
    (result.serverCard as { columnId: string }).columnId,
    "resolved",
  );
});
