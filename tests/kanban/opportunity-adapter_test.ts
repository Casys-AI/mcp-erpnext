import { assert, assertEquals } from "jsr:@std/assert";
import { opportunityKanbanAdapter } from "../../src/kanban/adapters/opportunity.ts";
import type { ErpNextToolContext } from "../../src/tools/types.ts";

Deno.test("opportunity kanban adapter - exposes Opportunity columns and filters", () => {
  const columns = opportunityKanbanAdapter.getColumns();
  const allowedTransitions = opportunityKanbanAdapter.getAllowedTransitions();
  const fields = opportunityKanbanAdapter.getListFields();
  const filters = opportunityKanbanAdapter.buildListFilters({
    status: "Open",
    opportunity_owner: "alice@example.com",
    party_name: "Acme Corp",
  });

  assertEquals(columns.map((column) => column.id), [
    "open",
    "replied",
    "quotation",
    "converted",
    "closed",
    "lost",
  ]);
  assert(allowedTransitions.some((transition) =>
    transition.fromColumn === "open" &&
    transition.toColumn === "quotation" &&
    transition.allowed
  ));
  assertEquals(fields, [
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
  assertEquals(filters, [
    ["status", "=", "Open"],
    ["opportunity_owner", "=", "alice@example.com"],
    ["party_name", "=", "Acme Corp"],
  ]);
});

Deno.test("opportunity kanban adapter - maps opportunities to normalized cards", () => {
  const cards = opportunityKanbanAdapter.buildCards([
    {
      name: "CRM-OPP-2026-00001",
      title: "ACME renewal",
      opportunity_from: "Customer",
      party_name: "Acme Corp",
      status: "Quotation",
      opportunity_amount: 12500,
      currency: "EUR",
      probability: 70,
      opportunity_owner: "alice@example.com",
    },
  ]);

  assertEquals(cards.length, 1);
  assertEquals(cards[0].id, "CRM-OPP-2026-00001");
  assertEquals(cards[0].title, "ACME renewal");
  assertEquals(cards[0].subtitle, "Acme Corp");
  assertEquals(cards[0].columnId, "quotation");
  assertEquals(cards[0].badges?.[0].label, "Customer");
  assertEquals(cards[0].metrics?.[0].value, "EUR 12500");
  assertEquals(cards[0].metrics?.[1].value, "70%");
});

Deno.test("opportunity kanban adapter - executes an allowed move through Opportunity update", async () => {
  let capturedDoctype = "";
  let capturedName = "";
  let capturedData: Record<string, unknown> | undefined;

  const ctx: ErpNextToolContext = {
    client: ({
      get: async () => ({
        name: "CRM-OPP-2026-00001",
        title: "ACME renewal",
        party_name: "Acme Corp",
        status: "Open",
      }),
      update: async (doctype: string, name: string, data: Record<string, unknown>) => {
        capturedDoctype = doctype;
        capturedName = name;
        capturedData = data;
        return {
          name,
          title: "ACME renewal",
          party_name: "Acme Corp",
          opportunity_from: "Customer",
          status: "Quotation",
          opportunity_amount: 12500,
          currency: "EUR",
          probability: 70,
          opportunity_owner: "alice@example.com",
        };
      },
    } as unknown) as ErpNextToolContext["client"],
  };

  const result = await opportunityKanbanAdapter.executeMove({
    doctype: "Opportunity",
    cardId: "CRM-OPP-2026-00001",
    fromColumn: "open",
    toColumn: "quotation",
  }, ctx);

  assertEquals(capturedDoctype, "Opportunity");
  assertEquals(capturedName, "CRM-OPP-2026-00001");
  assertEquals(capturedData, { status: "Quotation" });
  assertEquals(result.ok, true);
  assertEquals(result.serverCard?.columnId, "quotation");
});

Deno.test("opportunity kanban adapter - rejects stale client state before update", async () => {
  let updateCalled = false;

  const ctx: ErpNextToolContext = {
    client: ({
      get: async () => ({
        name: "CRM-OPP-2026-00001",
        title: "ACME renewal",
        party_name: "Acme Corp",
        status: "Converted",
      }),
      update: async () => {
        updateCalled = true;
        return {};
      },
    } as unknown) as ErpNextToolContext["client"],
  };

  const result = await opportunityKanbanAdapter.executeMove({
    doctype: "Opportunity",
    cardId: "CRM-OPP-2026-00001",
    fromColumn: "open",
    toColumn: "quotation",
  }, ctx);

  assertEquals(updateCalled, false);
  assertEquals(result.ok, false);
  assertEquals(
    result.errorMessage,
    "Opportunity moved on the server from open to converted. Refresh the board and try again.",
  );
});
