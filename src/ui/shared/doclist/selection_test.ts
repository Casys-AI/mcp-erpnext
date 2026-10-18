import { assertEquals } from "@std/assert";
import { DOC_LIST_DEFAULT_LIMIT } from "../../../tools/doc-list-query.ts";
import { DOC_LIST_DEFAULT_LIMIT as UI_DOC_LIST_DEFAULT_LIMIT } from "../../doc-list-defaults.ts";
import { documentModelOf } from "../document/model.ts";
import {
  DEFAULT_SELECTION_POLICY,
  emptySelectionState,
  projectSelection,
  reconcileSelectionGroup,
  type SelectionGroupMemberInput,
  selectionGroupSummary,
  setSelectionGroupMembers,
} from "../selection-projection.ts";
import {
  doclistCheckboxEvents,
  doclistFilteredSelectionOperation,
  doclistGroupMember,
  doclistHeaderSelection,
  doclistQueryFields,
  extendDoclistRange,
  isDoclistResultComplete,
  toggleDoclistFilteredMembers,
} from "./selection.ts";
import type { DoclistData } from "./types.ts";

function member(name: string): SelectionGroupMemberInput {
  return { name, label: name, fieldsSource: "row" };
}

function names(members: readonly SelectionGroupMemberInput[]): string[] {
  return members.map((item) => item.name);
}

Deno.test("doclist refresh - UI et outil partagent la même limite par défaut", () => {
  assertEquals(UI_DOC_LIST_DEFAULT_LIMIT, DOC_LIST_DEFAULT_LIMIT);
});

Deno.test("doclist group - reprend les champs visibles et les bornes métier", () => {
  const model = documentModelOf({
    doctype: "Sales Invoice",
    name: "INV-1",
    document: {
      name: "INV-1",
      customer_name: "ACME",
      posting_date: "2026-10-18",
      grand_total: 140,
      outstanding_amount: 0,
      currency: "EUR",
      modified: "2026-10-18 09:30:00",
      hidden: "Ne pas partager",
    },
  });
  const columns = [
    ["name", false],
    ["customer_name", false],
    ["posting_date", false],
    ["grand_total", true],
    ["outstanding_amount", true],
    ["currency", false],
    ["hidden", false],
  ].map(([id, numeric]) => ({
    id: String(id),
    label: String(id),
    numeric: Boolean(numeric),
  }));
  const item = doclistGroupMember(model, columns, "Invoices", "invoices");
  assertEquals(item, {
    name: "INV-1",
    label: "INV-1",
    value: "Sales Invoice · ACME",
    fields: columns.slice(0, 6).map(({ id, label }) => ({
      label,
      value: String(model.envelope.document[id]),
    })),
    fieldsSource: "row",
    modified: "2026-10-18 09:30:00",
    date: "2026-10-18",
    amount: 0,
    currency: "EUR",
  });
});

Deno.test("doclist group - ignore les valeurs de résumé invalides et colonnes cachées", () => {
  const model = documentModelOf({
    doctype: "Sales Invoice",
    name: "INV-2",
    document: {
      name: "INV-2",
      posting_date: "incorrect",
      grand_total: Infinity,
      currency: " ",
      transaction_date: "2026-10-18",
      outstanding_amount: 100,
    },
  });
  const item = doclistGroupMember(model, [
    { id: "posting_date", label: "Date", numeric: false },
    { id: "grand_total", label: "Total", numeric: true },
  ], "Invoices");
  assertEquals(item.date, undefined);
  assertEquals(item.amount, undefined);
  assertEquals(item.currency, undefined);
});

function amountMember(
  name: string,
  amountKey: string,
  amount: number,
  currencies: Record<string, unknown>,
): SelectionGroupMemberInput {
  return doclistGroupMember(
    documentModelOf({
      doctype: "Payment Entry",
      name,
      document: { name, [amountKey]: amount, ...currencies },
    }),
    [{ id: amountKey, label: amountKey, numeric: true }],
    "Payments",
  );
}

