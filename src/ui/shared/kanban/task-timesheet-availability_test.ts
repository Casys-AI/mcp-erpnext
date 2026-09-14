import { assertEquals, assertExists } from "@std/assert";
import type { ToolHost } from "../jumps.ts";
import type { ToolResultPayload } from "../refresh.ts";
import {
  canCheckTaskTimesheets,
  loadTaskTimesheetAvailability,
  startTaskTimesheetAvailabilityCheck,
  type TaskTimesheetAvailability,
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

Deno.test("task timesheet presence reads only the exact task with a bounded parent query", async () => {
  const calls: unknown[] = [];
  const host: ToolHost = {
    callServerTool: (params, options) => {
      calls.push({ params, options });
      return Promise.resolve(result([{ name: "TS-001" }], 50));
    },
  };

  assertEquals(await loadTaskTimesheetAvailability(host, "TASK-001"), {
    status: "present",
  });
  assertEquals(calls, [{
    params: {
      name: "erpnext_doc_list",
      arguments: {
        doctype: "Timesheet",
        fields: ["name"],
        filters: [["Timesheet Detail", "task", "=", "TASK-001"]],
        limit: 1,
      },
    },
    options: { timeout: 10_000 },
  }]);
});

Deno.test("task timesheet availability accepts structured and legacy lists without claiming a count", async () => {
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
    { status: "present" },
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
    { status: "present" },
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
