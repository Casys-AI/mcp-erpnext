/**
 * Logique pure de navigation pour invoice-viewer.
 * Pas d'import Preact — testable dans Deno directement.
 *
 * Extrait depuis les `_sendMessageHints` du serveur les deux sauts utiles à la
 * vue : le saut vers la liste des paiements (key "payments") et le saut vers la
 * fiche du tiers (key "customer" ou "supplier"). Renvoie null quand un hint est
 * absent ou n'a pas d'outil associé (= question seule, chemin de secours).
 */
import type { Jump, NavHint } from "../../shared/jumps.ts";
import { jumpFromHint } from "../../shared/jumps.ts";
import type { DocumentChangeEvent } from "../../shared/document-events.ts";
import { hasAvailableTool } from "../../shared/viewer-tools.ts";

export interface InvoiceJumps {
  payments: Jump | null;
  party: Jump | null;
}

export interface InvoiceMutationAction {
  toolName: string;
  args: Record<string, unknown>;
}

export interface InvoiceMutationActions {
  submit: InvoiceMutationAction | null;
  cancel: InvoiceMutationAction | null;
}

export type InvoiceMutationLifecycleEvent =
  | "mutation-committed"
  | "canonical-hydrated";

export type InvoiceRootMutation = "submit" | "cancel";

export function invoiceRootDocumentChange(
  doctype: string,
  name: string,
  mutation: InvoiceRootMutation,
  committedAt: string,
): DocumentChangeEvent {
  return {
    doctype,
    name,
    mutation,
    committedAt,
    source: "invoice-viewer",
  };
}

/**
 * Une mutation réussie verrouille l'ancien docstatus. Seule l'hydratation
 * canonique suivante lève ce verrou ; un read-back en erreur ne produit aucun
 * événement et laisse donc les actions masquées.
 */
export function nextInvoiceMutationCommitted(
  _current: boolean,
  event: InvoiceMutationLifecycleEvent,
): boolean {
  return event === "mutation-committed";
}

const SUBMITTABLE_INVOICE_VIEWER_DOCTYPES = new Set([
  "Quotation",
  "Sales Order",
  "Delivery Note",
  "Sales Invoice",
  "Purchase Order",
  "Purchase Receipt",
  "Purchase Invoice",
  "Stock Entry",
  "Journal Entry",
  "Payment Entry",
  "Timesheet",
  "Leave Application",
  "Salary Slip",
  "BOM",
  "Work Order",
  "Job Card",
  "Asset",
  "Asset Movement",
  "Shipment",
]);

const DEDICATED_MUTATIONS: Record<
  string,
  { submit?: string; cancel?: string }
> = {
  "Sales Order": {
    submit: "erpnext_sales_order_submit",
    cancel: "erpnext_sales_order_cancel",
  },
  "Sales Invoice": { submit: "erpnext_sales_invoice_submit" },
};

/**
 * Résout les mutations réellement enregistrées dans ce serveur.
 * Un outil dédié exact prime ; le générique ne sert qu'aux DocTypes
 * explicitement connus comme submittables.
 */
export function invoiceMutationActions(
  doctype: string,
  name: string,
  availableTools: readonly string[] | undefined,
  mutationCommitted = false,
): InvoiceMutationActions {
  if (
    mutationCommitted || !SUBMITTABLE_INVOICE_VIEWER_DOCTYPES.has(doctype)
  ) {
    return { submit: null, cancel: null };
  }

  const dedicated = DEDICATED_MUTATIONS[doctype];
  const submit = dedicated?.submit &&
      hasAvailableTool(availableTools, dedicated.submit)
    ? {
      toolName: dedicated.submit,
      args: { name },
    }
    : hasAvailableTool(availableTools, "erpnext_doc_submit")
    ? {
      toolName: "erpnext_doc_submit",
      args: { doctype, name },
    }
    : null;
  const cancel = dedicated?.cancel &&
      hasAvailableTool(availableTools, dedicated.cancel)
    ? {
      toolName: dedicated.cancel,
      args: { name },
    }
    : hasAvailableTool(availableTools, "erpnext_doc_cancel")
    ? {
      toolName: "erpnext_doc_cancel",
      args: { doctype, name },
    }
    : null;
  return { submit, cancel };
}

/** Un bouton existe s'il peut naviguer, parler, ou documenter la fixture. */
export function canOfferNavigation(
  jump: Jump | null,
  messagesEnabled: boolean,
  fixture: boolean,
): boolean {
  return jump !== null || messagesEnabled || fixture;
}

/**
 * Construit les sauts paiements + tiers depuis la liste de hints serveur.
 *
 * @param hints    `_sendMessageHints` du payload ; null/vide → { null, null }.
 * @param vars     Variables à substituer : { id, doctype, party }.
 * @param subtitle Note de pied du niveau ouvert, ex. « liée à SINV-1 ».
 * @param availableTools Outils exacts annoncés par ce même payload.
 */
export function invoiceJumps(
  hints: NavHint[] | null | undefined,
  vars: Record<string, string>,
  subtitle: string,
  availableTools: readonly string[] | undefined,
): InvoiceJumps {
  if (!hints?.length) return { payments: null, party: null };
  const paymentsHint = hints.find((hint) =>
    hint.key === "payments" &&
    hint.tool !== undefined &&
    hasAvailableTool(availableTools, hint.tool)
  ) ?? null;
  const partyHint =
    hints.find((hint) =>
      (hint.key === "customer" || hint.key === "supplier") &&
      hint.tool !== undefined &&
      hasAvailableTool(availableTools, hint.tool)
    ) ?? null;
  return {
    payments: paymentsHint ? jumpFromHint(paymentsHint, vars, subtitle) : null,
    party: partyHint ? jumpFromHint(partyHint, vars, subtitle) : null,
  };
}