Deno.test("doclist group - lie chaque montant à sa propre devise", () => {
  const currencies = {
    currency: "TWD",
    default_currency: "GBP",
    paid_from_account_currency: "USD",
    paid_to_account_currency: "EUR",
  };
  for (
    const [amountKey, currency] of [
      ["received_amount", "EUR"],
      ["paid_amount", "USD"],
      ["grand_total", "TWD"],
      ["rounded_total", "TWD"],
      ["net_total", "TWD"],
      ["total", "TWD"],
      ["outstanding_amount", "TWD"],
    ]
  ) {
    const row = amountMember("PAY-1", amountKey, 100, currencies);
    assertEquals({ amount: row.amount, currency: row.currency }, {
      amount: 100,
      currency,
    });
  }
  const alias = amountMember("PAY-2", "paid_amount", 100, { currency: "USD" });
  assertEquals({ amount: alias.amount, currency: alias.currency }, {
    amount: 100,
    currency: "USD",
  });
});

Deno.test("doclist group - un montant sans devise associée n'entre pas dans la plage", () => {
  for (
    const [amountKey, currencies] of [
      ["received_amount", { currency: "USD" }],
      ["paid_amount", { default_currency: "EUR" }],
      ["grand_total", { default_currency: "EUR" }],
      ["base_grand_total", { currency: "USD" }],
      ["base_paid_amount", { paid_from_account_currency: "USD" }],
      ["qty", { currency: "EUR" }],
    ] as const
  ) {
    const row = amountMember("PAY-1", amountKey, 100, currencies);
    assertEquals(row.amount, undefined);
    assertEquals(row.currency, undefined);
  }
});

Deno.test("doclist group - Payment Entry 100 USD et 200 EUR ne produit aucune plage", () => {
  const members = [
    amountMember("PAY-USD", "received_amount", 100, {
      currency: "TWD",
      paid_to_account_currency: "USD",
    }),
    amountMember("PAY-EUR", "received_amount", 200, {
      currency: "TWD",
      paid_to_account_currency: "EUR",
    }),
  ];
  const state = setSelectionGroupMembers(emptySelectionState(), {
    scopeKey: "payments",
    reconcileKey: "payments",
    doctype: "Payment Entry",
    view: "Payments",
    fields: ["name"],
  }, members);
  const projected = projectSelection(state, {
    ...DEFAULT_SELECTION_POLICY,
    groupCollapseAbove: 1,
  });
  assertEquals(projected[0].query?.selectedCount, 2);
  assertEquals(projected[0].label, "2 Payment Entry");
});

Deno.test("doclist group - le refresh efface une ancienne plage quand la devise devient inconnue", () => {
  const state = setSelectionGroupMembers(emptySelectionState(), {
    scopeKey: "payments",
    reconcileKey: "payments",
    doctype: "Payment Entry",
    view: "Payments",
    fields: ["name"],
  }, [
    amountMember("PAY-1", "received_amount", 100, {
      paid_to_account_currency: "USD",
    }),
  ]);
  assertEquals(
    selectionGroupSummary(state.groups[0]),
    "1 Payment Entry · 100 USD",
  );
  const refreshed = reconcileSelectionGroup(state, "payments", "payments", [
    amountMember("PAY-1", "received_amount", 200, { currency: "USD" }),
  ]);
  assertEquals(refreshed.groups[0].members[0].amount, undefined);
  assertEquals(refreshed.groups[0].members[0].currency, undefined);
  assertEquals(selectionGroupSummary(refreshed.groups[0]), "1 Payment Entry");
});

