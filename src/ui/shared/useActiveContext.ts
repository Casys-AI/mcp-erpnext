/** @jsxImportSource preact */

import type { App } from "@modelcontextprotocol/ext-apps";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "preact/hooks";
import {
  type ActiveContextMutation,
  type ActiveContextResult,
  type ActiveContextSelection,
  activeContextSelectionsForScope,
  addActiveContextSelectionWithEviction,
  canReplaceActiveContext,
  clearActiveContext,
  compactActiveContextMutations,
  type ContextSelectionItem,
  createActiveContextQueue,
  reconcileActiveContextDocumentSelections,
  reconcileActiveContextSelections,
  reconcileActiveContextViewSelections,
  removeActiveContextSelection,
  replaceActiveContext,
  replayActiveContextMutations,
  sameActiveContextSelections,
} from "./active-context.ts";
import {
  activateContextWithFallback,
  type ActiveContextActivation,
  activeContextPresentationEffect,
  contextFallbackForConfirmedContext,
} from "./active-context-flow.ts";
import type { ClickIntentRevert } from "./click-intent.ts";

export type ActiveContextReconcileResult = ActiveContextResult | "unchanged";

/**
 * Panier léger du contexte actif d'un viewer.
 *
 * La file sérialise les snapshots complets : plusieurs clics simultanés ne
 * s'écrasent pas. Un succès contexte ne produit aucun message ; le fallback
 * conversationnel explicite n'est tenté qu'après son échec.
 */
