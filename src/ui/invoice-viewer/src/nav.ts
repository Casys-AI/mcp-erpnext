/**
 * Logique pure de navigation pour invoice-viewer.
 * Pas d'import Preact — testable dans Deno directement.
 *
 * Transforme les `_sendMessageHints` canoniques du serveur en actions racine.
 * La même action devient un saut interne quand l'hôte relaie les outils, ou une
 * question équivalente quand seule la conversation est disponible.
 */
import type { Jump, NavHint } from "../../shared/jumps.ts";
import {
  fillTemplate,
  hasUnfilledTemplate,
  hintLabel,
  jumpFromHint,
} from "../../shared/jumps.ts";
import type { DocumentChangeEvent } from "../../shared/document-events.ts";
import { hasAvailableTool } from "../../shared/viewer-tools.ts";

export interface InvoiceRootNavigationAction {
  key: string;
  label: string;
  jump: Jump | null;
  /** Même destination exprimée pour un hôte conversationnel sans proxy. */
  message: string | null;
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
 * Un outil dédié exact prime, puis le générique.
 *
 * Aucune liste de DocTypes ici : le serveur est la seule source de vérité
 * (`SUBMITTABLE_VIEWER_DOCTYPES`, src/tools/ui-refresh.ts) et ne publie
 * `erpnext_doc_submit` / `erpnext_doc_cancel` dans `_availableTools` que pour
 * un DocType soumettable. Le manifeste absent (payload 3.0.x) reste toléré par
 * `hasAvailableTool`, comme avant ; sans proxy `serverTools`, l'appelant passe
 * `[]` et rien n'est proposé.
 */
export function invoiceMutationActions(
  doctype: string,
  name: string,
  availableTools: readonly string[] | undefined,
  mutationCommitted = false,
): InvoiceMutationActions {
  if (mutationCommitted) return { submit: null, cancel: null };

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

const LINE_ITEM_HINT_KEYS = new Set(["item", "stock"]);

/**
 * Tous les raccourcis de la pièce, indépendamment de sa présentation.
 * `item` et `stock` restent réservés au détail de ligne. Un outil absent peut
 * encore conserver sa phrase de repli, mais aucun gabarit incomplet ne sort.
 */
export function invoiceRootNavigationActions(
  hints: NavHint[] | null | undefined,
  vars: Record<string, string>,
  subtitle: string,
  availableTools: readonly string[] | undefined,
  jumpsEnabled: boolean,
): InvoiceRootNavigationAction[] {
  if (!hints?.length) return [];
  const seen = new Set<string>();
  const filledVars = Object.fromEntries(
    Object.entries(vars).filter(([, value]) => value !== ""),
  );
  return hints.flatMap((hint, index): InvoiceRootNavigationAction[] => {
    const key = hint.key?.trim() || `related-${index}`;
    if (LINE_ITEM_HINT_KEYS.has(key) || seen.has(key)) return [];

    const jump = jumpsEnabled && hint.tool &&
        hasAvailableTool(availableTools, hint.tool)
      ? jumpFromHint(hint, filledVars, subtitle)
      : null;
    const filledMessage = hint.message
      ? fillTemplate(hint.message, filledVars)
      : null;
    const message = filledMessage && !hasUnfilledTemplate(filledMessage)
      ? filledMessage
      : null;
    if (!jump && !message) return [];

    seen.add(key);
    return [{ key, label: jump?.label ?? hintLabel(hint), jump, message }];
  });
}
