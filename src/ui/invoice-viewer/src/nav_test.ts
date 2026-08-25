/**
 * Tests de la logique pure de navigation invoice-viewer.
 * Cas limites en premier : hints null/vides, clé inconnue, tool absent,
 * champ manquant dans les vars.
 */
import { assertEquals } from "@std/assert";
import { setLangSource } from "../../shared/i18n.ts";
import {
  canOfferNavigation,
  invoiceMutationActions,
  invoiceRootDocumentChange,
  invoiceRootNavigationActions,
  nextInvoiceMutationCommitted,
} from "./nav.ts";
import { INVOICE_ATTACHMENT_FIXTURES, INVOICE_FIXTURE } from "./fixture.ts";
import {
  invoiceDataFromPayload,
  invoiceDocumentEnvelope,
  type InvoicePayload,
} from "./types.ts";

// Langue stable pour les libellés traduits ("Paiements" en fr)
setLangSource(() => "en-US");

const SALES_INVOICE_HINTS = [
  {
    key: "payments",
    label: "Payments",
    message: "Show payment entries for invoice {id}",
    tool: "erpnext_doc_list",
    args: {
      doctype: "Payment Entry",
      fields: [
        "name",
        "posting_date",
        "paid_amount",
        "mode_of_payment",
        "docstatus",
      ],
      filters: [["Payment Entry Reference", "reference_name", "=", "{id}"]],
      limit: 20,
    },
    kind: "list" as const,
  },
  {
    key: "customer",
    label: "Customer",
    message: "Show customer CUST-ACME",
    tool: "erpnext_customer_get",
    args: { name: "CUST-ACME" },
    kind: "record" as const,
  },
];

const PURCHASE_HINTS = [
  {
    key: "payments",
    label: "Payments",
    message: "Show payment entries for invoice {id}",
    tool: "erpnext_doc_list",
    args: { limit: 20 },
    kind: "list" as const,
  },
  {
    key: "supplier",
    label: "Supplier",
    message: "Show supplier SUPP-1",
    tool: "erpnext_supplier_get",
    args: { name: "SUPP-1" },
    kind: "record" as const,
  },
];

const SALES_TOOLS = ["erpnext_doc_list", "erpnext_customer_get"];
const PURCHASE_TOOLS = ["erpnext_doc_list", "erpnext_supplier_get"];

// ── Cas limites ───────────────────────────────────────────────────────────────

Deno.test("invoice nav : hints absents → aucune action racine", () => {
  assertEquals(
    invoiceRootNavigationActions(null, { id: "X" }, "sub", [], true),
    [],
  );
  assertEquals(
    invoiceRootNavigationActions([], { id: "X" }, "sub", [], true),
    [],
  );
});

Deno.test("invoice nav : action visible pour un saut ou message.text, jamais sans canal", () => {
  const jump = invoiceRootNavigationActions(
    SALES_INVOICE_HINTS,
    { id: "SINV-1" },
    "sub",
    SALES_TOOLS,
    true,
  )[0].jump;
  assertEquals(canOfferNavigation(jump, false, false), true);
  assertEquals(canOfferNavigation(null, true, false), true);
  assertEquals(canOfferNavigation(null, false, false), false);
  assertEquals(canOfferNavigation(null, false, true), true);
});

Deno.test("invoice nav : hints sans outil deviennent des questions exactes", () => {
  const noTool = [
    { key: "payments", label: "Payments", message: "Tell me about {id}" },
    { key: "customer", label: "Customer", message: "Tell me about CUST-1" },
  ];
  const actions = invoiceRootNavigationActions(
    noTool,
    { id: "SINV-1", party: "" },
    "sub",
    [],
    false,
  );
  assertEquals(actions.map(({ key, jump, message }) => [key, jump, message]), [
    ["payments", null, "Tell me about SINV-1"],
    ["customer", null, "Tell me about CUST-1"],
  ]);
});

