/**
 * Arbitre entre clic simple et double-clic.
 *
 * Le navigateur envoie deux `click` avant `dblclick`. Le clic simple attend
 * donc une courte confirmation ; le double-clic annule seulement le clic en
 * attente de la même cible. Les autres cibles restent indépendantes.
 */

export const CLICK_INTENT_DELAY_MS = 320;

export interface ClickIntentRevert {
  /** `false` indique que la compensation distante n'a pas été confirmée. */
  (): boolean | void | Promise<boolean | void>;
  /** Libère l'historique dès que ce clic ne peut plus devenir un double-clic. */
  release?: () => void;
}
export type ClickIntentSingleResult =
  | void
  | ClickIntentRevert
  | Promise<void | ClickIntentRevert>;

export interface ClickIntent {
  /** Identité stable de la ligne, barre ou point concerné. */
  key: string;
  /** Action du clic simple confirmé, typiquement l'ajout au contexte. */
  onSingle: () => ClickIntentSingleResult;
  /** Action exclusive du double-clic, typiquement le drilldown. */
  onDouble: () => void;
}

export interface ClickIntentKeyEvent {
  key: string;
  repeat?: boolean;
  preventDefault(): void;
}

export type ClickIntentSchedule = (
  run: () => void,
  delayMs: number,
) => () => void;

export interface ClickIntentArbiter {
  /** Attend la confirmation qu'aucun double-clic ne suit. */
  click(intent: ClickIntent, clickCount?: number): void;
  /** Annule le simple de cette cible et exécute uniquement le double. */
  doubleClick(intent: ClickIntent): void;
  /** Espace exécute le simple ; Entrée exécute le double, sans attente. */
  keyDown(intent: ClickIntent, event: ClickIntentKeyEvent): void;
  /** Annule le clic simple en attente d'une cible. */
  cancel(key: string): void;
  /** Annule tous les clics en attente, notamment lors du démontage. */
  cancelAll(): void;
}

interface PendingClick {
  cancelTimer: () => void;
}

function scheduleTimeout(run: () => void, delayMs: number): () => void {
  const timer = setTimeout(run, delayMs);
  return () => clearTimeout(timer);
}

export function createClickIntentArbiter(
  schedule: ClickIntentSchedule = scheduleTimeout,
): ClickIntentArbiter {
  const pending = new Map<string, PendingClick>();
  // Le seuil natif du double-clic appartient au système et peut dépasser
  // notre délai. On garde donc de quoi annuler un simple déjà confirmé
  // si le second `click` porte malgré tout `detail >= 2`.
  const committedSingles = new Map<
    string,
    Promise<ClickIntentRevert | null>
  >();
  const pendingReverts = new Map<string, Promise<boolean>>();
  const delayedDoubles = new Map<string, object>();

  function startSingle(intent: ClickIntent): Promise<ClickIntentRevert | null> {
    try {
      return Promise.resolve(intent.onSingle()).then(
        (revert) => typeof revert === "function" ? revert : null,
        () => null,
      );
    } catch {
      return Promise.resolve(null);
    }
  }

  function startRevert(
    committed: Promise<ClickIntentRevert | null>,
  ): Promise<boolean> {
    return committed.then(async (revert) => {
      try {
        return (await revert?.()) !== false;
      } catch {
        return false;
      } finally {
        revert?.release?.();
      }
    }, () => false);
  }

  function releaseCommitted(
    committed: Promise<ClickIntentRevert | null>,
  ) {
    void committed.then((revert) => revert?.release?.(), () => {});
  }

  function releaseAllCommitted() {
    for (const committed of committedSingles.values()) {
      releaseCommitted(committed);
    }
    committedSingles.clear();
  }

  function cancelTimer(key: string) {
    const current = pending.get(key);
    if (!current) return;
    pending.delete(key);
    current.cancelTimer();
  }

  function cancel(key: string) {
    cancelTimer(key);
    const committed = committedSingles.get(key);
    committedSingles.delete(key);
    if (committed) releaseCommitted(committed);
    pendingReverts.delete(key);
    delayedDoubles.delete(key);
  }

  function cancelAll() {
    const current = [...pending.values()];
    pending.clear();
    releaseAllCommitted();
    pendingReverts.clear();
    delayedDoubles.clear();
    for (const click of current) click.cancelTimer();
  }

  function runSingle(intent: ClickIntent, reversible: boolean) {
    cancel(intent.key);
    const committed = startSingle(intent);
    if (reversible) {
      committedSingles.set(intent.key, committed);
    } else {
      releaseCommitted(committed);
    }
  }

  function runDouble(intent: ClickIntent) {
    // Plusieurs `dblclick` peuvent être émis pendant une séquence rapide de
    // quatre clics. Tant que la compensation distante du premier est en vol,
    // aucun suivant ne doit contourner son résultat et ouvrir le détail.
    if (delayedDoubles.has(intent.key)) return;
    cancelTimer(intent.key);
    const committed = committedSingles.get(intent.key);
    committedSingles.delete(intent.key);
    const pendingRevert = pendingReverts.get(intent.key) ??
      (committed ? startRevert(committed) : null);
    pendingReverts.delete(intent.key);
    if (pendingRevert) {
      const token = {};
      delayedDoubles.set(intent.key, token);
      void pendingRevert.then((restored) => {
        if (delayedDoubles.get(intent.key) !== token) return;
        delayedDoubles.delete(intent.key);
        // Ne jamais superposer détail et contexte : si le host n'a pas
        // confirmé la compensation du clic simple tardif, le détail reste
        // fermé et l'état d'échec du contexte demeure visible.
        if (!restored) return;
        intent.onDouble();
      });
    } else {
      delayedDoubles.delete(intent.key);
      intent.onDouble();
    }
  }

  return {
    click(intent, clickCount = 1) {
      if (clickCount >= 2) {
        if (pending.has(intent.key)) {
          // Le second clic est arrivé à temps : couper immédiatement le
          // simple, le `dblclick` qui suit exécutera seul le drilldown.
          cancelTimer(intent.key);
        } else {
          // Le système a reconnu un double-clic après notre confirmation :
          // retirer l'effet du simple avant que `dblclick` exécute le détail.
          const committed = committedSingles.get(intent.key);
          committedSingles.delete(intent.key);
          if (committed) {
            pendingReverts.set(intent.key, startRevert(committed));
          }
        }
        return;
      }

      // Un nouveau premier clic ne peut plus appartenir à la séquence
      // précédente. Les compensations devenues inutiles sont oubliées.
      releaseAllCommitted();
      pendingReverts.clear();
      cancel(intent.key);

      // Enregistrer avant de programmer rend aussi l'arbitre sûr face à un
      // ordonnanceur de test synchrone.
      const current: PendingClick = { cancelTimer: () => {} };
      pending.set(intent.key, current);
      current.cancelTimer = schedule(() => {
        if (pending.get(intent.key) !== current) return;
        pending.delete(intent.key);
        committedSingles.set(intent.key, startSingle(intent));
      }, CLICK_INTENT_DELAY_MS);
    },
    doubleClick: runDouble,
    keyDown(intent, event) {
      if (event.repeat) return;
      if (event.key === " ") {
        event.preventDefault();
        // Espace et Entrée sont deux commandes explicites, pas une séquence
        // de clics à arbitrer : une Entrée ultérieure ne retire pas Espace.
        runSingle(intent, false);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        // Entrée est une commande explicite : elle annule seulement un clic
        // encore en attente, jamais un contexte déjà confirmé.
        cancel(intent.key);
        intent.onDouble();
      }
    },
    cancel,
    cancelAll,
  };
}
