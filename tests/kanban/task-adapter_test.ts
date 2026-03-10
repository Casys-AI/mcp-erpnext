import { assertEquals, assert } from "jsr:@std/assert";
import { taskKanbanAdapter } from "../../src/kanban/adapters/task.ts";
import type { ErpNextToolContext } from "../../src/tools/types.ts";

Deno.test("task kanban adapter - exposes Task columns and allowed transitions", () => {
  const columns = taskKanbanAdapter.getColumns();
  const allowedTransitions = taskKanbanAdapter.getAllowedTransitions();
  const fields = taskKanbanAdapter.getListFields();
  const filters = taskKanbanAdapter.buildListFilters({
    project: "Alpha",
    priority: "High",
  });

  assertEquals(columns.map((column) => column.id), [
    "open",
    "working",
    "pending-review",
    "overdue",
    "completed",
    "cancelled",
  ]);

  assert(allowedTransitions.some((transition) =>
    transition.fromColumn === "open" &&
    transition.toColumn === "working" &&
    transition.allowed
  ));
  assertEquals(fields, [
    "name",
    "subject",
    "project",
    "status",
    "priority",
    "progress",
  ]);
  assertEquals(filters, [
    ["project", "=", "Alpha"],
    ["priority", "=", "High"],
  ]);
  assertEquals(taskKanbanAdapter.validateTransition({
    doctype: "Task",
    cardId: "TASK-0001",
    fromColumn: "working",
    toColumn: "overdue",
  }), {
    allowed: false,
    reason: "Overdue is system-managed",
  });
});

Deno.test("task kanban adapter - maps ERPNext tasks to normalized cards", () => {
  const cards = taskKanbanAdapter.buildCards([
    {
      name: "TASK-0001",
      subject: "Draft protocol",
      project: "Alpha",
      status: "Pending Review",
      priority: "High",
      progress: 80,
    },
  ]);

  assertEquals(cards.length, 1);
  assertEquals(cards[0].id, "TASK-0001");
  assertEquals(cards[0].columnId, "pending-review");
  assertEquals(cards[0].title, "Draft protocol");
  assertEquals(cards[0].subtitle, "Alpha");
});

Deno.test("task kanban adapter - executes an allowed move through Task update", async () => {
  let capturedDoctype = "";
  let capturedName = "";
  let capturedData: Record<string, unknown> | undefined;

  const ctx: ErpNextToolContext = {
    client: ({
      get: async () => ({
        name: "TASK-0001",
        subject: "Draft protocol",
        project: "Alpha",
        status: "Open",
        priority: "High",
        progress: 80,
      }),
      update: async (doctype: string, name: string, data: Record<string, unknown>) => {
        capturedDoctype = doctype;
        capturedName = name;
        capturedData = data;
        return {
          name,
          subject: "Draft protocol",
          project: "Alpha",
          status: "Working",
          priority: "High",
          progress: 80,
        };
      },
    } as unknown) as ErpNextToolContext["client"],
  };

  const result = await taskKanbanAdapter.executeMove({
    doctype: "Task",
    cardId: "TASK-0001",
    fromColumn: "open",
    toColumn: "working",
  }, ctx);

  assertEquals(capturedDoctype, "Task");
  assertEquals(capturedName, "TASK-0001");
  assertEquals(capturedData, { status: "Working" });
  assertEquals(result.ok, true);
  assertEquals(result.toColumn, "working");
  assertEquals(result.serverCard?.columnId, "working");
});

Deno.test("task kanban adapter - rejects stale client state before update", async () => {
  let updateCalled = false;

  const ctx: ErpNextToolContext = {
    client: ({
      get: async () => ({
        name: "TASK-0001",
        subject: "Draft protocol",
        project: "Alpha",
        status: "Completed",
      }),
      update: async () => {
        updateCalled = true;
        return {};
      },
    } as unknown) as ErpNextToolContext["client"],
  };

  const result = await taskKanbanAdapter.executeMove({
    doctype: "Task",
    cardId: "TASK-0001",
    fromColumn: "open",
    toColumn: "working",
  }, ctx);

  assertEquals(updateCalled, false);
  assertEquals(result.ok, false);
  assertEquals(
    result.errorMessage,
    "Task moved on the server from open to completed. Refresh the board and try again.",
  );
});
