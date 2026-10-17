import { assertEquals } from "@std/assert";
import type { FrappeClient } from "../api/frappe-client.ts";
import { MemoryCache } from "../cache/memory.ts";
import {
  DOCTYPE_LAYOUT_TTL_MS,
  docTypeLayoutOf,
  fetchDocTypeLayout,
} from "./doctype-layout.ts";

/**
 * Réponse `frappe.desk.form.load.getdoctype` réduite pour Sales Invoice
 * (ERPNext v16) : mêmes indicateurs et mêmes ruptures que l'original, moins
 * les ~200 autres champs. `docs[1]` est le DocType enfant, joint par Frappe.
 */
const SALES_INVOICE_GETDOCTYPE = {
  docs: [
    {
      name: "Sales Invoice",
      doctype: "DocType",
      title_field: "customer_name",
      fields: [
        { fieldname: "customer_section", fieldtype: "Section Break" },
        { fieldname: "company", fieldtype: "Link", label: "Company", reqd: 1 },
        {
          fieldname: "naming_series",
          fieldtype: "Select",
          label: "Series",
          bold: 1,
        },
        { fieldname: "column_break1", fieldtype: "Column Break" },
        {
          fieldname: "customer",
          fieldtype: "Link",
          label: "Customer",
          bold: 1,
        },
        {
          fieldname: "customer_name",
          fieldtype: "Small Text",
          label: "Customer Name",
          bold: 1,
        },
        {
          fieldname: "posting_date",
          fieldtype: "Date",
          label: "Posting Date",
          bold: 1,
          in_list_view: 1,
        },
        {
          fieldname: "due_date",
          fieldtype: "Date",
          label: "Payment Due Date",
          in_list_view: 1,
        },
        {
          fieldname: "is_pos",
          fieldtype: "Check",
          label: "Include Payment (POS)",
        },
        {
          fieldname: "pos_closing_entry",
          fieldtype: "Link",
          label: "POS Closing Entry",
          hidden: 1,
        },
        {
          fieldname: "accounting_dimensions_section",
          fieldtype: "Section Break",
          label: "Accounting Dimensions",
        },
        { fieldname: "cost_center", fieldtype: "Link", label: "Cost Center" },
        { fieldname: "project", fieldtype: "Link", label: "Project" },
        {
          fieldname: "items_section",
          fieldtype: "Section Break",
          label: "Items",
        },
        {
          fieldname: "update_stock",
          fieldtype: "Check",
          label: "Update Stock",
        },
        { fieldname: "section_break_42", fieldtype: "Section Break" },
        { fieldname: "items", fieldtype: "Table", label: "Items", reqd: 1 },
        { fieldname: "section_break_30", fieldtype: "Section Break" },
        { fieldname: "total_qty", fieldtype: "Float", label: "Total Quantity" },
        {
          fieldname: "get_advances",
          fieldtype: "Button",
          label: "Get Advances Received",
        },
        {
          fieldname: "product_bundle_help",
          fieldtype: "HTML",
          label: "Product Bundle Help",
        },
        {
          fieldname: "totals_section",
          fieldtype: "Section Break",
          label: "Totals",
        },
        {
          fieldname: "grand_total",
          fieldtype: "Currency",
          label: "Grand Total",
          bold: 1,
          in_list_view: 1,
        },
        {
          fieldname: "rounded_total",
          fieldtype: "Currency",
          label: "Rounded Total",
          bold: 1,
        },
        {
          fieldname: "outstanding_amount",
          fieldtype: "Currency",
          label: "Outstanding Amount",
        },
        {
          fieldname: "payments_tab",
          fieldtype: "Tab Break",
          label: "Payments",
        },
        { fieldname: "payments_section", fieldtype: "Section Break" },
        {
          fieldname: "paid_amount",
          fieldtype: "Currency",
          label: "Paid Amount",
        },
        {
          fieldname: "more_info_tab",
          fieldtype: "Tab Break",
          label: "More Info",
        },
        {
          fieldname: "more_information",
          fieldtype: "Section Break",
          label: "Additional Info",
        },
        {
          fieldname: "status",
          fieldtype: "Select",
          label: "Status",
          in_list_view: 1,
        },
        { fieldname: "remarks", fieldtype: "Small Text", label: "Remarks" },
        { fieldname: "connections_tab", fieldtype: "Tab Break" },
      ],
    },
    {
      name: "Sales Invoice Item",
      doctype: "DocType",
      istable: 1,
      fields: [
        { fieldname: "item_code", fieldtype: "Link", label: "Item Code" },
      ],
    },
  ],
  user_settings: "{}",
};