Deno.test("doclist header - sélectionne toutes les pages filtrées et préserve le hors filtre", () => {
  const loaded = Array.from(
    { length: 70 },
    (_, index) => member(`INV-${index}`),
  );
  const filtered = loaded.filter((_, index) => index % 2 === 0);
  const selected = [loaded[1], filtered[0]];
  const next = toggleDoclistFilteredMembers(selected, filtered);
  assertEquals(next.length, 36);
  assertEquals(names(next), ["INV-1", ...names(filtered)]);
  assertEquals(names(selected), ["INV-1", "INV-0"]);
  assertEquals(names(toggleDoclistFilteredMembers(next, filtered)), ["INV-1"]);
});

Deno.test("doclist header - expose les états vide, mixte et coché sur le filtre entier", () => {
  const filtered = [member("A"), member("B"), member("C")];
  assertEquals(doclistHeaderSelection(filtered, [member("outside")]), {
    checked: false,
    indeterminate: false,
    selectedCount: 0,
    totalCount: 3,
  });
  assertEquals(doclistHeaderSelection(filtered, [member("A")]), {
    checked: false,
    indeterminate: true,
    selectedCount: 1,
    totalCount: 3,
  });
  assertEquals(doclistHeaderSelection(filtered, filtered), {
    checked: true,
    indeterminate: false,
    selectedCount: 3,
    totalCount: 3,
  });
  assertEquals(doclistHeaderSelection([], [member("A")]), {
    checked: false,
    indeterminate: false,
    selectedCount: 0,
    totalCount: 0,
  });
});

Deno.test("doclist header - capture la décision affichée et les lignes filtrées au clic", () => {
  const filtered = [member("A"), member("B")];
  const add = doclistFilteredSelectionOperation(false, filtered);
  const remove = doclistFilteredSelectionOperation(true, filtered);
  filtered.push(member("C"));
  assertEquals(add, { kind: "add", members: [member("A"), member("B")] });
  assertEquals(remove, { kind: "remove", names: ["A", "B"] });
});

Deno.test("doclist Shift - suit l'ordre trié courant sur toutes les pages", () => {
  const sorted = Array.from(
    { length: 45 },
    (_, index) => member(`INV-${index}`),
  );
  const selected = [member("outside"), sorted[4]];
  const next = extendDoclistRange(selected, sorted, "INV-4", "INV-26");
  assertEquals(names(next), ["outside", ...names(sorted.slice(4, 27))]);
  assertEquals(names(selected), ["outside", "INV-4"]);
});

Deno.test("doclist Shift - retrouve l'ancre par identité après changement de tri", () => {
  const oldOrder = ["A", "B", "C", "D", "E"].map(member);
  const selected = [oldOrder[1]];
  const newOrder = ["C", "B", "E", "A", "D"].map(member);
  assertEquals(
    names(extendDoclistRange(selected, newOrder, "B", "A")),
    ["B", "E", "A"],
  );
  assertEquals(
    names(extendDoclistRange(selected, newOrder, "B", "C")),
    ["B", "C"],
  );
  assertEquals(
    names(extendDoclistRange(selected, newOrder, "hidden", "E")),
    ["B", "E"],
  );
  assertEquals(
    names(extendDoclistRange(selected, newOrder, null, "E")),
    ["B", "E"],
  );
  assertEquals(names(extendDoclistRange(selected, newOrder, "B", "gone")), [
    "B",
  ]);
});

Deno.test("doclist checkbox - isole clic, double-clic et touches sans annuler Espace natif", () => {
  let toggles = 0;
  let rowActions = 0;
  let prevented = false;
  let shift = false;
  const props = doclistCheckboxEvents((event) => {
    toggles++;
    shift = event.shiftKey;
  });
  for (const handler of [props.onClick, props.onDblClick, props.onKeyDown]) {
    let stopped = false;
    const event = {
      shiftKey: true,
      stopPropagation: () => stopped = true,
      preventDefault: () => prevented = true,
      key: " ",
    };
    handler(event);
    if (!stopped) rowActions++;
  }
  assertEquals(toggles, 1);
  assertEquals(shift, true);
  assertEquals(rowActions, 0);
  assertEquals(prevented, false);
});