Deno.test("invoice nav : consomme toutes les relations racine sauf item et stock", () => {
  const hints = [
    {
      key: "customer",
      label: "Customer",
      message: "Show customer CUST-1",
      tool: "erpnext_customer_get",
      args: { name: "CUST-1" },
      kind: "record" as const,
    },
    {
      key: "invoices",
      label: "Invoices",
      message: "Show invoices for {id}",
      tool: "erpnext_doc_list",
      args: {
        doctype: "Sales Invoice",
        filters: [["sales_order", "=", "{id}"]],
      },
      kind: "list" as const,
    },
    {
      key: "deliveries",
      label: "Delivery notes",
      message: "Show delivery notes for {id}",
      tool: "erpnext_doc_list",
      args: {
        doctype: "Delivery Note",
        filters: [["sales_order", "=", "{id}"]],
      },
      kind: "list" as const,
    },
    {
      key: "item",
      label: "Item",
      message: "Show item {item}",
      tool: "erpnext_item_get",
      args: { name: "{item}" },
      kind: "record" as const,
    },
    {
      key: "stock",
      label: "Stock",
      message: "Show stock for {item}",
      tool: "erpnext_stock_balance",
      args: { item_code: "{item}" },
      kind: "list" as const,
    },
  ];
  const actions = invoiceRootNavigationActions(
    hints,
    { id: "SO-1" },
    "liées à SO-1",
    ["erpnext_customer_get", "erpnext_doc_list"],
    true,
  );
  assertEquals(actions.map((action) => action.key), [
    "customer",
    "invoices",
    "deliveries",
  ]);
  assertEquals(actions.map((action) => action.jump?.kind), [
    "record",
    "list",
    "list",
  ]);
  assertEquals(actions[1].jump?.tool.args.filters, [[
    "sales_order",
    "=",
    "SO-1",
  ]]);
});

Deno.test("invoice nav : gabarit incomplet ne devient ni saut ni question", () => {
  const actions = invoiceRootNavigationActions(
    [{
      key: "customer",
      label: "Customer",
      message: "Show customer {party}",
      tool: "erpnext_customer_get",
      args: { name: "{party}" },
      kind: "record",
    }],
    { id: "SINV-1", party: "" },
    "sub",
    ["erpnext_customer_get"],
    true,
  );
  assertEquals(actions, []);
});

// ── Chemin normal : Sales Invoice ────────────────────────────────────────────

Deno.test("invoice nav : Sales Invoice → paiements (liste) + client (fiche)", () => {
  const actions = invoiceRootNavigationActions(
    SALES_INVOICE_HINTS,
    { id: "SINV-1" },
    "liée à SINV-1",
    SALES_TOOLS,
    true,
  );
  const payments = actions.find((action) => action.key === "payments")!;
  const customer = actions.find((action) => action.key === "customer")!;
  assertEquals(payments.jump?.kind, "list");
  assertEquals(payments.jump?.tool.name, "erpnext_doc_list");
  assertEquals(payments.jump?.subtitle, "liée à SINV-1");
  assertEquals(
    (payments.jump?.tool.args["filters"] as unknown[][])[0][3],
    "SINV-1",
    "le filtre {id} doit être substitué",
  );
  assertEquals(customer.jump?.kind, "record");
  assertEquals(customer.jump?.tool.name, "erpnext_customer_get");
  assertEquals(customer.jump?.tool.args["name"], "CUST-ACME");
  assertEquals(customer.message, "Show customer CUST-ACME");
});

// ── Chemin normal : Purchase Invoice ─────────────────────────────────────────

Deno.test("invoice nav : Purchase Invoice → paiements + fournisseur", () => {
  const actions = invoiceRootNavigationActions(
    PURCHASE_HINTS,
    { id: "PINV-1" },
    "sub",
    PURCHASE_TOOLS,
    true,
  );
  assertEquals(actions.map((action) => action.key), ["payments", "supplier"]);
  assertEquals(actions[0].jump?.tool.name, "erpnext_doc_list");
  assertEquals(actions[1].jump?.tool.name, "erpnext_supplier_get");
  assertEquals(actions[1].jump?.tool.args["name"], "SUPP-1");
});

Deno.test("invoice nav : outil absent conserve seulement le repli conversationnel", () => {
  const actions = invoiceRootNavigationActions(
    SALES_INVOICE_HINTS,
    { id: "SINV-1" },
    "sub",
    [],
    true,
  );
  assertEquals(actions.map(({ jump, message }) => [jump, message]), [
    [null, "Show payment entries for invoice SINV-1"],
    [null, "Show customer CUST-ACME"],
  ]);
});

