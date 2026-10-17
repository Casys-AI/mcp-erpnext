import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import {
  confirmPending,
  confirmTone,
  dismissConfirm,
  pendingConfirmText,
} from "../confirm-state.ts";
import { translatorForLocale } from "../i18n.ts";
import {
  LIFECYCLE_ACTIONS,
  LIFECYCLE_BUTTON_CLASS,
  lifecycleConfirmIsStale,
  lifecycleConfirmRequest,
  lifecycleConfirmSnapshot,
  lifecycleConfirmSubject,
  lifecycleErrorText,
  lifecycleFeedbackClass,
  lifecycleFeedbackRole,
  lifecycleOutcomeFeedback,
  lifecycleRefreshedFeedback,
  lifecycleVisibility,
} from "./lifecycle-actions.ts";

const en = translatorForLocale("en");
const fr = translatorForLocale("fr");

const NO_CAPABILITY = { canSubmit: false, canCancel: false };
const ALL_CAPABILITIES = { canSubmit: true, canCancel: true };

Deno.test("lifecycle : Soumettre en accent, Annuler en danger, libellés explicites", () => {
  assertEquals(LIFECYCLE_ACTIONS.submit.variant, "accent");
  assertEquals(LIFECYCLE_ACTIONS.cancel.variant, "danger");
  assertEquals(en(LIFECYCLE_ACTIONS.submit.labelKey), "Submit document");
  assertEquals(en(LIFECYCLE_ACTIONS.cancel.labelKey), "Cancel document");
  assertEquals(fr(LIFECYCLE_ACTIONS.submit.labelKey), "Soumettre la pièce");
  assertEquals(fr(LIFECYCLE_ACTIONS.cancel.labelKey), "Annuler la pièce");
  // Jamais le « Cancel » nu de common.cancel : il laisse croire qu'on annule
  // l'action en cours plutôt que le document.
  assert(LIFECYCLE_ACTIONS.cancel.labelKey !== "common.cancel");
  assert(en(LIFECYCLE_ACTIONS.cancel.labelKey) !== en("common.cancel"));
});

Deno.test("lifecycle : cible tactile d'au moins 44 px sur toute la largeur", () => {
  assertStringIncludes(LIFECYCLE_BUTTON_CLASS, "min-h-[44px]");
  assertStringIncludes(LIFECYCLE_BUTTON_CLASS, "w-full");
});

Deno.test("lifecycle : Soumettre pour un brouillon, Annuler pour un soumis, jamais les deux", () => {
  const visible = (
    docstatus: number | undefined,
    caps: { canSubmit: boolean; canCancel: boolean },
    status?: string,
    preview = false,
  ) => lifecycleVisibility({ docstatus, status, ...caps, preview });

  assertEquals(visible(0, ALL_CAPABILITIES), { submit: true, cancel: false });
  assertEquals(visible(1, ALL_CAPABILITIES), { submit: false, cancel: true });
  assertEquals(visible(2, ALL_CAPABILITIES), { submit: false, cancel: false });
  assertEquals(visible(undefined, ALL_CAPABILITIES), {
    submit: false,
    cancel: false,
  });
  // Le statut « Draft » suffit pour un payload sans docstatus.
  assertEquals(visible(undefined, ALL_CAPABILITIES, "Draft"), {
    submit: true,
    cancel: false,
  });
});

Deno.test("lifecycle : sans capacité serveur, aucune action (fail-closed)", () => {
  assertEquals(
    lifecycleVisibility({ docstatus: 0, status: "Draft", ...NO_CAPABILITY }),
    {
      submit: false,
      cancel: false,
    },
  );
  assertEquals(
    lifecycleVisibility({ docstatus: 1, status: undefined, ...NO_CAPABILITY }),
    {
      submit: false,
      cancel: false,
    },
  );
  // Une seule des deux capacités : seule l'action correspondante existe.
  assertEquals(
    lifecycleVisibility({
      docstatus: 0,
      status: undefined,
      canSubmit: false,
      canCancel: true,
    }),
    { submit: false, cancel: false },
  );
});