Deno.test("docTypeLayoutOf - preview : bold et in_preview, title_field en tête", () => {
  const layout = docTypeLayoutOf(SALES_INVOICE_GETDOCTYPE);
  assertEquals(layout?.version, 1);
  assertEquals(layout?.preview, [
    "customer_name",
    "naming_series",
    "customer",
    "posting_date",
    "grand_total",
    "rounded_total",
  ]);
});

Deno.test("docTypeLayoutOf - in_preview compte comme bold, dans l'ordre du DocType", () => {
  const layout = docTypeLayoutOf({
    docs: [{
      name: "Task",
      fields: [
        { fieldname: "subject", fieldtype: "Data", label: "Subject", bold: 1 },
        { fieldname: "priority", fieldtype: "Select", in_preview: 1 },
        { fieldname: "status", fieldtype: "Select", in_list_view: 1 },
      ],
    }],
  });
  assertEquals(layout?.preview, ["subject", "priority"]);
});

Deno.test("docTypeLayoutOf - sans indicateur, in_list_view prend le relais", () => {
  const layout = docTypeLayoutOf({
    docs: [{
      name: "Lead",
      title_field: "lead_name",
      fields: [
        { fieldname: "lead_name", fieldtype: "Data", in_list_view: 1 },
        { fieldname: "email_id", fieldtype: "Data", in_list_view: 1 },
        { fieldname: "notes", fieldtype: "Small Text" },
      ],
    }],
  });
  // title_field déjà présent : pas de doublon.
  assertEquals(layout?.preview, ["lead_name", "email_id"]);
});

Deno.test("docTypeLayoutOf - title_field absent des indicateurs est ajouté en tête", () => {
  const layout = docTypeLayoutOf({
    docs: [{
      name: "Lead",
      title_field: "lead_name",
      fields: [
        { fieldname: "lead_name", fieldtype: "Data" },
        { fieldname: "email_id", fieldtype: "Data", in_list_view: 1 },
      ],
    }],
  });
  assertEquals(layout?.preview, ["lead_name", "email_id"]);
});

Deno.test("docTypeLayoutOf - ni indicateur ni title_field : preview vide", () => {
  const layout = docTypeLayoutOf({
    docs: [{
      name: "Note",
      fields: [{ fieldname: "content", fieldtype: "Text Editor" }],
    }],
  });
  assertEquals(layout?.preview, []);
});

Deno.test("docTypeLayoutOf - les ruptures de mise en page ne sont jamais des champs d'aperçu", () => {
  const layout = docTypeLayoutOf({
    docs: [{
      name: "X",
      fields: [
        { fieldname: "sb", fieldtype: "Section Break", bold: 1 },
        { fieldname: "btn", fieldtype: "Button", bold: 1 },
        { fieldname: "html", fieldtype: "HTML", in_preview: 1 },
        { fieldname: "rows", fieldtype: "Table", bold: 1 },
        { fieldname: "name1", fieldtype: "Data", bold: 1 },
      ],
    }],
  });
  assertEquals(layout?.preview, ["name1"]);
});

Deno.test("docTypeLayoutOf - sections : un groupe par rupture, sans champ visuel ni table", () => {
  const layout = docTypeLayoutOf(SALES_INVOICE_GETDOCTYPE);
  assertEquals(layout?.sections, [
    {
      label: null,
      fields: [
        "company",
        "naming_series",
        "customer",
        "customer_name",
        "posting_date",
        "due_date",
        "is_pos",
        "pos_closing_entry",
      ],
    },
    { label: "Accounting Dimensions", fields: ["cost_center", "project"] },
    { label: "Items", fields: ["update_stock"] },
    // section_break_42 (table seule) disparaît ; section_break_30 est sans label.
    { label: null, fields: ["total_qty"] },
    {
      label: "Totals",
      fields: ["grand_total", "rounded_total", "outstanding_amount"],
    },
    // Rupture d'onglet suivie d'une rupture de section sans label : l'onglet
    // donne son nom au groupe.
    { label: "Payments", fields: ["paid_amount"] },
    { label: "Additional Info", fields: ["status", "remarks"] },
  ]);
});