Deno.test("invoice nav : Quotation garde une cible Lead exacte", () => {
  const actions = invoiceRootNavigationActions(
    [{
      key: "lead",
      label: "Lead",
      message: "Show lead LEAD-1",
      tool: "erpnext_lead_get",
      args: { name: "LEAD-1" },
      kind: "record",
    }],
    { id: "QTN-1" },
    "sub",
    ["erpnext_lead_get"],
    true,
  );
  assertEquals(actions[0].key, "lead");
  assertEquals(actions[0].label, "Lead");
  assertEquals(actions[0].jump?.tool, {
    name: "erpnext_lead_get",
    args: { name: "LEAD-1" },
  });
});

Deno.test("invoice payload : préfère le DocType explicite et tolère le payload 3.0.x", () => {
  assertEquals(
    invoiceDataFromPayload({
      data: {
        name: "SO-001",
        customer: "CUST-1",
      } as never,
    })?.doctype,
    "Sales Invoice",
  );
  assertEquals(
    invoiceDataFromPayload({
      data: {
        doctype: "Sales Order",
        name: "SO-001",
        customer: "CUST-1",
      } as never,
    })?.doctype,
    "Sales Order",
  );
  assertEquals(
    invoiceDataFromPayload({
      data: { name: "SO-002", customer: "CUST-1" } as never,
      refreshRequest: {
        toolName: "erpnext_sales_order_get",
        arguments: { name: "SO-002" },
      },
    })?.doctype,
    "Sales Order",
  );
  assertEquals(
    invoiceDataFromPayload({
      data: { name: "QTN-001", party_name: "CUST-1" } as never,
      refreshRequest: {
        toolName: "erpnext_quotation_get",
        arguments: { name: "QTN-001" },
      },
    })?.doctype,
    "Quotation",
  );
});

Deno.test("invoice envelope : conserve document canonique, refresh et manifeste exact", () => {
  const envelope = invoiceDocumentEnvelope({
    data: {
      doctype: "Sales Invoice",
      name: "SINV-1",
      status: "Draft",
      grand_total: 42,
    },
    _availableTools: ["erpnext_file_list", "erpnext_file_list", ""],
    refreshRequest: {
      toolName: "erpnext_sales_invoice_get",
      arguments: { name: "SINV-1" },
    },
  });

  assertEquals(envelope?.doctype, "Sales Invoice");
  assertEquals(envelope?.name, "SINV-1");
  assertEquals(envelope?.document.name, "SINV-1");
  assertEquals(envelope?.availableTools, ["erpnext_file_list"]);
  assertEquals(envelope?.refreshRequest?.toolName, "erpnext_sales_invoice_get");
});

Deno.test("invoice envelope : manifeste absent reste legacy, manifeste malformé fail-close", () => {
  const document = {
    doctype: "Sales Invoice",
    name: "SINV-1",
    status: "Draft",
    grand_total: 42,
  };
  assertEquals(
    invoiceDocumentEnvelope({ data: document })?.availableTools,
    undefined,
  );
  assertEquals(
    invoiceDocumentEnvelope({
      data: document,
      _availableTools: "erpnext_file_upload",
    } as unknown as InvoicePayload)?.availableTools,
    [],
  );
});

Deno.test("invoice mutations : événements typés indépendants des outils dédiés", () => {
  assertEquals(
    invoiceRootDocumentChange(
      "Sales Invoice",
      "SINV-1",
      "submit",
      "2026-08-24T10:00:00.000Z",
    ),
    {
      doctype: "Sales Invoice",
      name: "SINV-1",
      mutation: "submit",
      committedAt: "2026-08-24T10:00:00.000Z",
      source: "invoice-viewer",
    },
  );
  assertEquals(
    invoiceRootDocumentChange(
      "Sales Order",
      "SO-1",
      "cancel",
      "2026-08-24T10:01:00.000Z",
    ),
    {
      doctype: "Sales Order",
      name: "SO-1",
      mutation: "cancel",
      committedAt: "2026-08-24T10:01:00.000Z",
      source: "invoice-viewer",
    },
  );
});

Deno.test("invoice fixture : pièces jointes visuelles sans action hôte", () => {
  assertEquals(INVOICE_FIXTURE._availableTools, []);
  assertEquals(
    INVOICE_ATTACHMENT_FIXTURES.map((file) => [file.fileName, file.isPrivate]),
    [
      ["ACC-SINV-2026-00042.pdf", true],
      ["signed-delivery-note.png", false],
    ],
  );
});

