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
  type ActiveContextResult,
  type ActiveContextSelection,
  activeContextSelectionsForScope,
  addActiveContextSelectionWithEviction,
  canReplaceActiveContext,
  clearActiveContext,
  type ContextSelectionItem,
  createActiveContextQueue,
  reconcileActiveContextSelections,
  removeActiveContextSelection,
  replaceActiveContext,
  sameActiveContextSelections,
} from "./active-context.ts";
import {
  activateContextWithFallback,
  type ActiveContextActivation,
  activeContextPresentationEffect,
  contextFallbackForConfirmedContext,
} from "./active-context-flow.ts";

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
  const evictionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supported = canReplaceActiveContext(app.getHostCapabilities());

  // Invalider pendant le render ferme la fenêtre entre un changement de racine
  // et les effets : aucun ancien handler ne peut ensuite commit ou fallback.
  if (renderedScopeRef.current !== scopeKey) {
    renderedScopeRef.current = scopeKey;
    generationRef.current += 1;
    remoteContextIsEmptyRef.current = false;
  }

  const commit = useCallback((next: ActiveContextSelection[]) => {
    selectionsRef.current = next;
    setSelections(next);
  }, []);

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
        commit([]);
        if (generation === generationRef.current) setFailed(false);
      } else if (generation === generationRef.current) {
        // Garder l'ancien chip : il décrit encore le dernier contexte confirmé.
        remoteContextIsEmptyRef.current = false;
        setFailed(true);
      }
      return result;
    });
  }, [app, commit, scopeKey]);

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
      // Ferme aussi la micro-fenêtre entre le contrôle interne du flow et son
      // retour dans ce hook.
      if (generation !== generationRef.current) return "superseded";
      const presentation = activeContextPresentationEffect(result);
      if (presentation === "replace") {
        remoteContextIsEmptyRef.current = false;
        commit(proposed);
        setFailed(false);
        if (addition.evicted) announceEviction(addition.evicted.item.label);
      } else if (presentation === "failure") {
        // `message` signifie que le fallback a réussi, pas que le contexte a
        // changé : conserver les anciennes sélections et rendre l'échec visible.
        setFailed(true);
      }
      return result;
    });
  }, [announceEviction, app, commit, scopeKey]);

  const clear = useCallback(async () => {
    setFailed(false);
    setEvictedLabel(null);
    return await queue.current.run(async () => {
      const result = await clearActiveContext(app);
      if (result === "cleared") {
        remoteContextIsEmptyRef.current = true;
        commit([]);
        setFailed(false);
      } else {
        setFailed(true);
      }
      return result;
    });
  }, [app, commit]);

  const remove = useCallback(async (target: ActiveContextSelection) => {
    setFailed(false);
    return await queue.current.run(async () => {
      const current = selectionsRef.current;
      const next = removeActiveContextSelection(current, target);
      if (next.length === current.length) return "unchanged" as const;
      const result = await replaceSelectionSet(next);
      if (result === "shared" || result === "cleared") {
        remoteContextIsEmptyRef.current = next.length === 0;
        commit(next);
        setFailed(false);
      } else {
        setFailed(true);
      }
      return result;
    });
  }, [commit, replaceSelectionSet]);

  const reconcile = useCallback(async (
    candidates: readonly ContextSelectionItem[],
  ): Promise<ActiveContextReconcileResult> => {
    return await queue.current.run(async () => {
      const current = selectionsRef.current;
      const next = reconcileActiveContextSelections(
        current,
        scopeKey,
        candidates,
      );
      if (sameActiveContextSelections(current, next)) return "unchanged";
      const result = await replaceSelectionSet(next);
      if (result === "shared" || result === "cleared") {
        remoteContextIsEmptyRef.current = next.length === 0;
        commit(next);
        setFailed(false);
      } else {
        setFailed(true);
      }
      return result;
    });
  }, [commit, replaceSelectionSet, scopeKey]);

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
    remove,
    clear,
    reconcile,
    isSelected,
  };
}