Deno.test("lifecycle : la fixture montre l'action correspondant au docstatus, à vide", () => {
  assertEquals(
    lifecycleVisibility({
      docstatus: 1,
      status: undefined,
      ...NO_CAPABILITY,
      preview: true,
    }),
    { submit: false, cancel: true },
  );
});

Deno.test("lifecycle : la confirmation Soumettre est en accent, Annuler en danger", () => {
  const calls: string[] = [];
  const submit = lifecycleConfirmRequest("submit", {
    doctype: "Supplier Quotation",
    name: "SQ-0001",
    translate: en,
    onConfirm: () => calls.push("submit"),
  });
  const cancel = lifecycleConfirmRequest("cancel", {
    doctype: "Supplier Quotation",
    name: "SQ-0001",
    translate: en,
    onConfirm: () => calls.push("cancel"),
  });
  assertEquals(confirmTone(submit), "accent");
  assertEquals(confirmTone(cancel), "danger");
  assertEquals(submit.key, "submit");
  assertEquals(cancel.key, "cancel");
  assertEquals(
    pendingConfirmText(submit, "title", en),
    "Submit this document?",
  );
  assertEquals(
    pendingConfirmText(cancel, "title", en),
    "Cancel this document?",
  );
  assertEquals(calls, []);
  confirmPending(submit).run?.();
  assertEquals(calls, ["submit"]);
});

Deno.test("lifecycle : la confirmation suit la locale et le montant d'une Purchase Invoice", () => {
  const submit = lifecycleConfirmRequest("submit", {
    doctype: "Supplier Quotation",
    name: "PINV-1",
    amount: "1 234,50 €",
    translate: en,
    onConfirm: () => {},
  });
  assertEquals(
    pendingConfirmText(submit, "actionLabel", en),
    "Submit 1 234,50 €",
  );
  assertEquals(
    pendingConfirmText(submit, "actionLabel", fr),
    "Soumettre 1 234,50 €",
  );
  const plain = lifecycleConfirmRequest("submit", {
    doctype: "Supplier Quotation",
    name: "PINV-1",
    amount: null,
    translate: en,
    onConfirm: () => {},
  });
  assertEquals(
    pendingConfirmText(plain, "actionLabel", fr),
    "Soumettre le document",
  );
});

Deno.test("lifecycle : une feuille dont l'action n'est plus offerte est périmée", () => {
  const submit = lifecycleConfirmRequest("submit", {
    doctype: "Supplier Quotation",
    name: "SQ-1",
    translate: en,
    onConfirm: () => {},
  });
  const cancel = lifecycleConfirmRequest("cancel", {
    doctype: "Supplier Quotation",
    name: "SQ-1",
    translate: en,
    onConfirm: () => {},
  });
  // Le docstatus passe à 1 pendant que « Soumettre ce document ? » est ouverte.
  assertEquals(
    lifecycleConfirmIsStale(submit, { submit: false, cancel: true }),
    true,
  );
  assertEquals(
    lifecycleConfirmIsStale(submit, { submit: true, cancel: false }),
    false,
  );
  assertEquals(
    lifecycleConfirmIsStale(cancel, { submit: true, cancel: false }),
    true,
  );
  assertEquals(
    lifecycleConfirmIsStale(cancel, { submit: false, cancel: true }),
    false,
  );
  // Rien d'ouvert, ou une confirmation étrangère (ex. Abandonner) : intacte.
  assertEquals(
    lifecycleConfirmIsStale(dismissConfirm(), { submit: false, cancel: false }),
    false,
  );
  assertEquals(
    lifecycleConfirmIsStale(
      { subject: "x", title: "", detail: "", actionLabel: "", onConfirm() {} },
      { submit: false, cancel: false },
    ),
    false,
  );
});