Deno.test("docTypeLayoutOf - une rupture de section avec label l'emporte sur l'onglet", () => {
  const layout = docTypeLayoutOf({
    docs: [{
      name: "X",
      fields: [
        { fieldname: "tab", fieldtype: "Tab Break", label: "Tab" },
        { fieldname: "sec", fieldtype: "Section Break", label: "Section" },
        { fieldname: "a", fieldtype: "Data" },
        { fieldname: "sec2", fieldtype: "Section Break" },
        { fieldname: "b", fieldtype: "Data" },
      ],
    }],
  });
  assertEquals(layout?.sections, [
    { label: "Section", fields: ["a"] },
    { label: null, fields: ["b"] },
  ]);
});

Deno.test("docTypeLayoutOf - des champs avant toute rupture forment un premier groupe sans label", () => {
  const layout = docTypeLayoutOf({
    docs: [{
      name: "X",
      fields: [
        { fieldname: "a", fieldtype: "Data" },
        { fieldname: "sec", fieldtype: "Section Break", label: "More" },
        { fieldname: "b", fieldtype: "Data" },
      ],
    }],
  });
  assertEquals(layout?.sections, [
    { label: null, fields: ["a"] },
    { label: "More", fields: ["b"] },
  ]);
});

Deno.test("docTypeLayoutOf - labels : fieldname vers label, champs de données seulement", () => {
  const layout = docTypeLayoutOf(SALES_INVOICE_GETDOCTYPE);
  assertEquals(layout?.labels.customer_name, "Customer Name");
  assertEquals(layout?.labels.posting_date, "Posting Date");
  assertEquals(layout?.labels.is_pos, "Include Payment (POS)");
  // Pas de label pour les ruptures, boutons, HTML ni tables.
  for (
    const key of [
      "customer_section",
      "get_advances",
      "product_bundle_help",
      "items",
      "payments_tab",
    ]
  ) {
    assertEquals(key in (layout?.labels ?? {}), false, key);
  }
  // Un champ sans label n'apparaît pas : la vue garde son libellé humanisé.
  assertEquals("connections_tab" in (layout?.labels ?? {}), false);
});

Deno.test("docTypeLayoutOf - ignore les DocTypes enfants joints par getdoctype", () => {
  const layout = docTypeLayoutOf(SALES_INVOICE_GETDOCTYPE);
  assertEquals("item_code" in (layout?.labels ?? {}), false);
});

Deno.test("docTypeLayoutOf - réponse inexploitable : null", () => {
  assertEquals(docTypeLayoutOf(null), null);
  assertEquals(docTypeLayoutOf(undefined), null);
  assertEquals(docTypeLayoutOf("use_cache"), null);
  assertEquals(docTypeLayoutOf({}), null);
  assertEquals(docTypeLayoutOf({ docs: [] }), null);
  assertEquals(docTypeLayoutOf({ docs: [{ name: "X" }] }), null);
  assertEquals(docTypeLayoutOf({ docs: [{ fields: "nope" }] }), null);
  assertEquals(docTypeLayoutOf({ message: { docs: [] } }), null);
});

Deno.test("docTypeLayoutOf - entrées de champ mal formées ignorées, le reste est conservé", () => {
  const layout = docTypeLayoutOf({
    docs: [{
      name: "X",
      fields: [
        null,
        "texte",
        { fieldtype: "Data" },
        { fieldname: "", fieldtype: "Data" },
        { fieldname: "ok", fieldtype: "Data", label: "Ok", bold: "1" },
        { fieldname: "no_type" },
        { fieldname: "no_label", fieldtype: "Data", label: 42 },
      ],
    }],
  });
  assertEquals(layout, {
    version: 1,
    preview: ["ok"],
    sections: [{ label: null, fields: ["ok", "no_label"] }],
    labels: { ok: "Ok" },
  });
});

Deno.test("docTypeLayoutOf - déterministe et sérialisable", () => {
  const first = docTypeLayoutOf(SALES_INVOICE_GETDOCTYPE);
  const second = docTypeLayoutOf(SALES_INVOICE_GETDOCTYPE);
  assertEquals(first, second);
  assertEquals(JSON.parse(JSON.stringify(first)), first);
});

