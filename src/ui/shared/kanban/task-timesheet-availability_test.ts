import {
  assertEquals,
  assertExists,
  assertNotEquals,
  assertStringIncludes,
} from "@std/assert";
import { translatorForLocale } from "../i18n.ts";
import type { ToolHost } from "../jumps.ts";
import type { ToolResultPayload } from "../refresh.ts";
import {
  canCheckTaskTimesheets,
  canNavigateToTaskTimesheets,
  loadTaskTimesheetAvailability,
  startTaskTimesheetAvailabilityCheck,
  TASK_TIMESHEET_MAX_PAGES,
  TASK_TIMESHEET_PAGE_SIZE,
  TASK_TIMESHEET_TOO_LARGE_KEY,
  type TaskTimesheetAvailability,
  taskTimesheetAvailabilityErrorMessage,
  taskTimesheetRevalidationKey,
} from "./task-timesheet-availability.ts";

function result(data: unknown[], count = data.length): ToolResultPayload {
  return { structuredContent: { doctype: "Timesheet", count, data } };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

Deno.test("task timesheet count reads only the exact task with bounded fresh pages", async () => {
  const calls: unknown[] = [];
  const host: ToolHost = {
    callServerTool: (params, options) => {
      calls.push({ params, options });
      return Promise.resolve(result([{ name: "TS-001" }], 50));
    },
  };

  assertEquals(await loadTaskTimesheetAvailability(host, "TASK-001"), {
    status: "present",
    count: 1,
  });
  assertEquals(calls, [{
    params: {
      name: "erpnext_doc_list",
      arguments: {
        doctype: "Timesheet",
        fields: ["name"],
        filters: [["Timesheet Detail", "task", "=", "TASK-001"]],
        limit: TASK_TIMESHEET_PAGE_SIZE,
        offset: 0,
        order_by: "name asc",
        skip_cache: true,
      },
    },
    options: { timeout: 10_000 },
  }]);
});

Deno.test("task timesheet availability accepts structured and legacy empty lists", async () => {
  for (
    const payload of [
      result([]),
      {
        content: [{
          type: "text",
          text: JSON.stringify({ doctype: "Timesheet", data: [] }),
        }],
      },
    ]
  ) {
    assertEquals(
      await loadTaskTimesheetAvailability({
        callServerTool: () => Promise.resolve(payload),
      }, "TASK-001"),
      { status: "empty" },
    );
  }
  assertEquals(
    await loadTaskTimesheetAvailability({
      callServerTool: () =>
        Promise.resolve(result([{ name: "TS-001" }, { name: "TS-001" }])),
    }, "TASK-001"),
    { status: "present", count: 1 },
  );
});

Deno.test("task timesheet count label remains localized and interpolated", () => {
  assertEquals(
    translatorForLocale("en")("kanban.timesheets.count", { count: "1,234" }),
    "Timesheets · 1,234",
  );
  assertEquals(
    translatorForLocale("fr")("kanban.timesheets.count", { count: "1 234" }),
    "Feuilles de temps · 1 234",
  );
});

Deno.test("a saturated relation remains navigable without claiming a count", () => {
  assertEquals(
    canNavigateToTaskTimesheets({ status: "present", count: 3 }),
    true,
  );
  assertEquals(
    canNavigateToTaskTimesheets({
      status: "error",
      message: "Too many rows",
      messageKey: TASK_TIMESHEET_TOO_LARGE_KEY,
    }),
    true,
  );
  assertEquals(canNavigateToTaskTimesheets({ status: "empty" }), false);
  assertEquals(
    canNavigateToTaskTimesheets({
      status: "error",
      message: "Permission denied",
    }),
    false,
  );
});

Deno.test("task timesheet count deduplicates parent names across pages", async () => {
  const firstPage = Array.from(
    { length: TASK_TIMESHEET_PAGE_SIZE },
    (_, index) => ({ name: `TS-${String(index).padStart(3, "0")}` }),
  );
  const calls: Array<Record<string, unknown>> = [];
  const availability = await loadTaskTimesheetAvailability({
    callServerTool: (params) => {
      calls.push(params.arguments);
      return Promise.resolve(
        params.arguments.offset === 0
          ? result(firstPage)
          : result([{ name: "TS-000" }, { name: "TS-200" }]),
      );
    },
  }, "TASK-001");

  assertEquals(availability, { status: "present", count: 201 });
  assertEquals(calls.map((call) => call.offset), [0, TASK_TIMESHEET_PAGE_SIZE]);
  assertEquals(
    calls.every((call) =>
      call.filters instanceof Array &&
      JSON.stringify(call.filters) ===
        JSON.stringify([["Timesheet Detail", "task", "=", "TASK-001"]])
    ),
    true,
  );
});

Deno.test("task timesheet errors and malformed payloads never become a confirmed empty list", async () => {
  const invalid: ToolResultPayload[] = [
    { isError: true, content: [{ type: "text", text: "Permission denied" }] },
    {},
    { content: [{ type: "text", text: "invalid JSON" }] },
    { structuredContent: { doctype: "Timesheet", count: 0 } },
    { structuredContent: { doctype: "Task", data: [] } },
    result([{}]),
    result([null]),
    result([{ name: "" }]),
  ];
  for (const payload of invalid) {
    const availability = await loadTaskTimesheetAvailability({
      callServerTool: () => Promise.resolve(payload),
    }, "TASK-001");
    assertEquals(availability.status, "error");
    if (availability.status === "error") assertExists(availability.message);
  }
  assertEquals(
    await loadTaskTimesheetAvailability({
      callServerTool: () => Promise.reject(new Error("Network unavailable")),
    }, "TASK-001"),
    { status: "error", message: "Network unavailable" },
  );
});

Deno.test("task timesheet presence requires the host proxy and the exact available tool", () => {
  assertEquals(
    canCheckTaskTimesheets("TASK-001", {}, ["erpnext_doc_list"]),
    true,
  );
  assertEquals(canCheckTaskTimesheets("TASK-001", {}, undefined), true);
  assertEquals(canCheckTaskTimesheets("TASK-001", undefined, undefined), false);
  assertEquals(canCheckTaskTimesheets("TASK-001", {}, []), false);
  assertEquals(
    canCheckTaskTimesheets("TASK-001", {}, ["erpnext_timesheet_list"]),
    false,
  );
  assertEquals(canCheckTaskTimesheets(null, {}, ["erpnext_doc_list"]), false);
  assertEquals(canCheckTaskTimesheets(" ", {}, ["erpnext_doc_list"]), false);
});

Deno.test("an empty task identity never initiates a timesheet read", async () => {
  let calls = 0;
  const availability = await loadTaskTimesheetAvailability({
    callServerTool: () => {
      calls++;
      return Promise.resolve(result([]));
    },
  }, " ");
  assertEquals(availability, { status: "unavailable" });
  assertEquals(calls, 0);
});

Deno.test("changing or closing the task drops its delayed timesheet response", async () => {
  const oldResponse = deferred<ToolResultPayload>();
  const newResponse = deferred<ToolResultPayload>();
  const states: TaskTimesheetAvailability[] = [];
  const oldCheck = startTaskTimesheetAvailabilityCheck(
    {
      callServerTool: () => oldResponse.promise,
    },
    "TASK-OLD",
    (availability) => states.push(availability),
  );
  oldCheck.cancel();
  const newCheck = startTaskTimesheetAvailabilityCheck(
    {
      callServerTool: () => newResponse.promise,
    },
    "TASK-NEW",
    (availability) => states.push(availability),
  );

  newResponse.resolve(result([{ name: "TS-NEW" }]));
  await newCheck.done;
  oldResponse.resolve(result([]));
  await oldCheck.done;
  assertEquals(states, [
    { status: "loading" },
    { status: "loading" },
    { status: "present", count: 1 },
  ]);
});

Deno.test("cancelled checks swallow their delayed errors while a retry publishes its result", async () => {
  const oldResponse = deferred<ToolResultPayload>();
  const states: TaskTimesheetAvailability[] = [];
  const oldCheck = startTaskTimesheetAvailabilityCheck(
    {
      callServerTool: () => oldResponse.promise,
    },
    "TASK-001",
    (availability) => states.push(availability),
  );
  oldCheck.cancel();
  const retry = startTaskTimesheetAvailabilityCheck(
    {
      callServerTool: () => Promise.resolve(result([])),
    },
    "TASK-001",
    (availability) => states.push(availability),
  );
  await retry.done;
  oldResponse.reject(new Error("Late permission error"));
  await oldCheck.done;
  assertEquals(states, [
    { status: "loading" },
    { status: "loading" },
    { status: "empty" },
  ]);
});

Deno.test("closing a Task detail prevents the next timesheet page call", async () => {
  const firstPage = deferred<ToolResultPayload>();
  const states: TaskTimesheetAvailability[] = [];
  let calls = 0;
  const check = startTaskTimesheetAvailabilityCheck(
    {
      callServerTool: () => {
        calls++;
        return firstPage.promise;
      },
    },
    "TASK-001",
    (availability) => states.push(availability),
  );

  assertEquals(calls, 1);
  check.cancel();
  firstPage.resolve(result(Array.from(
    { length: TASK_TIMESHEET_PAGE_SIZE },
    (_, index) => ({ name: `TS-${index}` }),
  )));
  await check.done;

  assertEquals(calls, 1);
  assertEquals(states, [{ status: "loading" }]);
});

Deno.test("a saturated bounded timesheet relation returns a localized explicit error", async () => {
  const fullPage = result(Array.from(
    { length: TASK_TIMESHEET_PAGE_SIZE },
    (_, index) => ({ name: `TS-${index}` }),
  ));
  let calls = 0;
  const availability = await loadTaskTimesheetAvailability({
    callServerTool: () => {
      calls++;
      return Promise.resolve(fullPage);
    },
  }, "TASK-001");

  assertEquals(calls, TASK_TIMESHEET_MAX_PAGES);
  assertEquals(availability.status, "error");
  if (availability.status !== "error") return;
  assertEquals(availability.messageKey, TASK_TIMESHEET_TOO_LARGE_KEY);
  assertEquals(
    taskTimesheetAvailabilityErrorMessage(
      availability,
      translatorForLocale("fr"),
    ),
    "Trop de feuilles de temps liées pour les compter exactement",
  );
});

Deno.test("task timesheet viewer errors translate again after a locale change while host diagnostics stay verbatim", async () => {
  const availability = await loadTaskTimesheetAvailability({
    callServerTool: () => Promise.resolve({}),
  }, "TASK-001");
  assertEquals(availability.status, "error");
  if (availability.status !== "error") return;
  assertEquals(
    taskTimesheetAvailabilityErrorMessage(
      availability,
      translatorForLocale("fr"),
    ),
    "Aucun contenu renvoyé par l'outil",
  );
  assertEquals(
    taskTimesheetAvailabilityErrorMessage(
      availability,
      translatorForLocale("en"),
    ),
    "No text payload returned by tool call",
  );
  assertEquals(
    taskTimesheetAvailabilityErrorMessage({
      status: "error",
      message: "Permission denied",
    }, translatorForLocale("fr")),
    "Permission denied",
  );
});

Deno.test("accepted Kanban root refreshes invalidate an open Task timesheet count", async () => {
  const before = taskTimesheetRevalidationKey(3, "2026-09-14 10:00:00");
  const after = taskTimesheetRevalidationKey(4, "2026-09-14 10:00:00");
  assertNotEquals(before, after);

  const source = await Deno.readTextFile(
    new URL("../../kanban-viewer/src/KanbanViewer.tsx", import.meta.url),
  );
  assertStringIncludes(source, "setRootFreshEvent(++rootEventRef.current)");
  assertStringIncludes(
    source,
    "taskTimesheetRevalidationKey(\n        rootFreshEvent,",
  );
});