const CONFIRM_DOCUMENT = {
  modified: "2026-09-30 10:00:00.123456",
  grand_total: 100.5,
  disable_rounded_total: 1,
  currency: "EUR",
};

function documentSnapshot(
  document = CONFIRM_DOCUMENT,
  doctype = "Purchase Invoice",
  name = "PINV-1",
) {
  return lifecycleConfirmSnapshot(doctype, name, document);
}

function documentConfirmation(action: "submit" | "cancel" = "submit") {
  return lifecycleConfirmRequest(action, {
    doctype: "Purchase Invoice",
    name: "PINV-1",
    amount: "100.5 EUR",
    documentSnapshot: documentSnapshot(),
    translate: en,
    onConfirm: () => {},
  });
}

Deno.test("lifecycle : une relecture modifiée ferme Soumettre et Annuler même si l'action reste offerte", () => {
  const changedSnapshots = [
    documentSnapshot({ ...CONFIRM_DOCUMENT, modified: "2026-09-30 10:01:00" }),
    documentSnapshot({ ...CONFIRM_DOCUMENT, grand_total: 200.5 }),
    documentSnapshot({ ...CONFIRM_DOCUMENT, currency: "USD" }),
    documentSnapshot(CONFIRM_DOCUMENT, "Sales Invoice"),
    documentSnapshot(CONFIRM_DOCUMENT, "Purchase Invoice", "PINV-2"),
  ];
  for (const action of ["submit", "cancel"] as const) {
    const pending = documentConfirmation(action);
    for (const snapshot of changedSnapshots) {
      assertEquals(
        lifecycleConfirmIsStale(
          pending,
          { submit: true, cancel: true },
          snapshot,
        ),
        true,
        `${action} doit fermer une confirmation portant sur l'ancien état`,
      );
    }
    assertEquals(
      lifecycleConfirmIsStale(
        pending,
        { submit: true, cancel: true },
        documentSnapshot({ ...CONFIRM_DOCUMENT }),
      ),
      false,
    );
  }
});

Deno.test("lifecycle : le montant effectif arrondi est suivi même sans modified", () => {
  const document = {
    grand_total: 100.5,
    disable_rounded_total: 0,
    rounded_total: 101,
    rounding_adjustment: 0.5,
    currency: "EUR",
  };
  const snapshot = lifecycleConfirmSnapshot(
    "Purchase Invoice",
    "PINV-1",
    document,
  );
  const pending = { ...documentConfirmation(), documentSnapshot: snapshot };
  const changed = lifecycleConfirmSnapshot("Purchase Invoice", "PINV-1", {
    ...document,
    rounded_total: 102,
    rounding_adjustment: 1.5,
  });
  assertEquals(
    lifecycleConfirmIsStale(pending, { submit: true, cancel: false }, changed),
    true,
  );
  // Le total affiché devient indéterminé après une relecture incomplète.
  const incomplete = lifecycleConfirmSnapshot("Purchase Invoice", "PINV-1", {
    ...document,
    base_rounded_total: null,
  });
  assertEquals(
    lifecycleConfirmIsStale(
      pending,
      { submit: true, cancel: false },
      incomplete,
    ),
    true,
  );
});

Deno.test("lifecycle : une version absente puis connue, ou supprimée, invalide la demande", () => {
  const { modified: _modified, ...withoutVersion } = CONFIRM_DOCUMENT;
  const before = lifecycleConfirmSnapshot(
    "Purchase Invoice",
    "PINV-1",
    withoutVersion,
  );
  const after = documentSnapshot();
  for (const [requested, current] of [[before, after], [after, before]]) {
    const pending = { ...documentConfirmation(), documentSnapshot: requested };
    assertEquals(
      lifecycleConfirmIsStale(
        pending,
        { submit: true, cancel: false },
        current,
      ),
      true,
    );
  }
});