// ── fetchDocTypeLayout ────────────────────────────────────────────────────────

interface Call {
  method: string;
  args: Record<string, unknown>;
  httpMethod: string | undefined;
}

function fakeClient(
  respond: () => unknown,
  calls: Call[] = [],
): FrappeClient {
  return {
    callMethodRaw: (
      method: string,
      args: Record<string, unknown>,
      httpMethod?: string,
    ) => {
      calls.push({ method, args, httpMethod });
      try {
        return Promise.resolve(respond());
      } catch (error) {
        return Promise.reject(error);
      }
    },
  } as unknown as FrappeClient;
}

Deno.test("fetchDocTypeLayout - appelle getdoctype en GET et met la mise en page en cache", async () => {
  const calls: Call[] = [];
  const client = fakeClient(() => SALES_INVOICE_GETDOCTYPE, calls);
  const cache = new MemoryCache();

  const first = await fetchDocTypeLayout(client, "Sales Invoice", { cache });
  const second = await fetchDocTypeLayout(client, "Sales Invoice", { cache });

  assertEquals(first?.preview[0], "customer_name");
  assertEquals(second, first);
  assertEquals(calls, [{
    method: "frappe.desk.form.load.getdoctype",
    args: { doctype: "Sales Invoice" },
    httpMethod: "GET",
  }]);
});

Deno.test("fetchDocTypeLayout - un cache par DocType", async () => {
  const calls: Call[] = [];
  const client = fakeClient(() => SALES_INVOICE_GETDOCTYPE, calls);
  const cache = new MemoryCache();

  await fetchDocTypeLayout(client, "Sales Invoice", { cache });
  await fetchDocTypeLayout(client, "Quotation", { cache });

  assertEquals(calls.map((call) => call.args.doctype), [
    "Sales Invoice",
    "Quotation",
  ]);
});

Deno.test("fetchDocTypeLayout - le TTL de la mise en page est d'une heure", async () => {
  assertEquals(DOCTYPE_LAYOUT_TTL_MS, 60 * 60 * 1000);
  const ttls: number[] = [];
  const cache = new MemoryCache();
  const set = cache.set.bind(cache);
  cache.set = <T>(key: string, value: T, ttlMs: number) => {
    ttls.push(ttlMs);
    set(key, value, ttlMs);
  };

  await fetchDocTypeLayout(
    fakeClient(() => SALES_INVOICE_GETDOCTYPE),
    "Sales Invoice",
    { cache },
  );

  assertEquals(ttls, [DOCTYPE_LAYOUT_TTL_MS]);
});

Deno.test("fetchDocTypeLayout - fail-soft : une erreur renvoie null et se journalise", async () => {
  const logs: string[] = [];
  const client = fakeClient(() => {
    throw new Error("403 Forbidden");
  });

  const layout = await fetchDocTypeLayout(client, "Sales Invoice", {
    cache: new MemoryCache(),
    log: (message) => logs.push(message),
  });

  assertEquals(layout, null);
  assertEquals(logs.length, 1);
  assertEquals(logs[0].includes("Sales Invoice"), true);
  assertEquals(logs[0].includes("403 Forbidden"), true);
});

Deno.test("fetchDocTypeLayout - une réponse inexploitable renvoie null", async () => {
  const layout = await fetchDocTypeLayout(
    fakeClient(() => ({ docs: [] })),
    "Sales Invoice",
    { cache: new MemoryCache(), log: () => {} },
  );
  assertEquals(layout, null);
});

Deno.test("fetchDocTypeLayout - un échec est mémorisé brièvement, sans rappeler ERPNext", async () => {
  const calls: Call[] = [];
  const client = fakeClient(() => {
    throw new Error("boom");
  }, calls);
  const cache = new MemoryCache();

  await fetchDocTypeLayout(client, "Sales Invoice", { cache, log: () => {} });
  const again = await fetchDocTypeLayout(client, "Sales Invoice", {
    cache,
    log: () => {},
  });

  assertEquals(again, null);
  assertEquals(calls.length, 1);
});

Deno.test("fetchDocTypeLayout - un client sans callMethodRaw ne fait pas échouer l'appelant", async () => {
  const layout = await fetchDocTypeLayout({} as FrappeClient, "Sales Invoice", {
    cache: new MemoryCache(),
    log: () => {},
  });
  assertEquals(layout, null);
});
