/**
 * Soumettre / Annuler un document : la règle, sans Preact.
 *
 * Le doc-viewer et l'inspecteur inline des listes affichent les mêmes deux
 * actions. Tout ce qui doit rester identique entre eux vit ici — variante de
 * bouton, libellés, cible tactile, visibilité, texte de confirmation, forme du
 * retour — et `LifecycleActions.tsx` n'est que le rendu. Testé seul
 * (`lifecycle-actions_test.ts`).
 *
 * Aucune liste de DocTypes ici : le serveur décide (`_availableTools`, voir
 * `SUBMITTABLE_VIEWER_DOCTYPES` dans src/tools/ui-refresh.ts) et les surfaces
 * ne passent que des capacités déjà résolues.
 */

import type { ConfirmSnapshot, PendingConfirm } from "../confirm-state.ts";
import type { t as Translate } from "../i18n.ts";
import {
  type InvoiceSubmitSource,
  purchaseInvoiceGrossTotal,
} from "./purchase-invoice.ts";

export type LifecycleAction = "submit" | "cancel";

export interface LifecycleActionSpec {
  /** Soumettre est constructif (accent), annuler est destructif (danger). */
  variant: "accent" | "danger";
  /** Libellé explicite : « Submit document » / « Cancel document ». */
  labelKey: string;
  /** Infobulle, identique au libellé : l'action est nommée sans ambiguïté. */
  titleKey: string;
  /** Couleur du bouton de confirmation dans la feuille. */
  tone: "accent" | "danger";
}

export const LIFECYCLE_ACTIONS: Record<LifecycleAction, LifecycleActionSpec> = {
  submit: {
    variant: "accent",
    labelKey: "doclist.detail.action.submit_title",
    titleKey: "doclist.detail.action.submit_title",
    tone: "accent",
  },
  cancel: {
    variant: "danger",
    labelKey: "doclist.detail.action.cancel_label",
    titleKey: "doclist.detail.action.cancel_label",
    tone: "danger",
  },
};

/** Cible tactile ≥ 44 px, pleine largeur de la colonne d'actions. */
export const LIFECYCLE_BUTTON_CLASS =
  "min-h-[44px] w-full rounded-control text-body";

export interface LifecycleVisibilityInput {
  docstatus: number | undefined;
  status: string | undefined;
  /** Capacité déjà résolue par la surface (outil serveur, refresh, verrou). */
  canSubmit: boolean;
  canCancel: boolean;
  /** Fixture sans hôte : les boutons se montrent, désactivés. */
  preview?: boolean;
}

/** Soumettre pour un brouillon, annuler pour un document soumis, jamais les deux. */
export function lifecycleVisibility(
  input: LifecycleVisibilityInput,
): Record<LifecycleAction, boolean> {
  const draft = input.status === "Draft" || input.docstatus === 0;
  const submitted = input.docstatus === 1;
  return {
    submit: draft && (Boolean(input.preview) || input.canSubmit),
    cancel: submitted && (Boolean(input.preview) || input.canCancel),
  };
}

/**
 * L'eyebrow de la feuille de confirmation : « DOCTYPE NOM » (le libellé mono
 * de la charte le met en capitales). Une seule forme pour toutes les surfaces :
 * le nom seul (« PUR-SQTN-2026-00008 ») ne dit pas sur quoi porte l'action
 * quand plusieurs DocTypes cohabitent dans une liste.
 */
export function lifecycleConfirmSubject(doctype: string, name: string): string {
  return `${doctype} ${name}`;
}

/** État affiché seulement : aucune protection contre une modification non relue. */
export function lifecycleConfirmSnapshot(
  doctype: string,
  name: string,
  document: InvoiceSubmitSource,
): string {
  const total = purchaseInvoiceGrossTotal(doctype, document);
  return JSON.stringify([
    doctype,
    name,
    typeof document.modified === "string" ? document.modified : null,
    total?.amount ?? null,
    typeof document.currency === "string" ? document.currency : null,
  ]);
}

export interface LifecycleConfirmInput {
  /**
   * Le document visé. Deux champs plutôt qu'une chaîne toute faite : la
   * surface ne peut plus composer sa propre variante de l'eyebrow.
   */
  doctype: string;
  name: string;
  /** Montant à confirmer (Purchase Invoice), sinon le texte générique. */
  amount?: string | null;
  documentSnapshot?: string;
  translate: typeof Translate;
  onConfirm: () => void;
}

/**
 * La demande de confirmation d'une action : mêmes textes dans les deux
 * surfaces. Les clés suivent la locale même si la feuille reste ouverte.
 */
export function lifecycleConfirmRequest(
  action: LifecycleAction,
  input: LifecycleConfirmInput,
): PendingConfirm {
  const { translate, amount } = input;
  const spec = LIFECYCLE_ACTIONS[action];
  const params = amount ? { amount } : undefined;
  const keys = action === "submit"
    ? {
      title: "doclist.confirm.submit",
      detail: amount
        ? "doclist.confirm.submit.detail_with_amount"
        : "doclist.confirm.submit.detail",
      actionLabel: amount
        ? "doclist.confirm.submit.action_with_amount"
        : "doclist.confirm.submit.action",
    }
    : {
      title: "doclist.confirm.cancel",
      detail: "doclist.confirm.cancel.detail",
      actionLabel: "doclist.confirm.cancel.action",
    };
  return {
    subject: lifecycleConfirmSubject(input.doctype, input.name),
    title: translate(keys.title, params),
    titleKey: keys.title,
    detail: translate(keys.detail, params),
    detailKey: keys.detail,
    actionLabel: translate(keys.actionLabel, params),
    actionLabelKey: keys.actionLabel,
    params,
    tone: spec.tone,
    key: action,
    documentSnapshot: input.documentSnapshot,
    onConfirm: input.onConfirm,
  };
}

