/**
 * Tests de la logique pure de navigation invoice-viewer.
 * Cas limites en premier : hints null/vides, clé inconnue, tool absent,
 * champ manquant dans les vars.
 */
import { assertEquals } from "@std/assert";
import { setLangSource } from "../../shared/i18n.ts";
import { invoiceJumps } from "./nav.ts";

// Langue stable pour les libellés traduits ("Paiements" en fr)
setLangSource(() => "en-US");

const SALES_HINTS = [
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
    message: "Show customer {party}",
    tool: "erpnext_customer_get",
    args: { name: "{party}" },
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
    message: "Show supplier {party}",
    tool: "erpnext_supplier_get",
    args: { name: "{party}" },
    kind: "record" as const,
  },
];

// ── Cas limites ───────────────────────────────────────────────────────────────

Deno.test("invoice nav : hints null → sauts null", () => {
  assertEquals(invoiceJumps(null, { id: "X" }, "sub"), {
    payments: null,
    party: null,
  });
});

Deno.test("invoice nav : hints vide → sauts null", () => {
  assertEquals(invoiceJumps([], { id: "X" }, "sub"), {
    payments: null,
    party: null,
  });
});

Deno.test("invoice nav : hints sans outil → questions seules, sauts null", () => {
  const noTool = [
    { key: "payments", label: "Payments", message: "Tell me about {id}" },
    { key: "customer", label: "Customer", message: "Tell me about {party}" },
  ];
  const r = invoiceJumps(noTool, { id: "X", party: "C" }, "sub");
  assertEquals(r.payments, null, "payments sans tool doit rester null");
  assertEquals(r.party, null, "party sans tool doit rester null");
});

Deno.test("invoice nav : clés inconnues (pas payments/customer/supplier) → sauts null", () => {
  const unknown = [
    { key: "foo", label: "Foo", tool: "some_tool", args: {} },
    { key: "bar", label: "Bar", tool: "other_tool", args: {} },
  ];
  const r = invoiceJumps(unknown, { id: "X" }, "sub");
  assertEquals(r.payments, null);
  assertEquals(r.party, null);
});

Deno.test("invoice nav : party manquant dans vars → pas de saut tiers (gabarit non rempli)", () => {
  // vars.party absent : un {party} vide ne doit jamais partir au serveur
  const r = invoiceJumps(SALES_HINTS, { id: "SINV-1" }, "sub");
  assertEquals(r.party, null);
  assertEquals(r.payments?.tool.name, "erpnext_doc_list");
});

// ── Chemin normal : Sales Invoice ────────────────────────────────────────────

Deno.test("invoice nav : Sales Invoice → paiements (liste) + client (fiche)", () => {
  const r = invoiceJumps(
    SALES_HINTS,
    { id: "SINV-1", party: "CUST-ACME" },
    "liée à SINV-1",
  );
  assertEquals(r.payments?.kind, "list");
  assertEquals(r.payments?.tool.name, "erpnext_doc_list");
  assertEquals(r.payments?.subtitle, "liée à SINV-1");
  assertEquals(
    (r.payments?.tool.args["filters"] as unknown[][])[0][3],
    "SINV-1",
    "le filtre {id} doit être substitué",
  );
  assertEquals(r.party?.kind, "record");
  assertEquals(r.party?.tool.name, "erpnext_customer_get");
  assertEquals(r.party?.tool.args["name"], "CUST-ACME");
  assertEquals(r.party?.subtitle, "liée à SINV-1");
});

// ── Chemin normal : Purchase Invoice ─────────────────────────────────────────

Deno.test("invoice nav : Purchase Invoice → paiements + fournisseur", () => {
  const r = invoiceJumps(
    PURCHASE_HINTS,
    { id: "PINV-1", party: "SUPP-1" },
    "sub",
  );
  assertEquals(r.payments?.tool.name, "erpnext_doc_list");
  assertEquals(r.party?.tool.name, "erpnext_supplier_get");
  assertEquals(r.party?.tool.args["name"], "SUPP-1");
});

// ── Mix : payments présent, customer absent ───────────────────────────────────

Deno.test("invoice nav : payments seul présent → party null", () => {
  const payOnly = [SALES_HINTS[0]];
  const r = invoiceJumps(payOnly, { id: "X", party: "C" }, "sub");
  assertEquals(r.payments?.kind, "list");
  assertEquals(r.party, null);
});
