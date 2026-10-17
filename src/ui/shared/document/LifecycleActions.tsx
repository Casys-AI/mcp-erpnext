/** @jsxImportSource preact */
/**
 * Soumettre / Annuler un document — le rendu commun du doc-viewer et de
 * l'inspecteur inline des listes.
 *
 * Deux boutons pleine largeur (cible tactile ≥ 44 px) : Soumettre en accent,
 * Annuler en danger, libellés explicites (« Submit document » / « Cancel
 * document ») repris en infobulle. Le clic ne fait que demander : la surface
 * ouvre la ConfirmSheet et porte la mutation. Pendant l'appel, le bouton actif
 * est `aria-busy` et l'autre désactivé ; le résultat s'affiche au-dessus (région
 * `aria-live="polite"` toujours montée pour un succès ou un doute,
 * `role="alert"` pour un échec).
 *
 * Les règles (variante, visibilité, textes) sont dans `lifecycle-actions.ts`.
 */

import { useT } from "../i18n-hook";
import { Button, cx } from "../ui";
import {
  LIFECYCLE_ACTIONS,
  LIFECYCLE_BUTTON_CLASS,
  type LifecycleAction,
  type LifecycleFeedback,
  lifecycleFeedbackClass,
  lifecycleFeedbackRole,
} from "./lifecycle-actions.ts";

export interface LifecycleActionsProps {
  /** Actions à montrer, déjà filtrées par docstatus et capacités. */
  show: Record<LifecycleAction, boolean>;
  /** Action en cours d'exécution, `null` au repos. */
  loading: LifecycleAction | null;
  /** Fixture sans hôte : boutons visibles mais inertes. */
  preview?: boolean;
  feedback?: LifecycleFeedback | null;
  onRequest: (action: LifecycleAction) => void;
}

function LifecycleButton({
  action,
  loading,
  preview,
  onRequest,
}: {
  action: LifecycleAction;
  loading: LifecycleAction | null;
  preview: boolean;
  onRequest: (action: LifecycleAction) => void;
}) {
  const t = useT();
  const spec = LIFECYCLE_ACTIONS[action];
  const label = t(spec.labelKey);
  return (
    <Button
      variant={spec.variant}
      class={LIFECYCLE_BUTTON_CLASS}
      disabled={preview || loading !== null}
      aria-busy={loading === action}
      aria-label={label}
      title={preview ? t("doclist.preview.no_host") : t(spec.titleKey)}
      onClick={() => onRequest(action)}
    >
      {loading === action ? "…" : label}
    </Button>
  );
}

export function LifecycleActions(
  { show, loading, preview = false, feedback, onRequest }:
    LifecycleActionsProps,
) {
  if (!show.submit && !show.cancel && !feedback) return null;
  const role = feedback ? lifecycleFeedbackRole(feedback.tone) : undefined;
  return (
    <div class="flex flex-col">
      {
        /* Région live toujours montée : le texte y est injecté, ce que les
          lecteurs d'écran annoncent de façon fiable (succès et doute). */
      }
      <div aria-live="polite" aria-atomic="true">
        {feedback && !role && (
          <p
            class={cx(
              "pb-2 font-mono text-chip",
              lifecycleFeedbackClass(feedback.tone),
            )}
          >
            {feedback.text}
          </p>
        )}
      </div>
      {feedback && role && (
        <p
          role={role}
          class={cx(
            "pb-2 font-mono text-chip",
            lifecycleFeedbackClass(feedback.tone),
          )}
        >
          {feedback.text}
        </p>
      )}
      <div class="flex flex-col gap-2">
        {show.submit && (
          <LifecycleButton
            action="submit"
            loading={loading}
            preview={preview}
            onRequest={onRequest}
          />
        )}
        {show.cancel && (
          <LifecycleButton
            action="cancel"
            loading={loading}
            preview={preview}
            onRequest={onRequest}
          />
        )}
      </div>
    </div>
  );
}