/**
 * Une feuille ouverte pour Soumettre / Annuler n'a plus de sens quand
 * l'action n'est plus offerte ou le document affiché a changé depuis la
 * demande (identité, modified, montant ou devise), même s'il reste brouillon.
 */
export function lifecycleConfirmIsStale(
  pending: ConfirmSnapshot,
  available: Record<LifecycleAction, boolean>,
  currentDocumentSnapshot?: string,
): boolean {
  if (!pending) return false;
  const key = pending.key;
  if (key !== "submit" && key !== "cancel") return false;
  return !available[key] ||
    (pending.documentSnapshot !== undefined &&
      currentDocumentSnapshot !== undefined &&
      pending.documentSnapshot !== currentDocumentSnapshot);
}

export type LifecycleFeedbackTone = "ok" | "warn" | "bad";

/** Le résultat d'une action, sous les boutons : succès, doute ou échec. */
export interface LifecycleFeedback {
  tone: LifecycleFeedbackTone;
  text: string;
}

/**
 * Un échec s'annonce (`role="alert"`, monté avec son texte : fiable). Un succès
 * ou un doute se lit via la région `aria-live="polite"` toujours présente du
 * composant : le texte y est injecté, il n'a pas de rôle propre.
 */
export function lifecycleFeedbackRole(
  tone: LifecycleFeedbackTone,
): "alert" | undefined {
  return tone === "bad" ? "alert" : undefined;
}

export function lifecycleFeedbackClass(tone: LifecycleFeedbackTone): string {
  return tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : "text-bad";
}

/**
 * Issue d'une action d'inspecteur : `true` = fait et relu ; `unconfirmed` /
 * `transport` = le serveur n'a pas confirmé (Purchase Invoice) ; `error` = le
 * serveur a refusé, avec son texte quand il en a un ; `refreshPending` = fait
 * mais la relecture a échoué (le document affiché est périmé) ; `false` = refus local
 * (capacité, cible périmée) sans texte à montrer.
 */
export type LifecycleOutcome =
  | boolean
  | { unconfirmed: true }
  | { transport: true }
  | { refreshPending: true }
  | { error: string | null };

/** Le retour affiché sous les boutons pour une issue d'action. */
export function lifecycleOutcomeFeedback(
  outcome: LifecycleOutcome,
  okText: string,
  translate: typeof Translate,
): LifecycleFeedback {
  if (outcome === true) return { tone: "ok", text: okText };
  if (typeof outcome === "object") {
    if ("unconfirmed" in outcome) {
      return {
        tone: "warn",
        text: translate("document.purchase_invoice.submit.unconfirmed"),
      };
    }
    if ("transport" in outcome) {
      return {
        tone: "warn",
        text: translate("document.purchase_invoice.submit.transport"),
      };
    }
    if ("refreshPending" in outcome) {
      return {
        tone: "warn",
        text: translate("document.action.refresh_pending"),
      };
    }
    return {
      tone: "bad",
      text: lifecycleErrorText(
        outcome.error,
        translate("doclist.detail.action_failed"),
      ),
    };
  }
  return { tone: "bad", text: translate("doclist.detail.action_failed") };
}

/**
 * Retour d'un succès selon la relecture : « fait » si le document a été relu,
 * « enregistré, rafraîchissement en attente » sinon (ton `warn`, jamais un
 * faux succès ni un échec : la mutation, elle, a réussi).
 */
export function lifecycleRefreshedFeedback(
  refreshed: boolean,
  okText: string,
  translate: typeof Translate,
): LifecycleFeedback {
  return refreshed
    ? { tone: "ok", text: okText }
    : { tone: "warn", text: translate("document.action.refresh_pending") };
}

const MAX_ERROR_LENGTH = 240;
/** `[FrappeClient] POST /api/method/frappe.client.submit failed: ` */
const TRANSPORT_PREFIX = /^\[FrappeClient\]\s+[A-Z]+\s+\S+\s+failed:\s*/;
/** ` (HTTP 417)` */
const HTTP_STATUS_SUFFIX = /\s*\(HTTP \d+\)$/;

/** Un objet ou tableau JSON brut (structuredContent) n'est pas un message. */
function isRawJson(text: string): boolean {
  if (text[0] !== "{" && text[0] !== "[") return false;
  try {
    return typeof JSON.parse(text) === "object";
  } catch {
    return false;
  }
}

/**
 * Le message d'échec montré à l'utilisateur : le texte du serveur quand il
 * existe (jamais avalé), débarrassé de la plomberie du client (`[FrappeClient]
 * POST /api/... failed:` et `(HTTP 417)`), sur une ligne et borné ; le message
 * traduit quand il ne reste rien d'exploitable (vide, ou JSON brut).
 */
export function lifecycleErrorText(
  raw: string | null | undefined,
  fallback: string,
): string {
  const text = (raw ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(TRANSPORT_PREFIX, "")
    .replace(HTTP_STATUS_SUFFIX, "")
    .trim();
  if (!text || isRawJson(text)) return fallback;
  return text.length > MAX_ERROR_LENGTH
    ? `${text.slice(0, MAX_ERROR_LENGTH - 1)}…`
    : text;
}
