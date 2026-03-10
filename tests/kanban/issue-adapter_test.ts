import { assert, assertEquals } from "jsr:@std/assert";
import { issueKanbanAdapter } from "../../src/kanban/adapters/issue.ts";
import type { ErpNextToolContext } from "../../src/tools/types.ts";

Deno.test("issue kanban adapter - exposes Issue columns and filters", () => {
  const columns = issueKanbanAdapter.getColumns();
  const allowedTransitions = issueKanbanAdapter.getAllowedTransitions();
  const fields = issueKanbanAdapter.getListFields();
  const filters = issueKanbanAdapter.buildListFilters({
    status: "Open",
    priority: "High",
    customer: "Acme Corp",
    raised_by: "alice@example.com",
  });

  assertEquals(columns.map((column) => column.id), [
    "open",
    "replied",
    "on-hold",
    "resolved",
    "closed",
  ]);
  assert(allowedTransitions.some((transition) =>
    transition.fromColumn === "open" &&
    transition.toColumn === "resolved" &&
    transition.allowed
  ));
  assertEquals(fields, [
    "name",
    "subject",
    "status",
    "priority",
    "customer",
    "raised_by",
  ]);
  assertEquals(filters, [
    ["status", "=", "Open"],
    ["priority", "=", "High"],
    ["customer", "=", "Acme Corp"],
    ["raised_by", "=", "alice@example.com"],
  ]);
});

Deno.test("issue kanban adapter - maps issues to normalized cards", () => {
  const cards = issueKanbanAdapter.buildCards([
    {
      name: "ISS-2026-00001",
      subject: "Shipment damaged in transit",
      status: "On Hold",
      priority: "High",
      customer: "Acme Corp",
      raised_by: "alice@example.com",
    },
  ]);

  assertEquals(cards.length, 1);
  assertEquals(cards[0].id, "ISS-2026-00001");
  assertEquals(cards[0].title, "Shipment damaged in transit");
  assertEquals(cards[0].subtitle, "Acme Corp");
  assertEquals(cards[0].columnId, "on-hold");
  assertEquals(cards[0].badges?.[0].label, "High");
  assertEquals(cards[0].metrics?.[0].value, "alice@example.com");
});

Deno.test("issue kanban adapter - executes an allowed move through Issue update", async () => {
  let capturedDoctype = "";
  let capturedName = "";
  let capturedData: Record<string, unknown> | undefined;

  const ctx: ErpNextToolContext = {
    client: ({
      get: async () => ({
        name: "ISS-2026-00001",
        subject: "Shipment damaged in transit",
        status: "Open",
        customer: "Acme Corp",
        raised_by: "alice@example.com",
      }),
      update: async (doctype: string, name: string, data: Record<string, unknown>) => {
        capturedDoctype = doctype;
        capturedName = name;
        capturedData = data;
        return {
          name,
          subject: "Shipment damaged in transit",
          status: "Resolved",
          priority: "High",
          customer: "Acme Corp",
          raised_by: "alice@example.com",
        };
      },
    } as unknown) as ErpNextToolContext["client"],
  };

  const result = await issueKanbanAdapter.executeMove({
    doctype: "Issue",
    cardId: "ISS-2026-00001",
    fromColumn: "open",
    toColumn: "resolved",
  }, ctx);

  assertEquals(capturedDoctype, "Issue");
  assertEquals(capturedName, "ISS-2026-00001");
  assertEquals(capturedData, { status: "Resolved" });
  assertEquals(result.ok, true);
  assertEquals(result.serverCard?.columnId, "resolved");
});

Deno.test("issue kanban adapter - rejects stale client state before update", async () => {
  let updateCalled = false;

  const ctx: ErpNextToolContext = {
    client: ({
      get: async () => ({
        name: "ISS-2026-00001",
        subject: "Shipment damaged in transit",
        status: "Closed",
      }),
      update: async () => {
        updateCalled = true;
        return {};
      },
    } as unknown) as ErpNextToolContext["client"],
  };

  const result = await issueKanbanAdapter.executeMove({
    doctype: "Issue",
    cardId: "ISS-2026-00001",
    fromColumn: "open",
    toColumn: "resolved",
  }, ctx);

  assertEquals(updateCalled, false);
  assertEquals(result.ok, false);
  assertEquals(
    result.errorMessage,
    "Issue moved on the server from open to closed. Refresh the board and try again.",
  );
});
