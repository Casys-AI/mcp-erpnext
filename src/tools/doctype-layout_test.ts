import { assertEquals } from "@std/assert";
import type { FrappeClient } from "../api/frappe-client.ts";
import {
  createDocTypeLayoutMemo,
  DOCTYPE_LAYOUT_FAILURE_TTL_MS,
  DOCTYPE_LAYOUT_MAX_ENTRIES,
  DOCTYPE_LAYOUT_SKIPPED,
  DOCTYPE_LAYOUT_TIMEOUT_MS,
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

// ── Mémo en processus ─────────────────────────────────────────────────────────

function clock(start = 1_000_000) {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

const SAMPLE_LAYOUT = {
  version: 1 as const,
  preview: ["a"],
  sections: [],
  labels: {},
};

Deno.test("constantes du mémo : une heure en succès, 60 s en échec, 200 DocTypes", () => {
  assertEquals(DOCTYPE_LAYOUT_TTL_MS, 60 * 60 * 1000);
  assertEquals(DOCTYPE_LAYOUT_FAILURE_TTL_MS, 60 * 1000);
  assertEquals(DOCTYPE_LAYOUT_MAX_ENTRIES, 200);
});

Deno.test("mémo - un succès est servi jusqu'à une heure, pas au-delà", () => {
  const time = clock();
  const memo = createDocTypeLayoutMemo({ now: time.now });
  assertEquals(memo.get("Task"), undefined);

  memo.set("Task", SAMPLE_LAYOUT);
  time.advance(DOCTYPE_LAYOUT_TTL_MS - 1);
  assertEquals(memo.get("Task"), SAMPLE_LAYOUT);
  time.advance(1);
  assertEquals(memo.get("Task"), undefined);
});

Deno.test("mémo - un échec n'est servi que 60 s", () => {
  const time = clock();
  const memo = createDocTypeLayoutMemo({ now: time.now });

  memo.set("Task", null);
  time.advance(DOCTYPE_LAYOUT_FAILURE_TTL_MS - 1);
  // `null` mémorisé se distingue de `undefined` (rien en mémoire).
  assertEquals(memo.get("Task"), null);
  time.advance(1);
  assertEquals(memo.get("Task"), undefined);
});

Deno.test("mémo - borné : le plus ancien est évincé", () => {
  const memo = createDocTypeLayoutMemo({ maxEntries: 2, now: clock().now });
  memo.set("A", SAMPLE_LAYOUT);
  memo.set("B", SAMPLE_LAYOUT);
  memo.set("C", SAMPLE_LAYOUT);

  assertEquals(memo.size, 2);
  assertEquals(memo.get("A"), undefined);
  assertEquals(memo.get("B"), SAMPLE_LAYOUT);
  assertEquals(memo.get("C"), SAMPLE_LAYOUT);
});

Deno.test("mémo - réécrire un DocType le rend le plus récent et repart pour un TTL entier", () => {
  const time = clock();
  const memo = createDocTypeLayoutMemo({ maxEntries: 2, now: time.now });
  memo.set("A", SAMPLE_LAYOUT);
  memo.set("B", SAMPLE_LAYOUT);
  time.advance(DOCTYPE_LAYOUT_TTL_MS - 1);
  memo.set("A", SAMPLE_LAYOUT);
  memo.set("C", SAMPLE_LAYOUT);

  // B était le plus ancien après la réécriture de A.
  assertEquals(memo.get("B"), undefined);
  time.advance(DOCTYPE_LAYOUT_TTL_MS - 1);
  assertEquals(memo.get("A"), SAMPLE_LAYOUT);
});

Deno.test("mémo - un échec expiré ne compte plus dans la borne", () => {
  const time = clock();
  const memo = createDocTypeLayoutMemo({ maxEntries: 2, now: time.now });
  memo.set("A", null);
  memo.set("B", SAMPLE_LAYOUT);
  time.advance(DOCTYPE_LAYOUT_FAILURE_TTL_MS);
  memo.set("C", SAMPLE_LAYOUT);

  assertEquals(memo.get("B"), SAMPLE_LAYOUT);
  assertEquals(memo.get("C"), SAMPLE_LAYOUT);
});

Deno.test("mémo - rend une copie : modifier le résultat ne corrompt pas la mémoire", () => {
  const memo = createDocTypeLayoutMemo({ now: clock().now });
  memo.set("Task", structuredClone(SAMPLE_LAYOUT));
  const first = memo.get("Task");
  first!.preview.push("mutated");
  assertEquals(memo.get("Task")?.preview, ["a"]);
});

Deno.test("mémo - clear vide tout", () => {
  const memo = createDocTypeLayoutMemo({ now: clock().now });
  memo.set("A", SAMPLE_LAYOUT);
  memo.clear();
  assertEquals(memo.size, 0);
  assertEquals(memo.get("A"), undefined);
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

function freshMemo() {
  const time = clock();
  return { time, memo: createDocTypeLayoutMemo({ now: time.now }) };
}

Deno.test("fetchDocTypeLayout - appelle getdoctype en GET et mémorise la mise en page", async () => {
  const calls: Call[] = [];
  const client = fakeClient(() => SALES_INVOICE_GETDOCTYPE, calls);
  const { memo } = freshMemo();

  const first = await fetchDocTypeLayout(client, "Sales Invoice", { memo });
  const second = await fetchDocTypeLayout(client, "Sales Invoice", { memo });

  assertEquals(first?.preview[0], "customer_name");
  assertEquals(second, first);
  assertEquals(calls, [{
    method: "frappe.desk.form.load.getdoctype",
    args: { doctype: "Sales Invoice" },
    httpMethod: "GET",
  }]);
});

Deno.test("fetchDocTypeLayout - relit ERPNext une fois le TTL d'une heure écoulé", async () => {
  const calls: Call[] = [];
  const client = fakeClient(() => SALES_INVOICE_GETDOCTYPE, calls);
  const { memo, time } = freshMemo();

  await fetchDocTypeLayout(client, "Sales Invoice", { memo });
  time.advance(DOCTYPE_LAYOUT_TTL_MS - 1);
  await fetchDocTypeLayout(client, "Sales Invoice", { memo });
  assertEquals(calls.length, 1);
  time.advance(1);
  await fetchDocTypeLayout(client, "Sales Invoice", { memo });
  assertEquals(calls.length, 2);
});

Deno.test("fetchDocTypeLayout - un mémo par DocType", async () => {
  const calls: Call[] = [];
  const client = fakeClient(() => SALES_INVOICE_GETDOCTYPE, calls);
  const { memo } = freshMemo();

  await fetchDocTypeLayout(client, "Sales Invoice", { memo });
  await fetchDocTypeLayout(client, "Quotation", { memo });

  assertEquals(calls.map((call) => call.args.doctype), [
    "Sales Invoice",
    "Quotation",
  ]);
});

Deno.test("fetchDocTypeLayout - fail-soft : une erreur renvoie null et se journalise", async () => {
  const logs: string[] = [];
  const client = fakeClient(() => {
    throw new Error("403 Forbidden");
  });

  const layout = await fetchDocTypeLayout(client, "Sales Invoice", {
    memo: freshMemo().memo,
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
    { memo: freshMemo().memo, log: () => {} },
  );
  assertEquals(layout, null);
});

Deno.test("fetchDocTypeLayout - un échec est mémorisé 60 s puis retenté", async () => {
  const calls: Call[] = [];
  let fail = true;
  const client = fakeClient(() => {
    if (fail) throw new Error("boom");
    return SALES_INVOICE_GETDOCTYPE;
  }, calls);
  const { memo, time } = freshMemo();
  const options = { memo, log: () => {} };

  assertEquals(
    await fetchDocTypeLayout(client, "Sales Invoice", options),
    null,
  );
  time.advance(DOCTYPE_LAYOUT_FAILURE_TTL_MS - 1);
  assertEquals(
    await fetchDocTypeLayout(client, "Sales Invoice", options),
    null,
  );
  assertEquals(calls.length, 1);

  fail = false;
  time.advance(1);
  const layout = await fetchDocTypeLayout(client, "Sales Invoice", options);
  assertEquals(calls.length, 2);
  assertEquals(layout?.preview[0], "customer_name");
});

Deno.test("fetchDocTypeLayout - le mémo est borné et évince le plus ancien DocType", async () => {
  const calls: Call[] = [];
  const client = fakeClient(() => SALES_INVOICE_GETDOCTYPE, calls);
  const memo = createDocTypeLayoutMemo({ maxEntries: 2, now: clock().now });

  for (const doctype of ["A", "B", "C"]) {
    await fetchDocTypeLayout(client, doctype, { memo });
  }
  await fetchDocTypeLayout(client, "A", { memo });

  // A a été évincé par C : relu.
  assertEquals(calls.map((call) => call.args.doctype), ["A", "B", "C", "A"]);
});

Deno.test("fetchDocTypeLayout - ne lit aucune mise en page pour DocType ni Company", async () => {
  assertEquals([...DOCTYPE_LAYOUT_SKIPPED].sort(), ["Company", "DocType"]);
  const calls: Call[] = [];
  const client = fakeClient(() => SALES_INVOICE_GETDOCTYPE, calls);
  const { memo } = freshMemo();

  for (const doctype of ["DocType", "Company"]) {
    assertEquals(await fetchDocTypeLayout(client, doctype, { memo }), null);
  }
  assertEquals(calls, []);
  assertEquals(memo.size, 0);

  // Les autres DocTypes, même au nom voisin, sont lus.
  await fetchDocTypeLayout(client, "Company Group", { memo });
  assertEquals(calls.length, 1);
});

Deno.test("fetchDocTypeLayout - un client sans callMethodRaw ne fait pas échouer l'appelant", async () => {
  const layout = await fetchDocTypeLayout({} as FrappeClient, "Sales Invoice", {
    memo: freshMemo().memo,
    log: () => {},
  });
  assertEquals(layout, null);
});

// ── Budget de temps : la mise en page ne retarde jamais la fiche ──────────────

interface BudgetCall {
  options: { signal?: AbortSignal; retry?: boolean } | undefined;
}

/** Faux client dont la réponse arrive après `delayMs` (jamais si `null`). */
function slowClient(
  delayMs: number | null,
  seen: BudgetCall[] = [],
  { honorSignal = false }: { honorSignal?: boolean } = {},
): FrappeClient {
  return {
    callMethodRaw: (
      _method: string,
      _args: unknown,
      _http: unknown,
      options?: BudgetCall["options"],
    ) => {
      seen.push({ options });
      return new Promise((resolve, reject) => {
        if (honorSignal) {
          options?.signal?.addEventListener(
            "abort",
            () => reject(new Error("aborted by signal")),
          );
        }
        if (delayMs !== null) {
          setTimeout(() => resolve(SALES_INVOICE_GETDOCTYPE), delayMs);
        }
      });
    },
  } as unknown as FrappeClient;
}

Deno.test("fetchDocTypeLayout - le budget par défaut est de 1,5 s", () => {
  assertEquals(DOCTYPE_LAYOUT_TIMEOUT_MS, 1500);
});

Deno.test("fetchDocTypeLayout - un client qui ne répond jamais rend null dans le budget", async () => {
  const seen: BudgetCall[] = [];
  const logs: string[] = [];
  const { memo } = freshMemo();

  const startedAt = performance.now();
  const layout = await fetchDocTypeLayout(
    slowClient(null, seen),
    "Sales Invoice",
    { memo, timeoutMs: 30, log: (message) => logs.push(message) },
  );
  const elapsed = performance.now() - startedAt;

  assertEquals(layout, null);
  // Largement sous le délai du viewer (10 s) comme sous les reprises du client.
  assertEquals(elapsed < 1000, true, `a pris ${elapsed} ms`);
  assertEquals(logs.length, 1);
  assertEquals(logs[0].includes("Sales Invoice"), true);
  assertEquals(logs[0].includes("30"), true);
  // Un seul appel, sans reprise, annulable.
  assertEquals(seen.length, 1);
  assertEquals(seen[0].options?.retry, false);
  assertEquals(seen[0].options?.signal instanceof AbortSignal, true);
});

Deno.test("fetchDocTypeLayout - au dépassement, le signal d'annulation est déclenché", async () => {
  const seen: BudgetCall[] = [];
  const layout = await fetchDocTypeLayout(
    slowClient(null, seen, { honorSignal: true }),
    "Sales Invoice",
    { memo: freshMemo().memo, timeoutMs: 20, log: () => {} },
  );

  assertEquals(layout, null);
  assertEquals(seen[0].options?.signal?.aborted, true);
});

Deno.test("fetchDocTypeLayout - un dépassement est mémorisé 60 s comme les autres échecs", async () => {
  const seen: BudgetCall[] = [];
  const { memo, time } = freshMemo();
  const options = { memo, timeoutMs: 20, log: () => {} };

  assertEquals(
    await fetchDocTypeLayout(slowClient(null, seen), "Sales Invoice", options),
    null,
  );
  assertEquals(memo.get("Sales Invoice"), null);

  // Dans les 60 s : ni attente ni nouvel appel.
  time.advance(DOCTYPE_LAYOUT_FAILURE_TTL_MS - 1);
  assertEquals(
    await fetchDocTypeLayout(slowClient(null, seen), "Sales Invoice", options),
    null,
  );
  assertEquals(seen.length, 1);

  // Passé les 60 s : nouvel essai, qui peut aboutir.
  time.advance(1);
  const layout = await fetchDocTypeLayout(
    slowClient(0, seen),
    "Sales Invoice",
    options,
  );
  assertEquals(seen.length, 2);
  assertEquals(layout?.preview[0], "customer_name");
});

Deno.test("fetchDocTypeLayout - un client lent mais sous le budget donne la mise en page", async () => {
  const { memo } = freshMemo();
  const layout = await fetchDocTypeLayout(
    slowClient(20),
    "Sales Invoice",
    { memo, timeoutMs: 1000, log: () => {} },
  );

  assertEquals(layout?.preview[0], "customer_name");
  assertEquals(memo.get("Sales Invoice")?.preview[0], "customer_name");
});

Deno.test("fetchDocTypeLayout - une réponse tardive après le budget ne remplace pas l'échec mémorisé", async () => {
  const { memo } = freshMemo();
  await fetchDocTypeLayout(slowClient(60), "Sales Invoice", {
    memo,
    timeoutMs: 10,
    log: () => {},
  });
  // La réponse du faux client arrive ici, bien après le budget.
  await new Promise((resolve) => setTimeout(resolve, 100));

  assertEquals(memo.get("Sales Invoice"), null);
});

Deno.test("fetchDocTypeLayout - un appel réussi dans le budget ne laisse aucun minuteur", async () => {
  // Le détecteur de fuites de `Deno.test` échoue si le minuteur du budget survit.
  const layout = await fetchDocTypeLayout(
    slowClient(0),
    "Sales Invoice",
    { memo: freshMemo().memo, timeoutMs: 60_000, log: () => {} },
  );
  assertEquals(layout?.preview[0], "customer_name");
});
