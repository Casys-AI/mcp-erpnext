/**
 * Arbitre entre clic simple et double-clic sans retarder le premier effet.
 *
 * Le navigateur envoie `click(detail=1)`, puis `click(detail=2)` avant
 * `dblclick`. Le premier clic active donc immédiatement le contexte et garde
 * seulement sa compensation. Si un second clic natif suit sur la même cible,
 * cette compensation continue indépendamment de la consultation locale.
 */

export interface ClickIntentRevert {
  /** `false` indique que la compensation distante n'a pas été confirmée. */
  (): boolean | void | Promise<boolean | void>;
  /** Libère l'historique quand ce clic ne peut plus devenir un double-clic. */
  release?: () => void;
}
export interface ClickIntentCommit
  extends Promise<undefined | ClickIntentRevert> {
  /** Holds visible pending while an undo waits for the initial acknowledgement. */
  retainPending?: () => () => void;
}
export type ClickIntentSingleResult =
  | void
  | ClickIntentRevert
  | Promise<void | ClickIntentRevert>;

/**
 * Fenêtre de réversibilité seulement : elle ne retarde jamais le clic simple.
 * Elle dépasse volontairement un double-clic usuel, puis libère le journal.
 */
export const CLICK_INTENT_REVERT_WINDOW_MS = 5_000;

export type ClickIntentSchedule = (
  run: () => void,
  delayMs: number,
) => () => void;

export interface ClickIntent {
  /** Identité stable de la ligne, barre ou point concerné. */
  key: string;
  /** Action immédiate du clic simple, typiquement l'ajout au contexte. */
  onSingle: () => ClickIntentSingleResult;
  /** Action exclusive du double-clic, typiquement le drilldown. */
  onDouble: () => void;
  /** Unclassified/conversational actions wait for confirmed compensation. */
  doublePolicy?: "local" | "after-context";
  /** Viewer-owned gate: no conversation while another context write is pending. */
  runConversation?: (
    action: () => void,
    restored: Promise<boolean>,
  ) => Promise<boolean>;
}

export interface ClickIntentKeyEvent {
  key: string;
  repeat?: boolean;
  preventDefault(): void;
}

export interface ClickIntentArbiter {
  /** Exécute le simple immédiatement ; `detail >= 2` lance sa compensation. */
  click(intent: ClickIntent, clickCount?: number): void;
  /** Opens local detail immediately; conversation waits for compensation. */
  doubleClick(intent: ClickIntent): void;
  /** Espace exécute le simple ; Entrée exécute le double, sans attente. */
  keyDown(intent: ClickIntent, event: ClickIntentKeyEvent): void;
  /** Libère l'historique réversible d'une cible sans annuler son effet. */
  cancel(key: string): void;
  /** Libère tout l'historique, notamment lors du démontage. */
  cancelAll(): void;
}

interface RetainedSingle {
  committed: ClickIntentCommit;
  cancelRelease: () => void;
}

function scheduleTimeout(run: () => void, delayMs: number): () => void {
  const timer = setTimeout(run, delayMs);
  return () => clearTimeout(timer);
}

