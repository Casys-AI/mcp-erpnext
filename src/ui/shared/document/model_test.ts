import { assert, assertEquals } from "@std/assert";
import {
  documentEnvelopeOf,
  documentFieldOf,
  documentModelOf,
} from "./model.ts";

Deno.test("documentEnvelopeOf preserves a valid wrapper and canonical document identity", () => {
  const payload = {
    doctype: "Task",
    name: "TASK-REQUESTED",
    data: {
      doctype: "Task",
      name: "TASK-CANONICAL",
      subject: "Commissioning",
    },
    _availableTools: ["erpnext_task_get", "erpnext_file_list"],
    refreshRequest: {
      toolName: "erpnext_task_get",
      arguments: { name: "TASK-REQUESTED" },
    },
    _sendMessageHints: [{
      key: "timesheets",
      label: "Timesheets",
      tool: "erpnext_timesheet_list",
      args: { task: "{name}" },
      kind: "list",
    }],
  };

  assertEquals(documentEnvelopeOf(payload), {
    document: payload.data,
    doctype: "Task",
    name: "TASK-CANONICAL",
    availableTools: ["erpnext_task_get", "erpnext_file_list"],
    refreshRequest: {
      toolName: "erpnext_task_get",
      arguments: { name: "TASK-REQUESTED" },
    },
    sendMessageHints: [{
      key: "timesheets",
      label: "Timesheets",
      tool: "erpnext_timesheet_list",
      args: { task: "{name}" },
      kind: "list",
    }],
  });
});

Deno.test("documentEnvelopeOf accepts direct records and strips UI metadata", () => {
  const envelope = documentEnvelopeOf({
    doctype: "Project",
    name: "PROJ-1",
    project_name: "New plant",
    _availableTools: [],
    _sendMessageHints: [],
    refreshRequest: {
      toolName: "erpnext_project_get",
      arguments: { name: "PROJ-1" },
    },
  });

  assertEquals(envelope?.document, {
    doctype: "Project",
    name: "PROJ-1",
    project_name: "New plant",
  });
  assertEquals(envelope?.availableTools, []);
  assertEquals(envelope?.sendMessageHints, []);
});

Deno.test("documentEnvelopeOf keeps a direct document business data object", () => {
  const payload = {
    doctype: "Data Export",
    name: "EXP-1",
    title: "Export",
    data: { rows: 7 },
  };

  assertEquals(documentEnvelopeOf(payload)?.document, payload);
});

Deno.test("documentEnvelopeOf rejects malformed payloads and incomplete identity", () => {
  assertEquals(documentEnvelopeOf(null), null);
  assertEquals(documentEnvelopeOf([]), null);
  assertEquals(documentEnvelopeOf({ data: [] }), null);
  assertEquals(documentEnvelopeOf({ data: { name: "TASK-1" } }), null);
  assertEquals(documentEnvelopeOf({ data: { doctype: "Task" } }), null);
  assertEquals(
    documentEnvelopeOf({ data: { doctype: "Task", name: " " } }),
    null,
  );
});

Deno.test("documentEnvelopeOf drops malformed envelope members without losing the document", () => {
  const envelope = documentEnvelopeOf({
    data: { doctype: "Task", name: "TASK-1" },
    _availableTools: ["erpnext_task_get", 42, "", "erpnext_task_get"],
    refreshRequest: { toolName: "erpnext_task_get", arguments: null },
    _sendMessageHints: [null, { label: "" }, { label: "Issues", kind: "bad" }],
  });

  assertEquals(envelope?.availableTools, ["erpnext_task_get"]);
  assertEquals(envelope?.refreshRequest, undefined);
  assertEquals(envelope?.sendMessageHints, [{ label: "Issues" }]);
});

Deno.test("documentModelOf classifies a raw Frappe document deterministically", () => {
  const model = documentModelOf({
    data: {
      name: "TASK-0001",
      doctype: "Task",
      owner: "user@example.com",
      creation: "2026-08-24T08:30:00",
      docstatus: "1",
      subject: "Commission the line",
      workflow_state: "In progress",
      customer: "ACME",
      expected_start_date: "2026-08-25",
      progress: "64",
      description: "Short text still belongs in its named long-text section.",
      configuration: { safe: true, threshold: 3 },
      tags: ["urgent", 2, true, null],
      empty_links: [],
      mixed_values: [{ key: "one" }, "two"],
      items: [{ item_code: "A", qty: 2, amount: 12.5 }],
    },
  });

  assert(model);
  assertEquals(model.title, "Commission the line");
  assertEquals(model.status, "In progress");
  assertEquals(model.docstatus, 1);
  assertEquals(model.fields.map((field) => field.key), [
    "subject",
    "customer",
    "expected_start_date",
  ]);
  assertEquals(model.fields[2].kind, "date");
  assertEquals(model.progressFields, [{
    key: "progress",
    label: "Progress",
    value: 64,
    kind: "progress",
  }]);
  assertEquals(model.longFields.map((field) => field.key), [
    "description",
    "configuration",
  ]);
  assertEquals(typeof model.longFields[1].value, "string");
  assertEquals(model.collections.map((collection) => collection.key), [
    "tags",
    "empty_links",
    "mixed_values",
  ]);
  assertEquals(model.collections[0].values, ["urgent", 2, true, null]);
  assertEquals(model.collections[1].values, []);
  assertEquals(model.collections[2].values, ['{"key":"one"}', "two"]);
  assertEquals(model.childTables.map((table) => table.key), ["items"]);
  assertEquals(model.systemFields.map((field) => field.key), [
    "name",
    "doctype",
    "owner",
    "creation",
    "docstatus",
  ]);
  assertEquals(
    model.fields.some((field) => field.key === "workflow_state"),
    false,
  );
});

Deno.test("documentModelOf follows title and status priority then falls back to name", () => {
  const titled = documentModelOf({
    doctype: "Issue",
    name: "ISS-1",
    title: "Primary title",
    subject: "Secondary subject",
    workflow_state: "Review",
    status: "Open",
  });
  assert(titled);
  assertEquals(titled.title, "Primary title");
  assertEquals(titled.status, "Review");

  const fallback = documentModelOf({ doctype: "Warehouse", name: "Stores" });
  assert(fallback);
  assertEquals(fallback.title, "Stores");
  assertEquals(fallback.status, undefined);
  assertEquals(fallback.docstatus, undefined);
});

Deno.test("documentModelOf prefers canonical identity inside a normalized envelope", () => {
  const model = documentModelOf({
    document: {
      doctype: "Task",
      name: "TASK-CANONICAL",
      subject: "Canonical task",
    },
    doctype: "Task",
    name: "TASK-REQUESTED",
  });

  assertEquals(model.envelope.name, "TASK-CANONICAL");
  assertEquals(model.envelope.doctype, "Task");
});

Deno.test("documentFieldOf produces display-only primitives for nested values", () => {
  const field = documentFieldOf("unsafe_payload", {
    markup: "<script>alert(1)</script>",
  });
  assertEquals(field.kind, "json");
  assertEquals(typeof field.value, "string");
  assert(String(field.value).includes("<script>alert(1)</script>"));
});