Deno.test("lifecycle : la locale seule traduit la feuille sans invalider son état ni exécuter l'action", () => {
  const calls: string[] = [];
  const pending = {
    ...documentConfirmation(),
    onConfirm: () => calls.push("submit"),
  };
  assertEquals(
    pendingConfirmText(pending, "title", en),
    "Submit this document?",
  );
  assertEquals(
    pendingConfirmText(pending, "title", fr),
    "Soumettre ce document ?",
  );
  assertEquals(
    lifecycleConfirmIsStale(
      pending,
      { submit: true, cancel: false },
      documentSnapshot({ ...CONFIRM_DOCUMENT }),
    ),
    false,
  );
  assertEquals(calls, []);
  // Fermer une demande périmée supprime le callback plutôt que de soumettre.
  const current = documentSnapshot({ ...CONFIRM_DOCUMENT, grand_total: 200 });
  const next =
    lifecycleConfirmIsStale(pending, { submit: true, cancel: false }, current)
      ? dismissConfirm()
      : pending;
  confirmPending(next).run?.();
  assertEquals(calls, []);
});

Deno.test("lifecycle : les confirmations étrangères et celles sans snapshot restent compatibles", () => {
  const unrelated = {
    ...documentConfirmation(),
    key: "discard",
  };
  const current = documentSnapshot({ ...CONFIRM_DOCUMENT, grand_total: 300 });
  assertEquals(
    lifecycleConfirmIsStale(
      unrelated,
      { submit: false, cancel: false },
      current,
    ),
    false,
  );
  const legacy = { ...documentConfirmation(), documentSnapshot: undefined };
  assertEquals(
    lifecycleConfirmIsStale(legacy, { submit: true, cancel: false }, current),
    false,
  );
});

Deno.test("lifecycle : succès et doute passent par la région live, un échec s'annonce (alert)", () => {
  assertEquals(lifecycleFeedbackRole("ok"), undefined);
  assertEquals(lifecycleFeedbackRole("warn"), undefined);
  assertEquals(lifecycleFeedbackRole("bad"), "alert");
  assertEquals(lifecycleFeedbackClass("ok"), "text-ok");
  assertEquals(lifecycleFeedbackClass("warn"), "text-warn");
  assertEquals(lifecycleFeedbackClass("bad"), "text-bad");
});

Deno.test("lifecycle : le texte d'erreur du serveur n'est jamais avalé, borné et sur une ligne", () => {
  const fallback = "Action failed";
  assertEquals(lifecycleErrorText(null, fallback), fallback);
  assertEquals(lifecycleErrorText("   \n ", fallback), fallback);
  assertEquals(
    lifecycleErrorText("Mandatory\nfield  missing: party", fallback),
    "Mandatory field missing: party",
  );
  const long = lifecycleErrorText("x".repeat(1000), fallback);
  assertEquals(long.length, 240);
  assert(long.endsWith("…"));
});

Deno.test("lifecycle : la plomberie du client Frappe est retirée du message", () => {
  const fallback = "Action failed";
  // Chaîne réelle de FrappeAPIError.message (src/api/frappe-client.ts).
  assertEquals(
    lifecycleErrorText(
      "[FrappeClient] POST /api/method/frappe.client.submit failed: Party is mandatory (HTTP 417)",
      fallback,
    ),
    "Party is mandatory",
  );
  assertEquals(
    lifecycleErrorText(
      "[FrappeClient] POST /api/method/frappe.client.cancel failed:\nCannot cancel: linked to Payment Entry PE-1 (HTTP 417)",
      fallback,
    ),
    "Cannot cancel: linked to Payment Entry PE-1",
  );
  // Plus rien d'exploitable après nettoyage : message traduit.
  assertEquals(
    lifecycleErrorText(
      "[FrappeClient] POST /api/method/frappe.client.submit failed: (HTTP 500)",
      fallback,
    ),
    fallback,
  );
  // Un texte sans plomberie n'est pas touché, parenthèses comprises.
  assertEquals(
    lifecycleErrorText("Stock is negative (item X)", fallback),
    "Stock is negative (item X)",
  );
  // Un JSON brut (structuredContent) n'est pas un message lisible.
  assertEquals(
    lifecycleErrorText('{"error":{"code":"x"}}', fallback),
    fallback,
  );
  assertEquals(lifecycleErrorText("[1, 2]", fallback), fallback);
  assertEquals(
    lifecycleErrorText("[Frappe] Not permitted", fallback),
    "[Frappe] Not permitted",
  );
});