function result(
  count: number,
  args?: Record<string, unknown>,
  toolName = "erpnext_doc_list",
): DoclistData {
  return {
    count,
    data: Array.from(
      { length: count },
      (_, index) => ({ name: `INV-${index}` }),
    ),
    ...(args ? { refreshRequest: { toolName, arguments: args } } : {}),
  };
}

Deno.test("doclist query - Assets ne partage pas son alias current_value comme champ Frappe", () => {
  const assets: DoclistData = {
    ...result(1, { fields: ["name", "current_value"] }, "erpnext_asset_list"),
    doctype: "Asset",
    data: [{ name: "AST-1", current_value: 120 }],
  };
  assertEquals(doclistQueryFields(assets), ["name"]);
});

Deno.test("doclist query - doc_list reprend seulement un tableau de champs natifs", () => {
  assertEquals(
    doclistQueryFields(result(1, { fields: ["grand_total", "currency"] })),
    ["name", "grand_total", "currency"],
  );
  assertEquals(
    doclistQueryFields(result(1, { fields: ["name", "name", "currency"] })),
    ["name", "currency"],
  );
  for (const fields of [undefined, "name,currency", ["currency", 2]]) {
    assertEquals(doclistQueryFields(result(1, { fields })), ["name"]);
  }
  assertEquals(doclistQueryFields(result(1)), ["name"]);
});

Deno.test("doclist refresh - seule une fenêtre complète confirme une absence", () => {
  assertEquals(isDoclistResultComplete(result(19, { limit: 20 })), true);
  assertEquals(isDoclistResultComplete(result(20, { limit: 20 })), false);
  assertEquals(isDoclistResultComplete(result(50, { limit: 50 })), false);
  assertEquals(isDoclistResultComplete(result(0, { limit: 20 })), true);
  assertEquals(
    isDoclistResultComplete(result(19, { limit: 20, offset: 20 })),
    false,
  );
  assertEquals(
    isDoclistResultComplete(result(19, { limit: 20, limit_start: 20 })),
    false,
  );
  assertEquals(isDoclistResultComplete(result(50, { limit: 0 })), true);
  assertEquals(isDoclistResultComplete(result(19)), false);
  assertEquals(
    isDoclistResultComplete({ ...result(10, { limit: 20 }), count: 30 }),
    false,
  );
});

Deno.test("doclist refresh - seul doc_list garantit le contrat de complétude", () => {
  assertEquals(
    isDoclistResultComplete(result(DOC_LIST_DEFAULT_LIMIT - 1, {})),
    true,
  );
  assertEquals(
    isDoclistResultComplete(result(DOC_LIST_DEFAULT_LIMIT, {})),
    false,
  );
  assertEquals(
    isDoclistResultComplete(result(19, {}, "erpnext_sales_invoice_list")),
    false,
  );
  assertEquals(
    isDoclistResultComplete(result(20, {}, "erpnext_sales_invoice_list")),
    false,
  );
  assertEquals(
    isDoclistResultComplete(result(49, {}, "erpnext_user_list")),
    false,
  );
  assertEquals(
    isDoclistResultComplete(result(50, {}, "erpnext_account_list")),
    false,
  );
  assertEquals(isDoclistResultComplete(result(19, {}, "custom_list")), false);
  // Une limite explicite ne prouve pas qu'un outil dédié renvoie toute la liste.
  assertEquals(
    isDoclistResultComplete(result(9, { limit: 100 }, "erpnext_leave_balance")),
    false,
  );
  assertEquals(
    isDoclistResultComplete(result(9, { limit: 0 }, "erpnext_asset_list")),
    false,
  );
  assertEquals(
    isDoclistResultComplete(
      result(9, { limit: 100, offset: 0, limit_start: 0 }),
    ),
    true,
  );
});
