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

// ── Mise en page ERPNext (`_fieldLayout`) ────────────────────────────────────

const LAYOUT = {
  version: 1,
  preview: ["customer_name", "posting_date", "grand_total", "po_no"],
  sections: [
    { label: null, fields: ["company", "customer_name", "posting_date"] },
    { label: "Totals", fields: ["grand_total", "outstanding_amount"] },
    { label: "Notes", fields: ["po_no", "remarks"] },
  ],
  labels: {
    customer_name: "Client",
    outstanding_amount: "Outstanding Amount",
    remarks: "Internal Remarks",
    tags: "Tag List",
    progress: "Completion",
  },
};

function invoicePayload(extra: Record<string, unknown> = {}) {
  return {
    data: {
      doctype: "Sales Invoice",
      name: "SINV-0001",
      owner: "user@example.com",
      docstatus: 1,
      status: "Paid",
      company: "Acme",
      customer_name: "Ada",
      posting_date: "2026-10-01",
      grand_total: 100,
      outstanding_amount: 0,
      is_pos: false,
      due_date: null,
      remarks: "Short note stays a long section.",
      progress: "64",
      tags: ["a", "b"],
      custom_ref: "REF-1",
      items: [{ item_code: "A", qty: 1, amount: 100 }],
    },
    _fieldLayout: LAYOUT,
    ...extra,
  };
}

Deno.test("documentEnvelopeOf - lit la mise en page à côté de la fiche, hors du document", () => {
  const envelope = documentEnvelopeOf(invoicePayload());
  assertEquals(envelope?.fieldLayout?.preview, LAYOUT.preview);
  assertEquals(envelope?.fieldLayout?.labels.customer_name, "Client");
  assertEquals("_fieldLayout" in (envelope?.document ?? {}), false);
});

Deno.test("documentEnvelopeOf - une fiche directe n'expose pas la mise en page comme champ", () => {
  const envelope = documentEnvelopeOf({
    doctype: "Task",
    name: "TASK-1",
    subject: "Ship",
    _fieldLayout: LAYOUT,
  });
  assertEquals(envelope?.document, {
    doctype: "Task",
    name: "TASK-1",
    subject: "Ship",
  });
  assertEquals(envelope?.fieldLayout?.preview, LAYOUT.preview);
});

Deno.test("documentEnvelopeOf - une mise en page invalide est ignorée", () => {
  const envelope = documentEnvelopeOf(
    invoicePayload({ _fieldLayout: { version: 9, preview: [] } }),
  );
  assertEquals(envelope?.fieldLayout, undefined);
  assert(envelope);
  assertEquals("_fieldLayout" in envelope.document, false);
});

Deno.test("documentModelOf - avec mise en page, l'aperçu d'abord puis les sections repliables", () => {
  const model = documentModelOf(invoicePayload());
  assert(model);

  // Aperçu : champs avec valeur, dans l'ordre de `preview` (po_no est absent).
  assertEquals(model.fields.map((field) => field.key), [
    "customer_name",
    "posting_date",
    "grand_total",
  ]);
  // Reste des champs scalaires non vides, groupés comme la mise en page.
  // `due_date` (null) est omis, la section « Notes » (champs absents ou longs)
  // disparaît, et les champs hors mise en page clôturent la liste.
  assertEquals(
    model.sections?.map((section) => [
      section.label,
      section.fields.map((field) => field.key),
    ]),
    [
      [null, ["company"]],
      ["Totals", ["outstanding_amount"]],
      [null, ["is_pos", "custom_ref"]],
    ],
  );
});

Deno.test("documentModelOf - les libellés ERPNext l'emportent, sinon le libellé humanisé", () => {
  const model = documentModelOf(invoicePayload());
  assert(model);
  assertEquals(model.fields[0].label, "Client");
  // Pas de libellé ERPNext : libellé humanisé actuel.
  assertEquals(model.fields[1].label, "Posting date");
  const outstanding = model.sections?.flatMap((section) => section.fields)
    .find((field) => field.key === "outstanding_amount");
  assertEquals(outstanding?.label, "Outstanding Amount");
  // Champs longs, progression et collections relibellés eux aussi.
  assertEquals(model.longFields[0].label, "Internal Remarks");
  assertEquals(model.progressFields[0].label, "Completion");
  assertEquals(model.collections[0].label, "Tag List");
});

Deno.test("documentModelOf - tables enfants, champs longs, progression, collections et système gardent leur traitement", () => {
  const withLayout = documentModelOf(invoicePayload());
  const without = documentModelOf({ data: invoicePayload().data });
  assert(withLayout && without);

  assertEquals(withLayout.childTables, without.childTables);
  assertEquals(
    withLayout.longFields.map((field) => field.key),
    without.longFields.map((field) => field.key),
  );
  assertEquals(
    withLayout.progressFields.map((field) => field.key),
    without.progressFields.map((field) => field.key),
  );
  assertEquals(
    withLayout.collections.map((field) => field.key),
    without.collections.map((field) => field.key),
  );
  assertEquals(withLayout.systemFields, without.systemFields);
  assertEquals(withLayout.status, "Paid");
  assertEquals(
    withLayout.fields.some((field) => field.key === "status"),
    false,
  );
});

Deno.test("documentModelOf - sans mise en page le modèle est inchangé", () => {
  const model = documentModelOf({ data: invoicePayload().data });
  assert(model);
  assertEquals(model.sections, undefined);
  assertEquals(model.envelope.fieldLayout, undefined);
  // Les champs vides restent listés, dans l'ordre du document.
  assertEquals(model.fields.map((field) => field.key), [
    "company",
    "customer_name",
    "posting_date",
    "grand_total",
    "outstanding_amount",
    "is_pos",
    "due_date",
    "custom_ref",
  ]);
  assertEquals(model.fields[1].label, "Customer name");
});

Deno.test("documentModelOf - une mise en page invalide laisse le modèle inchangé", () => {
  const model = documentModelOf(
    invoicePayload({ _fieldLayout: { version: 1, preview: "x" } }),
  );
  assert(model);
  assertEquals(model.sections, undefined);
  assertEquals(model.fields.length, 8);
});

Deno.test("documentModelOf - Company garde sa sélection dédiée et ignore la mise en page", () => {
  const payload = {
    data: {
      doctype: "Company",
      name: "Acme",
      company_name: "Acme",
      abbr: "AC",
      country: "France",
      default_currency: "EUR",
      domain: "Services",
      is_group: 0,
    },
    _fieldLayout: {
      version: 1,
      preview: ["is_group"],
      sections: [{ label: "All", fields: ["company_name", "abbr"] }],
      labels: { company_name: "Company Name (ERPNext)" },
    },
  };
  const model = documentModelOf(payload);
  assert(model);
  assertEquals(model.sections, undefined);
  assertEquals(model.fields.map((field) => field.key), [
    "company_name",
    "abbr",
    "country",
    "default_currency",
    "domain",
    "is_group",
  ]);
  assertEquals(model.fields[0].label, "Company name");
});

Deno.test("documentModelOf - avec mise en page mais rien hors aperçu, sections vides", () => {
  const model = documentModelOf({
    data: { doctype: "Lead", name: "LEAD-1", lead_name: "Ada" },
    _fieldLayout: {
      version: 1,
      preview: ["lead_name"],
      sections: [{ label: null, fields: ["lead_name"] }],
      labels: {},
    },
  });
  assert(model);
  assertEquals(model.fields.map((field) => field.key), ["lead_name"]);
  assertEquals(model.sections, []);
});