Deno.test("lifecycle : une relecture ratée après succès est un doute, pas un échec", () => {
  assertEquals(lifecycleRefreshedFeedback(true, "Submitted", en), {
    tone: "ok",
    text: "Submitted",
  });
  assertEquals(lifecycleRefreshedFeedback(false, "Submitted", en), {
    tone: "warn",
    text: en("document.action.refresh_pending"),
  });
  assertEquals(
    lifecycleOutcomeFeedback({ refreshPending: true }, "Submitted", fr),
    { tone: "warn", text: fr("document.action.refresh_pending") },
  );
});

Deno.test("lifecycle : chaque issue d'action a son retour, l'erreur serveur remonte", () => {
  assertEquals(lifecycleOutcomeFeedback(true, "Submitted", en), {
    tone: "ok",
    text: "Submitted",
  });
  assertEquals(
    lifecycleOutcomeFeedback(
      { error: "Cannot submit: Party is mandatory" },
      "",
      en,
    ),
    { tone: "bad", text: "Cannot submit: Party is mandatory" },
  );
  // Refus sans texte (cible périmée, capacité absente) : message traduit.
  assertEquals(lifecycleOutcomeFeedback({ error: null }, "", en), {
    tone: "bad",
    text: "Action failed",
  });
  assertEquals(lifecycleOutcomeFeedback(false, "", fr), {
    tone: "bad",
    text: "Action échouée",
  });
  assertEquals(
    lifecycleOutcomeFeedback({ unconfirmed: true }, "", en).tone,
    "warn",
  );
  assertEquals(
    lifecycleOutcomeFeedback({ transport: true }, "", en).tone,
    "warn",
  );
});

Deno.test("les deux surfaces partagent LifecycleActions et n'ont plus de boutons propres", async () => {
  const docViewer = await Deno.readTextFile(
    new URL("../../doc-viewer/src/DocViewer.tsx", import.meta.url),
  );
  const inspector = await Deno.readTextFile(
    new URL("../doclist/InlineDetailPanel.tsx", import.meta.url),
  );
  for (
    const [name, source] of [["DocViewer", docViewer], [
      "InlineDetailPanel",
      inspector,
    ]]
  ) {
    assertStringIncludes(source, "<LifecycleActions", name);
    assertStringIncludes(source, "lifecycleConfirmRequest(", name);
    assertStringIncludes(source, "lifecycleConfirmIsStale(", name);
    assertStringIncludes(source, "lifecycleVisibility(", name);
    // Plus de bouton Soumettre / Annuler écrit à la main dans la surface.
    assertEquals(source.includes('t("common.submit")'), false, name);
    assertEquals(source.includes('t("common.cancel")'), false, name);
    assertEquals(source.includes("confirm.request({"), false, name);
  }
});