export function useActiveContext(app: App, scopeKey: string) {
  const [selections, setSelections] = useState<ActiveContextSelection[]>([]);
  const [failed, setFailed] = useState(false);
  const [evictedLabel, setEvictedLabel] = useState<string | null>(null);
  const selectionsRef = useRef<ActiveContextSelection[]>([]);
  const renderedScopeRef = useRef(scopeKey);
  const clearedScopeRef = useRef(scopeKey);
  const generationRef = useRef(0);
  const remoteContextIsEmptyRef = useRef(true);
  const queue = useRef(createActiveContextQueue());
  const mutationBaseRef = useRef<ActiveContextSelection[]>([]);
  const mutationLogRef = useRef<ActiveContextMutation[]>([]);
  const nextMutationIdRef = useRef(0);
  const evictionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supported = canReplaceActiveContext(app.getHostCapabilities());

  // Invalider pendant le render ferme la fenêtre entre un changement de racine
  // et les effets : aucun ancien handler ne peut ensuite commit ou fallback.
  if (renderedScopeRef.current !== scopeKey) {
    renderedScopeRef.current = scopeKey;
    generationRef.current += 1;
    remoteContextIsEmptyRef.current = false;
    mutationBaseRef.current = [];
    mutationLogRef.current = [];
    nextMutationIdRef.current = 0;
  }

  const commit = useCallback((next: ActiveContextSelection[]) => {
    selectionsRef.current = next;
    setSelections(next);
  }, []);

  const compactMutationLog = useCallback(() => {
    const compacted = compactActiveContextMutations(
      mutationBaseRef.current,
      mutationLogRef.current,
    );
    mutationBaseRef.current = compacted.base;
    mutationLogRef.current = compacted.mutations;
  }, []);

  const recordMutation = useCallback((
    apply: ActiveContextMutation["apply"],
    reversible = false,
  ): ActiveContextMutation => {
    const mutation: ActiveContextMutation = {
      id: ++nextMutationIdRef.current,
      active: true,
      reversible,
      apply,
    };
    mutationLogRef.current.push(mutation);
    compactMutationLog();
    return mutation;
  }, [compactMutationLog]);

  const releaseMutation = useCallback((mutation: ActiveContextMutation) => {
    if (!mutationLogRef.current.includes(mutation)) return;
    mutation.reversible = false;
    compactMutationLog();
  }, [compactMutationLog]);

  const resetMutationLog = useCallback(() => {
    mutationBaseRef.current = [];
    mutationLogRef.current = [];
    nextMutationIdRef.current = 0;
  }, []);

  const replayMutations = useCallback(
    () =>
      replayActiveContextMutations(
        mutationLogRef.current,
        mutationBaseRef.current,
      ),
    [],
  );

  const replaceSelectionSet = useCallback(async (
    next: readonly ActiveContextSelection[],
  ): Promise<ActiveContextResult> => {
    return next.length === 0
      ? await clearActiveContext(app)
      : await replaceActiveContext(
        app,
        next.map((selection) => selection.item),
      );
  }, [app]);

  const announceEviction = useCallback((label: string) => {
    if (evictionTimerRef.current !== null) {
      clearTimeout(evictionTimerRef.current);
    }
    setEvictedLabel(label);
    evictionTimerRef.current = setTimeout(() => {
      setEvictedLabel(null);
      evictionTimerRef.current = null;
    }, 2400);
  }, []);

  useEffect(() => {
    return () => {
      if (evictionTimerRef.current !== null) {
        clearTimeout(evictionTimerRef.current);
      }
    };
  }, []);

  useLayoutEffect(() => {
    if (clearedScopeRef.current === scopeKey) return;
    clearedScopeRef.current = scopeKey;
    const generation = generationRef.current;
    setEvictedLabel(null);
    setFailed(false);

    // Une navigation dans la pile conserve `scopeKey`. Une nouvelle racine,
    // elle, doit retirer atomiquement l'ancien snapshot avant toute sélection.
    void queue.current.run(async () => {
      const result = await clearActiveContext(app);
      if (result === "cleared") {
        remoteContextIsEmptyRef.current = true;
        resetMutationLog();
        commit([]);
        if (generation === generationRef.current) setFailed(false);
      } else if (generation === generationRef.current) {
        // Garder l'ancien chip : il décrit encore le dernier contexte confirmé.
        remoteContextIsEmptyRef.current = false;
        setFailed(true);
      }
      return result;
    });
  }, [app, commit, resetMutationLog, scopeKey]);

  const activate = useCallback(async (
    next: ContextSelectionItem,
    fallbackMessage?: string,
  ): Promise<ActiveContextActivation> => {
    const generation = generationRef.current;
    setFailed(false);
    return await queue.current.run(async () => {
      if (generation !== generationRef.current) return "superseded";
      // Calculer dans la file, et non au clic, garantit que deux clics rapides
      // s'ajoutent tous deux au snapshot confirmé précédent.
      const confirmed = selectionsRef.current;
      const apply: ActiveContextMutation["apply"] = (current) =>
        addActiveContextSelectionWithEviction(
          activeContextSelectionsForScope(current, scopeKey),
          scopeKey,
          next,
        ).selections;
      const addition = addActiveContextSelectionWithEviction(
        activeContextSelectionsForScope(confirmed, scopeKey),
        scopeKey,
        next,
      );
      const proposed = addition.selections;
      // Si A est encore confirmé, un message B serait interprété avec A dans le
      // tour. Le fallback n'est sûr qu'après un contexte vide confirmé.
      const safeFallback = contextFallbackForConfirmedContext(
        fallbackMessage,
        confirmed.length > 0,
        remoteContextIsEmptyRef.current,
      );
      const result = await activateContextWithFallback(
        app,
        proposed.map((selection) => selection.item),
        safeFallback,
        () => generation === generationRef.current,
      );
      const presentation = activeContextPresentationEffect(result);
      const isCurrent = generation === generationRef.current;
      if (presentation === "replace") {
        // Le host a déjà confirmé `proposed`. Le synchroniser même après un
        // changement de racine garde les chips exacts si le clear suivant
        // échoue ; le journal de la nouvelle racine reste, lui, intact.
        remoteContextIsEmptyRef.current = false;
        if (isCurrent) recordMutation(apply);
        commit(proposed);
        setFailed(false);
        if (isCurrent && addition.evicted) {
          announceEviction(addition.evicted.item.label);
        }
      } else if (presentation === "failure") {
        if (!isCurrent) return "superseded";
        // `message` signifie que le fallback a réussi, pas que le contexte a
        // changé : conserver les anciennes sélections et rendre l'échec visible.
        setFailed(true);
      }
      if (!isCurrent) return "superseded";
      return result;
    });
  }, [announceEviction, app, commit, recordMutation, scopeKey]);

  const activateReversible = useCallback(async (
    next: ContextSelectionItem,
  ): Promise<ClickIntentRevert | undefined> => {
    const generation = generationRef.current;
    setFailed(false);
    return await queue.current.run(async () => {
      if (generation !== generationRef.current) return undefined;
      const confirmed = activeContextSelectionsForScope(
        selectionsRef.current,
        scopeKey,
      );
      const apply: ActiveContextMutation["apply"] = (current) =>
        addActiveContextSelectionWithEviction(
          activeContextSelectionsForScope(current, scopeKey),
          scopeKey,
          next,
        ).selections;
      const addition = addActiveContextSelectionWithEviction(
        confirmed,
        scopeKey,
        next,
      );
      const proposed = addition.selections;
      const result = await activateContextWithFallback(
        app,
        proposed.map((selection) => selection.item),
        undefined,
        () => generation === generationRef.current,
      );
      const presentation = activeContextPresentationEffect(result);
      if (presentation !== "replace") {
        if (
          generation === generationRef.current && presentation === "failure"
        ) {
          setFailed(true);
        }
        return undefined;
      }

      remoteContextIsEmptyRef.current = false;
      commit(proposed);
      setFailed(false);
      if (generation !== generationRef.current) return undefined;

      const mutation = recordMutation(apply, true);
      if (addition.evicted) announceEviction(addition.evicted.item.label);

      const revert: ClickIntentRevert = async () => {
        setFailed(false);
        const outcome = await queue.current.run(async () => {
          if (generation !== generationRef.current) return "superseded";
          if (
            !mutation.active ||
            !mutationLogRef.current.includes(mutation)
          ) {
            return "unchanged";
          }

          const current = selectionsRef.current;
          mutation.active = false;
          const rolledBack = replayMutations();
          if (sameActiveContextSelections(current, rolledBack)) {
            return "unchanged";
          }
          const rollbackResult = await replaceSelectionSet(rolledBack);
          if (rollbackResult === "shared" || rollbackResult === "cleared") {
            // Le remplacement distant est déjà confirmé. Même si la racine a
            // changé pendant l'await, ce snapshot doit devenir notre vérité
            // locale avant le clear sérialisé de la nouvelle racine ; si ce
            // clear échoue, les chips restent ainsi fidèles au contexte hôte.
            remoteContextIsEmptyRef.current = rolledBack.length === 0;
            commit(rolledBack);
            setEvictedLabel(null);
            setFailed(false);
          }
          if (generation !== generationRef.current) return "superseded";
          if (rollbackResult !== "shared" && rollbackResult !== "cleared") {
            mutation.active = true;
            setFailed(true);
          }
          return rollbackResult;
        });
        return outcome === "shared" || outcome === "cleared" ||
          outcome === "unchanged";
      };
      revert.release = () => releaseMutation(mutation);
      return revert;
    });
  }, [
    announceEviction,
    app,
    commit,
    recordMutation,
    releaseMutation,
    replaceSelectionSet,
    replayMutations,
    scopeKey,
  ]);

  const clear = useCallback(async () => {
    setFailed(false);
    setEvictedLabel(null);
    return await queue.current.run(async () => {
      const result = await clearActiveContext(app);
      if (result === "cleared") {
        remoteContextIsEmptyRef.current = true;
        resetMutationLog();
        commit([]);
        setFailed(false);
      } else {
        setFailed(true);
      }
      return result;
    });
  }, [app, commit, resetMutationLog]);

  const remove = useCallback(async (target: ActiveContextSelection) => {
    setFailed(false);
    return await queue.current.run(async () => {
      const current = selectionsRef.current;
      const apply: ActiveContextMutation["apply"] = (selections) =>
        removeActiveContextSelection(selections, target);
      const next = apply(current);
      if (next.length === current.length) {
        // Même sans remplacement distant, conserver l'intention : elle peut
        // devenir pertinente si une mutation antérieure est ensuite annulée.
        recordMutation(apply);
        return "unchanged" as const;
      }
      const result = await replaceSelectionSet(next);
      if (result === "shared" || result === "cleared") {
        remoteContextIsEmptyRef.current = next.length === 0;
        recordMutation(apply);
        commit(next);
        setFailed(false);
      } else {
        setFailed(true);
      }
      return result;
    });
  }, [commit, recordMutation, replaceSelectionSet]);

  const reconcileCurrent = useCallback(async (
    nextFor: (
      current: readonly ActiveContextSelection[],
    ) => ActiveContextSelection[],
  ): Promise<ActiveContextReconcileResult> => {
    return await queue.current.run(async () => {
      const current = selectionsRef.current;
      const apply: ActiveContextMutation["apply"] = (selections) =>
        nextFor(selections);
      const next = apply(current);
      if (sameActiveContextSelections(current, next)) {
        // Un refresh sans effet aujourd'hui peut devoir s'appliquer à une
        // sélection restaurée par l'annulation transactionnelle d'un clic.
        recordMutation(apply);
        return "unchanged";
      }
      const result = await replaceSelectionSet(next);
      if (result === "shared" || result === "cleared") {
        remoteContextIsEmptyRef.current = next.length === 0;
        recordMutation(apply);
        commit(next);
        setFailed(false);
      } else {
        setFailed(true);
      }
      return result;
    });
  }, [commit, recordMutation, replaceSelectionSet]);

  const reconcile = useCallback((
    candidates: readonly ContextSelectionItem[],
  ): Promise<ActiveContextReconcileResult> =>
    reconcileCurrent((current) =>
      reconcileActiveContextSelections(current, scopeKey, candidates)
    ), [reconcileCurrent, scopeKey]);

  const reconcileView = useCallback((
    reconcileKey: string,
    candidates: readonly ContextSelectionItem[],
  ): Promise<ActiveContextReconcileResult> =>
    reconcileCurrent((current) =>
      reconcileActiveContextViewSelections(
        current,
        scopeKey,
        reconcileKey,
        candidates,
      )
    ), [reconcileCurrent, scopeKey]);

  const reconcileDocument = useCallback((
    documentId: string,
    candidates: readonly ContextSelectionItem[],
  ): Promise<ActiveContextReconcileResult> =>
    reconcileCurrent((current) =>
      reconcileActiveContextDocumentSelections(
        current,
        scopeKey,
        documentId,
        candidates,
      )
    ), [reconcileCurrent, scopeKey]);

  const isSelected = useCallback(
    (candidate: ContextSelectionItem): boolean =>
      selectionsRef.current.some((selection) =>
        selection.scopeKey === scopeKey && selection.item.id === candidate.id
      ),
    [scopeKey],
  );

  return {
    selections,
    failed,
    evictedLabel,
    supported,
    activate,
    activateReversible,
    remove,
    clear,
    reconcile,
    reconcileView,
    reconcileDocument,
    isSelected,
  };
}
