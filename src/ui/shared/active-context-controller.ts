import {
  type ActiveContextMutation,
  type ActiveContextResult,
  type ActiveContextSelection,
  activeContextSelectionsForScope,
  addActiveContextSelectionWithEviction,
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
  type ActiveContextFlowHost,
  contextFallbackForConfirmedContext,
} from "./active-context-flow.ts";
import type { ClickIntentCommit, ClickIntentRevert } from "./click-intent.ts";

export type ActiveContextReconcileResult = ActiveContextResult | "unchanged";
export interface ActiveContextState {
  selections: ActiveContextSelection[];
  pending: boolean;
  failed: boolean;
  evictedLabel: string | null;
}

/** The viewer owns this queue; a clicked surface may unmount during its undo. */
export function createActiveContextController(
  app: ActiveContextFlowHost,
  initialScope: string,
) {
  let scope = initialScope;
  let clearedScope = initialScope;
  let generation = 0;
  let state: ActiveContextState = {
    selections: [],
    pending: false,
    failed: false,
    evictedLabel: null,
  };
  const listeners = new Set<(state: ActiveContextState) => void>();
  const queue = createActiveContextQueue();
  const pending = new Set<number>();
  let nextOperation = 0;
  let lastPresentation = 0;
  let remoteEmpty = true;
  let mutationBase: ActiveContextSelection[] = [];
  let mutationLog: ActiveContextMutation[] = [];
  let nextMutation = 0;

  function publish(patch: Partial<ActiveContextState>) {
    if (
      Object.entries(patch).every(([key, value]) =>
        state[key as keyof ActiveContextState] === value
      )
    ) return;
    state = { ...state, ...patch };
    for (const listener of listeners) listener(state);
  }

  function beginOperation(
    operationGeneration = generation,
    presentationId?: number,
  ) {
    const id = ++nextOperation;
    const presentation = presentationId ?? id;
    pending.add(id);
    publish({ pending: true });
    const finish = (accepted?: boolean) => {
      if (!pending.delete(id)) return;
      const patch: Partial<ActiveContextState> = { pending: pending.size > 0 };
      if (
        accepted !== undefined && operationGeneration === generation &&
        (!accepted || presentation >= lastPresentation)
      ) {
        lastPresentation = Math.max(lastPresentation, presentation);
        patch.failed = !accepted;
      }
      publish(patch);
    };
    return Object.assign(finish, { id });
  }

  function compact() {
    const next = compactActiveContextMutations(mutationBase, mutationLog);
    mutationBase = next.base;
    mutationLog = next.mutations;
  }
  function record(apply: ActiveContextMutation["apply"], reversible = false) {
    const mutation = { id: ++nextMutation, active: true, reversible, apply };
    mutationLog.push(mutation);
    compact();
    return mutation;
  }
  function release(mutation: ActiveContextMutation) {
    if (!mutationLog.includes(mutation)) return;
    mutation.reversible = false;
    compact();
  }
  function commit(next: ActiveContextSelection[]) {
    // An acknowledged write remains host truth even after a root change.
    remoteEmpty = next.length === 0;
    publish({ selections: next });
  }
  function replace(next: readonly ActiveContextSelection[]) {
    return next.length === 0
      ? clearActiveContext(app)
      : replaceActiveContext(app, next.map((selection) => selection.item));
  }
  function clear() {
    const finish = beginOperation();
    publish({ evictedLabel: null });
    return queue.run(async () => {
      try {
        const result = await clearActiveContext(app);
        if (result === "cleared") {
          mutationBase = [];
          mutationLog = [];
          commit([]);
        }
        finish(result === "cleared");
        return result;
      } finally {
        finish();
      }
    });
  }

  function actionsForScope(actionScope: string) {
    const actionGeneration = generation;
    const current = () => actionGeneration === generation;
    function addMutation(next: ContextSelectionItem) {
      return (items: readonly ActiveContextSelection[]) =>
        addActiveContextSelectionWithEviction(
          activeContextSelectionsForScope(items, actionScope),
          actionScope,
          next,
        ).selections;
    }
    function selectionMutation(next: ContextSelectionItem, toggling: boolean) {
      const selected = toggling &&
        state.selections.find((selection) =>
          selection.scopeKey === actionScope && selection.item.id === next.id
        );
      if (selected) {
        const apply: ActiveContextMutation["apply"] = (items) =>
          removeActiveContextSelection(items, selected);
        return {
          selections: apply(state.selections),
          evicted: null,
          removing: true,
          apply,
        };
      }
      return {
        ...addActiveContextSelectionWithEviction(
          activeContextSelectionsForScope(state.selections, actionScope),
          actionScope,
          next,
        ),
        removing: false,
        apply: addMutation(next),
      };
    }
    function activate(
      next: ContextSelectionItem,
      fallbackMessage?: string,
      toggling = false,
    ): Promise<ActiveContextActivation> {
      const finish = beginOperation(actionGeneration);
      return queue.run(async () => {
        try {
          if (!current()) return "superseded";
          // Decide from acknowledged state inside the queue. Replay keeps the
          // chosen add/remove intent when an earlier gesture is compensated.
          const mutation = selectionMutation(next, toggling);
          const removal = mutation.removing
            ? await replace(mutation.selections)
            : undefined;
          const result: ActiveContextActivation = mutation.removing
            ? removal === "shared" || removal === "cleared" ? "context" : "none"
            : await activateContextWithFallback(
              app,
              mutation.selections.map((selection) => selection.item),
              contextFallbackForConfirmedContext(
                fallbackMessage,
                state.selections.length > 0,
                remoteEmpty,
              ),
              current,
            );
          if (result === "context") {
            record(mutation.apply);
            commit(mutation.selections);
            if (current() && (mutation.removing || mutation.evicted)) {
              publish({ evictedLabel: mutation.evicted?.item.label ?? null });
            }
          }
          finish(result === "context");
          return current() ? result : "superseded";
        } finally {
          finish();
        }
      });
    }
    function activateReversible(
      next: ContextSelectionItem,
      toggling = false,
    ): ClickIntentCommit {
      const finish = beginOperation(actionGeneration);
      let undoPresentation = finish.id;
      const committed = queue.run(async (): Promise<ClickIntentRevert> => {
        try {
          if (!current()) return () => false;
          const change = selectionMutation(next, toggling);
          const result = await replace(change.selections);
          if (result !== "shared" && result !== "cleared") {
            finish(false);
            // A failed context must not unlock a conversation fallback.
            return () => false;
          }
          const mutation = record(change.apply, true);
          commit(change.selections);
          if (current() && (change.removing || change.evicted)) {
            publish({ evictedLabel: change.evicted?.item.label ?? null });
          }
          finish(true);
          const revert: ClickIntentRevert = () => {
            // Undo belongs to its original gesture, not to the later moment
            // when the first ACK lets it run. It cannot hide a newer failure.
            const finishRevert = beginOperation(
              actionGeneration,
              undoPresentation,
            );
            return queue.run(async () => {
              try {
                // A confirmed clear removed the mutation. A rejected root clear
                // did not: its pending undo still has to run.
                if (!mutation.active || !mutationLog.includes(mutation)) {
                  return true;
                }
                mutation.active = false;
                const rolledBack = replayActiveContextMutations(
                  mutationLog,
                  mutationBase,
                );
                if (sameActiveContextSelections(state.selections, rolledBack)) {
                  return true;
                }
                const result = await replace(rolledBack);
                const accepted = result === "shared" || result === "cleared";
                if (accepted) {
                  commit(rolledBack);
                  publish({ evictedLabel: null });
                } else mutation.active = true;
                finishRevert(accepted);
                return accepted;
              } finally {
                finishRevert();
              }
            });
          };
          revert.release = () => release(mutation);
          return revert;
        } finally {
          finish();
        }
      });
      // Claimed at click(detail=2) before the first ACK, bridging the wait for undo.
      return Object.assign(committed, {
        retainPending: () => {
          const hold = beginOperation(actionGeneration);
          undoPresentation = hold.id;
          return hold;
        },
      });
    }
    function remove(target: ActiveContextSelection) {
      const finish = beginOperation(actionGeneration);
      return queue.run(async () => {
        try {
          if (!current()) return "superseded" as const;
          const apply: ActiveContextMutation["apply"] = (items) =>
            removeActiveContextSelection(items, target);
          const next = apply(state.selections);
          if (sameActiveContextSelections(state.selections, next)) {
            record(apply);
            return "unchanged" as const;
          }
          const result = await replace(next);
          const accepted = result === "shared" || result === "cleared";
          if (accepted) {
            record(apply);
            commit(next);
          }
          finish(accepted);
          return result;
        } finally {
          finish();
        }
      });
    }
    function reconcileCurrent(
      apply: ActiveContextMutation["apply"],
    ): Promise<ActiveContextReconcileResult> {
      return queue.run(async () => {
        if (!current()) return "unchanged";
        const next = apply(state.selections);
        if (sameActiveContextSelections(state.selections, next)) {
          // Keep refresh intent for an older selection restored by undo. No
          // pending publication for no-ops: it would cause a reconcile effect loop.
          record(apply);
          return "unchanged";
        }
        const finish = beginOperation(actionGeneration);
        try {
          const result = await replace(next);
          const accepted = result === "shared" || result === "cleared";
          if (accepted) {
            record(apply);
            commit(next);
          }
          finish(accepted);
          return result;
        } finally {
          finish();
        }
      });
    }
    function waitUntilIdle(): Promise<void> {
      if (!state.pending) return Promise.resolve();
      return new Promise((resolve) => {
        const listener = (next: ActiveContextState) => {
          if (next.pending) return;
          listeners.delete(listener);
          resolve();
        };
        listeners.add(listener);
      });
    }
    async function runConversation(
      action: () => void,
      restored: Promise<boolean>,
    ): Promise<boolean> {
      // Wait outside the write queue: the compensation itself needs that queue.
      // Later deliberate selections belong to this conversation once confirmed.
      if (!await restored || !current()) return false;
      while (current()) {
        await waitUntilIdle();
        const outcome = await queue.run(() => {
          if (!current() || state.failed) return Promise.resolve("cancel");
          // A gesture may have queued a write between idle and this barrier.
          if (state.pending) return Promise.resolve("retry");
          action();
          return Promise.resolve("sent");
        });
        if (outcome !== "retry") return outcome === "sent";
      }
      return false;
    }
    return {
      activate,
      activateReversible,
      toggle: (next: ContextSelectionItem) => activate(next, undefined, true),
      toggleReversible: (next: ContextSelectionItem) =>
        activateReversible(next, true),
      remove,
      clear,
      runConversation,
      reconcile: (candidates: readonly ContextSelectionItem[]) =>
        reconcileCurrent((items) =>
          reconcileActiveContextSelections(items, actionScope, candidates)
        ),
      reconcileView: (
        reconcileKey: string,
        candidates: readonly ContextSelectionItem[],
      ) =>
        reconcileCurrent((items) =>
          reconcileActiveContextViewSelections(
            items,
            actionScope,
            reconcileKey,
            candidates,
          )
        ),
      reconcileDocument: (
        documentId: string,
        candidates: readonly ContextSelectionItem[],
      ) =>
        reconcileCurrent((items) =>
          reconcileActiveContextDocumentSelections(
            items,
            actionScope,
            documentId,
            candidates,
          )
        ),
      isSelected: (candidate: ContextSelectionItem) =>
        state.selections.some((selection) =>
          selection.scopeKey === actionScope &&
          selection.item.id === candidate.id
        ),
    };
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: (state: ActiveContextState) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setScope(next: string) {
      if (scope === next) return;
      scope = next;
      generation += 1;
      remoteEmpty = false;
      // Keep acknowledged history until the queued root clear succeeds.
    },
    clearPreviousScope() {
      if (clearedScope === scope) return;
      clearedScope = scope;
      return clear();
    },
    dismissEviction: () => publish({ evictedLabel: null }),
    actionsForScope,
  };
}