export function createClickIntentArbiter(
  schedule: ClickIntentSchedule = scheduleTimeout,
): ClickIntentArbiter {
  // Un nouveau premier clic libère les compensations plus anciennes. Il ne
  // peut pas appartenir au même double-clic natif (son `detail` vaudrait 2).
  const retainedSingles = new Map<string, RetainedSingle>();
  const pendingReverts = new Map<string, Promise<boolean>>();
  const delayedDoubles = new Map<string, object>();
  const failedDoubleSequences = new Set<string>();

  function startSingle(intent: ClickIntent): ClickIntentCommit {
    try {
      const result = intent.onSingle();
      const committed = Promise.resolve(result).then(
        (revert) => typeof revert === "function" ? revert : undefined,
        () => () => false,
      );
      return Object.assign(committed, {
        retainPending: result && "retainPending" in result &&
            typeof result.retainPending === "function"
          ? result.retainPending as () => () => void
          : undefined,
      });
    } catch {
      return Promise.resolve(() => false);
    }
  }

  function startRevert(
    committed: ClickIntentCommit,
  ): Promise<boolean> {
    // Claim before opening anything that can unmount this arbiter. The promise
    // owns undo and release from here; cancelAll only cancels future callbacks.
    const releasePending = committed.retainPending?.();
    return committed.then(async (revert) => {
      try {
        return (await revert?.()) !== false;
      } catch {
        return false;
      } finally {
        revert?.release?.();
      }
    }, () => false).finally(() => releasePending?.());
  }

  function releaseCommitted(
    committed: ClickIntentCommit,
  ) {
    void committed.then((revert) => revert?.release?.(), () => {});
  }

  function releaseAllCommitted() {
    for (const retained of retainedSingles.values()) {
      retained.cancelRelease();
      releaseCommitted(retained.committed);
    }
    retainedSingles.clear();
  }

  function cancel(key: string) {
    const retained = retainedSingles.get(key);
    retainedSingles.delete(key);
    if (retained) {
      retained.cancelRelease();
      releaseCommitted(retained.committed);
    }
    pendingReverts.delete(key);
    delayedDoubles.delete(key);
    failedDoubleSequences.delete(key);
  }

  function cancelAll() {
    releaseAllCommitted();
    pendingReverts.clear();
    delayedDoubles.clear();
    failedDoubleSequences.clear();
  }

  function runSingle(intent: ClickIntent, reversible: boolean) {
    cancel(intent.key);
    const committed = startSingle(intent);
    if (reversible) {
      // Enregistrer avant de programmer garde l'arbitre correct même avec un
      // ordonnanceur de test synchrone.
      const retained: RetainedSingle = {
        committed,
        cancelRelease: () => {},
      };
      retainedSingles.set(intent.key, retained);
      retained.cancelRelease = schedule(() => {
        if (retainedSingles.get(intent.key) !== retained) return;
        retainedSingles.delete(intent.key);
        releaseCommitted(committed);
      }, CLICK_INTENT_REVERT_WINDOW_MS);
    } else {
      releaseCommitted(committed);
    }
  }

  function runDouble(intent: ClickIntent) {
    // Plusieurs `dblclick` peuvent être émis pendant une séquence rapide de
    // quatre clics. Aucun suivant ne doit contourner une compensation en vol.
    if (
      delayedDoubles.has(intent.key) ||
      failedDoubleSequences.has(intent.key)
    ) return;
    const retained = retainedSingles.get(intent.key);
    retainedSingles.delete(intent.key);
    retained?.cancelRelease();
    const pendingRevert = pendingReverts.get(intent.key) ??
      (retained ? startRevert(retained.committed) : null);
    pendingReverts.delete(intent.key);
    if (intent.doublePolicy !== "local" && intent.runConversation) {
      runConversation(intent, pendingRevert ?? Promise.resolve(true));
      return;
    }
    if (!pendingRevert) {
      failedDoubleSequences.add(intent.key);
      intent.onDouble();
      return;
    }

    const token = {};
    delayedDoubles.set(intent.key, token);
    // Register all cleanup ownership before this callback can navigate/unmount.
    if (intent.doublePolicy === "local") intent.onDouble();
    void pendingRevert.then((restored) => {
      if (delayedDoubles.get(intent.key) !== token) return;
      delayedDoubles.delete(intent.key);
      // Keep this native burst consumed after success as well as failure.
      failedDoubleSequences.add(intent.key);
      if (restored) {
        if (intent.doublePolicy !== "local") intent.onDouble();
      }
    });
  }

  function runConversation(intent: ClickIntent, restored: Promise<boolean>) {
    const token = {};
    delayedDoubles.set(intent.key, token);
    const finish = () => {
      if (delayedDoubles.get(intent.key) !== token) return;
      delayedDoubles.delete(intent.key);
      failedDoubleSequences.add(intent.key);
    };
    void intent.runConversation!(() => {
      if (delayedDoubles.get(intent.key) === token) intent.onDouble();
    }, restored).then(finish, finish);
  }

  return {
    click(intent, clickCount = 1) {
      if (clickCount >= 2) {
        const retained = retainedSingles.get(intent.key);
        retainedSingles.delete(intent.key);
        retained?.cancelRelease();
        if (retained && !pendingReverts.has(intent.key)) {
          pendingReverts.set(
            intent.key,
            startRevert(retained.committed),
          );
        }
        return;
      }

      failedDoubleSequences.delete(intent.key);
      releaseAllCommitted();
      pendingReverts.clear();
      runSingle(intent, true);
    },
    doubleClick: runDouble,
    keyDown(intent, event) {
      if (event.repeat) return;
      if (event.key === " ") {
        event.preventDefault();
        // Les commandes clavier sont explicites, pas une séquence à arbitrer.
        runSingle(intent, false);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        // Une Entrée ultérieure conserve un contexte pointer déjà appliqué.
        cancel(intent.key);
        if (intent.doublePolicy !== "local" && intent.runConversation) {
          runConversation(intent, Promise.resolve(true));
        } else {
          intent.onDouble();
        }
      }
    },
    cancel,
    cancelAll,
  };
}
