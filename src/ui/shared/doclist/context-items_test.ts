import { assertEquals } from "@std/assert";
import { createActiveContextController } from "../active-context-controller.ts";
import type { ActiveContextFlowHost } from "../active-context-flow.ts";
import { documentContextItem } from "../document/context-items.ts";
import { documentModelOf } from "../document/model.ts";
import type { DocumentModel } from "../document/types.ts";
import { doclistRowContextItem } from "./context-items.ts";

const MODIFIED = "2026-10-18 09:30:00.000000";
const model = documentModelOf({
  doctype: "Sales Invoice",
  name: "INV-1",
  document: {
    doctype: "Sales Invoice",
    name: "INV-1",
    customer_name: "ACME",
    status: "Draft",
    grand_total: 0,
    paid: false,
    empty: " ",
    hidden: "Never shared",
    modified: MODIFIED,
  },
});

Deno.test("doclist context - conserve la référence et partage les colonnes visibles comme champs de ligne", () => {
  assertEquals(
    doclistRowContextItem(
      model,
      [
        { id: "customer_name", label: "Client" },
        { id: "grand_total", label: "Montant" },
        { id: "paid", label: "Réglé" },
        { id: "empty", label: "Vide" },
        { id: "missing", label: "Absent" },
      ],
      "Factures",
      "invoice-list",
    ),
    {
      id: "record:Sales Invoice:INV-1",
      view: "Factures",
      reconcileKey: "invoice-list",
      label: "INV-1",
      value: "Sales Invoice · ACME · Draft",
      fields: [
        { label: "Client", value: "ACME" },
        { label: "Montant", value: "0" },
        { label: "Réglé", value: "false" },
      ],
      fieldsSource: "row",
      modified: MODIFIED,
    },
  );
});

Deno.test("doclist context - borne aux six colonnes visibles dans leur ordre", () => {
  const keys = Array.from({ length: 8 }, (_, index) => `field_${index}`);
  const manyFields: DocumentModel = {
    ...model,
    envelope: {
      ...model.envelope,
      document: Object.fromEntries(keys.map((key) => [key, key])),
      fieldLayout: { preview: ["field_7"], sections: [], labels: {} },
    },
  };
  const item = doclistRowContextItem(
    manyFields,
    keys.map((id, index) => ({ id, label: `Colonne ${index}` })),
    "Factures",
  );
  assertEquals(
    item.fields,
    keys.slice(0, 6).map((value, index) => ({
      label: `Colonne ${index}`,
      value,
    })),
  );
  assertEquals(item.modified, undefined);
});

Deno.test("doclist context - ne partage ni valeurs vides ni objets métier", () => {
  const emptyFields: DocumentModel = {
    ...model,
    envelope: {
      ...model.envelope,
      document: {
        empty: " ",
        absent: null,
        metadata: { private: true },
        children: [{ name: "CHILD-1" }],
      },
    },
  };
  const item = doclistRowContextItem(
    emptyFields,
    ["empty", "absent", "metadata", "children"].map((id) => ({
      id,
      label: id,
    })),
    "Factures",
  );
  assertEquals(item.fields, []);
  assertEquals(item.fieldsSource, "row");
});

Deno.test("doclist context - un refresh de liste au même modified conserve les champs de la fiche ouverte", async () => {
  const host: ActiveContextFlowHost = {
    getHostCapabilities: () => ({
      updateModelContext: { structuredContent: {} },
    }),
    updateModelContext: () => Promise.resolve({}),
    sendMessage: () => Promise.resolve({}),
  };
  const controller = createActiveContextController(host, "root");
  const actions = controller.actionsForScope("root");
  const columns = [{ id: "customer_name", label: "Client" }];
  const row = doclistRowContextItem(model, columns, "Factures", "invoice-list");
  await actions.activate(row);
  const record = documentContextItem(
    {
      ...model,
      envelope: {
        ...model.envelope,
        document: { ...model.envelope.document, outstanding_amount: 1200 },
        fieldLayout: {
          preview: ["customer_name", "outstanding_amount"],
          sections: [],
          labels: { customer_name: "Client", outstanding_amount: "Reste dû" },
        },
      },
    },
    "Factures",
    "invoice-list",
  );
  const recordFields = [
    { label: "Client", value: "ACME" },
    { label: "Reste dû", value: "1200" },
  ];
  await actions.reconcileDocument(record.id, [record]);
  assertEquals(
    controller.getSnapshot().selections[0].item.fields,
    recordFields,
  );

  await actions.reconcileView("invoice-list", [
    doclistRowContextItem(model, columns, "Factures", "invoice-list"),
  ]);
  const selected = controller.getSnapshot().selections;
  assertEquals(selected.length, 1);
  assertEquals(selected[0].item.id, "record:Sales Invoice:INV-1");
  assertEquals(selected[0].item.fields, recordFields);
  assertEquals(selected[0].item.fieldsSource, "record");
});
