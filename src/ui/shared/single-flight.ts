/** Petit verrou pur pour les actions UI qui ne doivent pas partir deux fois. */

export interface SingleFlightGate {
  begin(): number | null;
  settle(token: number): boolean;
  reset(): void;
}

export interface SerialQueue {
  run<T>(operation: () => Promise<T>): Promise<T>;
}

/**
 * Exécute les mutations dans l'ordre d'intention et libère toujours la suite,
 * même si une opération échoue.
 */
export function createSerialQueue(): SerialQueue {
  let tail: Promise<void> = Promise.resolve();
  return {
    run<T>(operation: () => Promise<T>): Promise<T> {
      const result = tail.then(operation, operation);
      tail = result.then(() => undefined, () => undefined);
      return result;
    },
  };
}

/**
 * `settle` vaut false après un reset : une réponse d'un ancien panneau ne peut
 * ainsi afficher aucun feedback dans le panneau qui l'a remplacé.
 */
export function createSingleFlightGate(): SingleFlightGate {
  let revision = 0;
  let pending = false;
  return {
    begin() {
      if (pending) return null;
      pending = true;
      revision += 1;
      return revision;
    },
    settle(token) {
      if (token !== revision) return false;
      pending = false;
      return true;
    },
    reset() {
      revision += 1;
      pending = false;
    },
  };
}