Deno.test("invoice actions : plein serveur préfère les outils dédiés exacts", () => {
  assertEquals(
    invoiceMutationActions("Sales Invoice", "SINV-1", [
      "erpnext_doc_submit",
      "erpnext_doc_cancel",
      "erpnext_sales_invoice_submit",
    ]),
    {
      submit: {
        toolName: "erpnext_sales_invoice_submit",
        args: { name: "SINV-1" },
      },
      cancel: {
        toolName: "erpnext_doc_cancel",
        args: { doctype: "Sales Invoice", name: "SINV-1" },
      },
    },
  );
});

Deno.test("invoice actions : sales-only utilise le submit dédié sans faux cancel", () => {
  assertEquals(
    invoiceMutationActions("Sales Invoice", "SINV-1", [
      "erpnext_sales_invoice_submit",
    ]),
    {
      submit: {
        toolName: "erpnext_sales_invoice_submit",
        args: { name: "SINV-1" },
      },
      cancel: null,
    },
  );
});

Deno.test("invoice actions : sales-only soumet et annule une Sales Order via ses outils dédiés", () => {
  assertEquals(
    invoiceMutationActions("Sales Order", "SO-1", [
      "erpnext_sales_order_submit",
      "erpnext_sales_order_cancel",
      "erpnext_sales_invoice_submit",
    ]),
    {
      submit: {
        toolName: "erpnext_sales_order_submit",
        args: { name: "SO-1" },
      },
      cancel: {
        toolName: "erpnext_sales_order_cancel",
        args: { name: "SO-1" },
      },
    },
  );
});

Deno.test("invoice actions : Quotation utilise le générique seulement sur serveur complet", () => {
  assertEquals(
    invoiceMutationActions("Quotation", "QTN-1", [
      "erpnext_doc_submit",
      "erpnext_doc_cancel",
    ]),
    {
      submit: {
        toolName: "erpnext_doc_submit",
        args: { doctype: "Quotation", name: "QTN-1" },
      },
      cancel: {
        toolName: "erpnext_doc_cancel",
        args: { doctype: "Quotation", name: "QTN-1" },
      },
    },
  );
  assertEquals(invoiceMutationActions("Quotation", "QTN-1", []), {
    submit: null,
    cancel: null,
  });
});

Deno.test("invoice actions : manifeste moderne refuse l'absent, payload 3.0.x reste toléré", () => {
  assertEquals(
    invoiceMutationActions("Purchase Invoice", "PINV-1", [
      "erpnext_sales_invoice_submit",
    ]),
    { submit: null, cancel: null },
  );
  assertEquals(
    invoiceMutationActions("Sales Invoice", "SINV-1", undefined),
    {
      submit: {
        toolName: "erpnext_sales_invoice_submit",
        args: { name: "SINV-1" },
      },
      cancel: {
        toolName: "erpnext_doc_cancel",
        args: { doctype: "Sales Invoice", name: "SINV-1" },
      },
    },
  );
  assertEquals(
    invoiceMutationActions("Customer", "CUST-1", [
      "erpnext_doc_submit",
      "erpnext_doc_cancel",
    ]),
    { submit: null, cancel: null },
  );
});

Deno.test("invoice actions : une mutation committed reste verrouillée jusqu'à l'hydratation canonique", () => {
  let committed = false;
  committed = nextInvoiceMutationCommitted(committed, "mutation-committed");
  assertEquals(committed, true);
  assertEquals(
    invoiceMutationActions(
      "Sales Order",
      "SO-1",
      ["erpnext_sales_order_submit", "erpnext_sales_order_cancel"],
      committed,
    ),
    { submit: null, cancel: null },
  );

  // Un échec de read-back n'appelle pas le reducer : le verrou reste vrai.
  assertEquals(committed, true);
  committed = nextInvoiceMutationCommitted(committed, "canonical-hydrated");
  assertEquals(committed, false);
  assertEquals(
    invoiceMutationActions(
      "Sales Order",
      "SO-1",
      ["erpnext_sales_order_submit", "erpnext_sales_order_cancel"],
      committed,
    ).submit?.toolName,
    "erpnext_sales_order_submit",
  );
});
