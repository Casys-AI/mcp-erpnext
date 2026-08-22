/**
 * Une action irréversible se confirme dans une feuille, pas sur un bouton.
 *
 * Le parent tient l'état : `useConfirm()` donne `request(...)` à poser sur
 * le bouton, et `<ConfirmSheet>` rend la feuille de détail de la charte, ses
 * slots dans leur rôle : l'identifiant du document dans l'eyebrow (mono,
 * comme l'inspecteur), la question courte en titre, l'alerte « action
 * irréversible » en badge dans le corps avec la phrase de conséquence, puis
 * « Retour » et le verbe de l'action en danger. Échap et le voile referment.
 * La mécanique est dans `confirm-state.ts`, testée seule.
 */

import { useState } from "preact/hooks";
import {
  confirmPending,
  type ConfirmSnapshot,
  dismissConfirm,
  type PendingConfirm,
  requestConfirm,
} from "./confirm-state";
import { useT } from "./i18n-hook";
import { Button, DetailSheet, SheetActions } from "./ui";

export type { PendingConfirm };

export interface ConfirmState {
  pending: ConfirmSnapshot;
  request: (pending: PendingConfirm) => void;
  dismiss: () => void;
  confirm: () => void;
}

export function useConfirm(): ConfirmState {
  const [pending, setPending] = useState<ConfirmSnapshot>(null);
  return {
    pending,
    request: (next) => setPending((current) => requestConfirm(current, next)),
    dismiss: () => setPending(dismissConfirm()),
    confirm: () => {
      const { next, run } = confirmPending(pending);
      setPending(next);
      run?.();
    },
  };
}

export function ConfirmSheet({ confirm }: { confirm: ConfirmState }) {
  const t = useT();
  const pending = confirm.pending;
  if (!pending) return null;
  return (
    <DetailSheet
      eyebrow={pending.subject}
      title={pending.title}
      onClose={confirm.dismiss}
      footer={
        <SheetActions>
          <Button variant="quiet" onClick={confirm.dismiss}>
            {t("common.back")}
          </Button>
          <Button variant="danger" class="ml-auto" onClick={confirm.confirm}>
            {pending.actionLabel}
          </Button>
        </SheetActions>
      }
    >
      <div class="flex flex-col gap-3">
        <span class="self-start rounded-badge border border-bad/20 bg-bad/10 px-[7px] py-0.5 font-mono text-chip uppercase tracking-label text-bad">
          {t("confirm.eyebrow")}
        </span>
        <p class="font-sans text-body text-ink">{pending.detail}</p>
      </div>
    </DetailSheet>
  );
}