Deno.test("lifecycle : les trois surfaces capturent l'état montré et ferment les demandes périmées avant interaction", async () => {
  for (
    const path of [
      "../../doc-viewer/src/DocViewer.tsx",
      "../doclist/InlineDetailPanel.tsx",
      "../../invoice-viewer/src/InvoiceViewer.tsx",
    ]
  ) {
    const source = await Deno.readTextFile(new URL(path, import.meta.url));
    assert(
      /const confirmSnapshot = lifecycleConfirmSnapshot\([\s\S]*?(envelope\.document|\bdata)\s*,?\s*\);/
        .test(source),
      `${path} doit utiliser le document affiché`,
    );
    assertStringIncludes(source, "documentSnapshot: confirmSnapshot", path);
    assert(
      /useLayoutEffect\(\(\) => \{\s*if \(lifecycleConfirmIsStale\(confirm\.pending, lifecycle, confirmSnapshot\)\) \{\s*confirm\.dismiss\(\);/
        .test(source),
      `${path} doit fermer la demande avant interaction avec la fiche réactualisée`,
    );
    assertStringIncludes(source, "lifecycle.cancel, confirmSnapshot]", path);
    if (path.includes("invoice-viewer")) {
      assertEquals(
        source.match(/documentSnapshot: confirmSnapshot/g)?.length,
        2,
      );
      assertStringIncludes(source, 'key: "submit"', path);
      assertStringIncludes(source, 'key: "cancel"', path);
      assertStringIncludes(source, 'titleKey: "invoice.confirm.submit"', path);
      assertStringIncludes(source, 'titleKey: "invoice.confirm.cancel"', path);
    }
  }
});

Deno.test("LifecycleActions : variantes, titre, aria-busy et rôles vivent dans le composant", async () => {
  const source = await Deno.readTextFile(
    new URL("./LifecycleActions.tsx", import.meta.url),
  );
  assertStringIncludes(source, "variant={spec.variant}");
  assertStringIncludes(source, "class={LIFECYCLE_BUTTON_CLASS}");
  assertStringIncludes(source, "aria-busy={loading === action}");
  assertStringIncludes(source, "title={");
  assertStringIncludes(source, "role={role}");
  // Région live montée en permanence : le texte de succès y est injecté.
  assertStringIncludes(source, 'aria-live="polite"');
  // Les deux boutons se bloquent mutuellement pendant l'appel.
  assertStringIncludes(source, "disabled={preview || loading !== null}");
});

Deno.test("l'inspecteur remonte le texte d'erreur du serveur au lieu de l'avaler", async () => {
  const body = await Deno.readTextFile(
    new URL("../doclist/DoclistBody.tsx", import.meta.url),
  );
  assertStringIncludes(
    body,
    "return { error: extractToolResultText(result) ?? null };",
  );
  assertEquals(body.includes("if (result.isError) return false;"), false);
  // Timeout / échec d'hôte et catch externe : le texte remonte aussi.
  assertEquals(
    body.split(
      "return { error: cause instanceof Error ? cause.message : null };",
    )
      .length - 1,
    2,
  );
  // Mutation réussie mais relecture ratée : doute, jamais « Action failed ».
  assertStringIncludes(body, "{ refreshPending: true }");
});

Deno.test("lifecycle : l'eyebrow de la confirmation est « DOCTYPE NOM », le même partout", async () => {
  const request = lifecycleConfirmRequest("submit", {
    doctype: "Supplier Quotation",
    name: "PUR-SQTN-2026-00008",
    translate: en,
    onConfirm: () => {},
  });
  assertEquals(request.subject, "Supplier Quotation PUR-SQTN-2026-00008");
  assertEquals(
    request.subject,
    lifecycleConfirmSubject("Supplier Quotation", "PUR-SQTN-2026-00008"),
  );
  // Aucune surface ne compose sa propre variante : elles passent doctype + nom.
  for (
    const path of [
      "../../doc-viewer/src/DocViewer.tsx",
      "../doclist/InlineDetailPanel.tsx",
    ]
  ) {
    const source = await Deno.readTextFile(new URL(path, import.meta.url));
    assertEquals(/\bsubject:/.test(source), false, path);
    assertStringIncludes(source, "doctype: envelope.doctype", path);
  }
  // Le viewer facture (confirmation propre) passe par le même helper.
  const invoice = await Deno.readTextFile(
    new URL("../../invoice-viewer/src/InvoiceViewer.tsx", import.meta.url),
  );
  assertEquals(invoice.includes("subject: data.name"), false);
  assertStringIncludes(invoice, "lifecycleConfirmSubject(doctype, data.name)");
});
