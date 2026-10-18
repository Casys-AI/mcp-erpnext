import {
  type ActiveContextResult,
  type ActiveContextSelection,
  canReplaceActiveContext,
  clearActiveContext,
  type ContextSelectionItem,
  createActiveContextQueue,
  reconcileActiveContextDocumentSelections,
  reconcileActiveContextSelections,
  reconcileActiveContextViewSelections,
  replaceActiveContext,
  sameActiveContextSelections,
} from "./active-context.ts";
import type {
  ActiveContextActivation,
  ActiveContextFlowHost,
} from "./active-context-flow.ts";
import {
  addSelectionGroupMembers,
  addSelectionSingle,
  emptySelectionState,
  normalizeSelectionAddition,
  projectedSelectionEntries,
  projectSelection,
  reconcileSelectionDocumentFields,
  reconcileSelectionGroup,
  removeSelectionGroup,
  removeSelectionGroupMembers,
  removeSelectionItem,
  type SelectionGroupConfig,
  type SelectionGroupMemberInput,
  type SelectionState,
  setSelectionGroupMembers,
} from "./selection-projection.ts";
import type { ClickIntentCommit, ClickIntentRevert } from "./click-intent.ts";

export type ActiveContextReconcileResult = ActiveContextResult | "unchanged";
export interface ActiveContextState {
  selections: ActiveContextSelection[];
  selection: SelectionState;
  pending: boolean;
  failed: boolean;
  evictedLabel: string | null;
}

type SelectionMutation = {
  id: number;
  active: boolean;
  reversible: boolean;
  apply: (current: SelectionState) => SelectionState;
};
type GroupConfig = Omit<SelectionGroupConfig, "scopeKey">;
type SelectionChange = {
  apply: SelectionMutation["apply"];
  selection: SelectionState;
  evicted: ActiveContextSelection[];
  removing: boolean;
};

/** La file appartient au viewer ; une surface peut disparaître pendant son annulation. */
export function createActiveContextController(
  app: ActiveContextFlowHost,
  initialScope: string,
) {
  let scope = initialScope;
  let clearedScope = initialScope;
  let generation = 0;
  let state: ActiveContextState = {
    selections: [],
    selection: emptySelectionState(),
    pending: false,
    failed: false,
    evictedLabel: null,
  };
  const listeners = new Set<(state: ActiveContextState) => void>();
  const queue = createActiveContextQueue();
  const pending = new Set<number>();
  let nextOperation = 0;
  let lastPresentation = 0;
  let mutationBase = emptySelectionState();
  let mutationLog: SelectionMutation[] = [];
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

  function replay() {
    return mutationLog.reduce(
      (selection, mutation) =>
        mutation.active ? mutation.apply(selection) : selection,
      mutationBase,
    );
  }
  function compact() {
    const first = mutationLog.findIndex((mutation) => mutation.reversible);
    const count = first < 0 ? mutationLog.length : first;
    for (const mutation of mutationLog.slice(0, count)) {
      if (mutation.active) mutationBase = mutation.apply(mutationBase);
    }
    mutationLog = mutationLog.slice(count);
  }
  function record(apply: SelectionMutation["apply"], reversible = false) {
    const mutation = { id: ++nextMutation, active: true, reversible, apply };
    mutationLog.push(mutation);
    compact();
    return mutation;
  }
  function release(mutation: SelectionMutation) {
    if (!mutationLog.includes(mutation)) return;
    mutation.reversible = false;
    compact();
  }
  function commit(selection: SelectionState) {
    // Un ACK reste la vérité distante, même après un changement de racine.
    const projected = projectedSelectionEntries(selection);
    const selections = sameActiveContextSelections(state.selections, projected)
      ? state.selections
      : projected;
    publish({ selection, selections });
  }
  function replace(next: SelectionState) {
    const items = projectSelection(next);
    return items.length === 0
      ? clearActiveContext(app)
      : replaceActiveContext(app, items);
  }
  function clear(): Promise<ActiveContextResult> {
    // Sans cette capacité, aucun contexte distant ne peut avoir été partagé.
    if (!canReplaceActiveContext(app.getHostCapabilities())) {
      return Promise.resolve("unsupported");
    }
    const finish = beginOperation();
    publish({ evictedLabel: null });
    return queue.run(async () => {
      try {
        const result = await clearActiveContext(app);
        if (result === "cleared") {
          mutationBase = emptySelectionState();
          mutationLog = [];
          commit(emptySelectionState());
        }
        // Une capacité disparue reste un résultat neutre.
        finish(result === "unsupported" ? undefined : result === "cleared");
        return result;
      } finally {
        finish();
      }
    });
  }

  function actionsForScope(actionScope: string) {
    const actionGeneration = generation;
    const current = () => actionGeneration === generation;
    function scoped(selection: SelectionState): SelectionState {
      return {
        ...selection,
        singles: selection.singles.filter((entry) =>
          entry.scopeKey === actionScope
        ),
        groups: selection.groups.filter((entry) =>
          entry.scopeKey === actionScope
        ),
      };
    }
    function change(
      applyMembers: SelectionMutation["apply"],
      adding: boolean,
    ): SelectionChange {
      const apply: SelectionMutation["apply"] = (selection) => {
        const next = applyMembers(selection);
        return adding ? normalizeSelectionAddition(next).state : next;
      };
      const candidate = applyMembers(state.selection);
      const normalized = adding
        ? normalizeSelectionAddition(candidate)
        : { state: candidate, evicted: [] };
      return {
        apply,
        selection: normalized.state,
        evicted: normalized.evicted,
        removing: !adding,
      };
    }
    function selectionMutation(
      next: ContextSelectionItem,
      toggling: boolean,
    ): SelectionChange {
      const selected = toggling && isSelected(next);
      return selected
        ? change(
          (selection) =>
            removeSelectionItem(selection, {
              scopeKey: actionScope,
              item: next,
            }),
          false,
        )
        : change(
          (selection) =>
            addSelectionSingle(scoped(selection), actionScope, next),
          true,
        );
    }
    function groupMutation(
      config: GroupConfig,
      member: SelectionGroupMemberInput,
    ): SelectionChange {
      const selected = isSelected({
        id: `record:${config.doctype}:${member.name}`,
        label: member.label,
        view: config.view,
      });
      // L'intention ajout/retrait est fixée à l'exécution, jamais recalculée au replay.
      return selected
        ? change((selection) =>
          removeSelectionGroupMembers(selection, {
            ...config,
            scopeKey: actionScope,
          }, [member.name]), false)
        : change((selection) =>
          addSelectionGroupMembers(scoped(selection), {
            ...config,
            scopeKey: actionScope,
          }, [member]), true);
    }
    function perform(
      prepare: () => SelectionChange,
    ): Promise<ActiveContextActivation> {
      const finish = beginOperation(actionGeneration);
      return queue.run(async () => {
        try {
          if (!current()) return "superseded";
          const mutation = prepare();
          const result = await replace(mutation.selection);
          const accepted = result === "shared" || result === "cleared";
          if (accepted) {
            record(mutation.apply);
            commit(mutation.selection);
            if (current() && (mutation.removing || mutation.evicted.length)) {
              publish({
                evictedLabel: mutation.evicted.at(-1)?.item.label ?? null,
              });
            }
          }
          finish(accepted);
          return current() ? accepted ? "context" : "none" : "superseded";
        } finally {
          finish();
        }
      });
    }
    function activate(next: ContextSelectionItem, toggling = false) {
      return perform(() => selectionMutation(next, toggling));
    }
    function performReversible(
      prepare: () => SelectionChange,
    ): ClickIntentCommit {
      const finish = beginOperation(actionGeneration);
      let undoPresentation = finish.id;
      const committed = queue.run(async (): Promise<ClickIntentRevert> => {
        try {
          if (!current()) return () => false;
          const change = prepare();
          const result = await replace(change.selection);
          if (result !== "shared" && result !== "cleared") {
            finish(false);
            // A failed context must not unlock a conversation fallback.
            return () => false;
          }
          const mutation = record(change.apply, true);
          commit(change.selection);
          if (current() && (change.removing || change.evicted.length)) {
            publish({
              evictedLabel: change.evicted.at(-1)?.item.label ?? null,
            });
          }
          finish(true);
          const revert: ClickIntentRevert = () => {
            // L’annulation appartient au geste initial ; elle ne masque pas un échec plus récent.
            const finishRevert = beginOperation(
              actionGeneration,
              undoPresentation,
            );
            return queue.run(async () => {
              try {
                // Seul un effacement acquitté abandonne les anciennes annulations.
                if (!mutation.active || !mutationLog.includes(mutation)) {
                  return true;
                }
                mutation.active = false;
                const rolledBack = replay();
                if (
                  sameActiveContextSelections(
                    state.selections,
                    projectedSelectionEntries(rolledBack),
                  )
                ) {
                  commit(rolledBack);
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
      // Le second clic réserve l’attente avant même le premier ACK.
      return Object.assign(committed, {
        retainPending: () => {
          const hold = beginOperation(actionGeneration);
          undoPresentation = hold.id;
          return hold;
        },
      });
    }
    function activateReversible(next: ContextSelectionItem, toggling = false) {
      return performReversible(() => selectionMutation(next, toggling));
    }
    function remove(target: ActiveContextSelection) {
      const finish = beginOperation(actionGeneration);
      return queue.run(async () => {
        try {
          if (!current()) return "superseded" as const;
          const apply: SelectionMutation["apply"] = (items) =>
            removeSelectionItem(items, target);
          const next = apply(state.selection);
          if (
            sameActiveContextSelections(
              state.selections,
              projectedSelectionEntries(next),
            )
          ) {
            record(apply);
            commit(next);
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
      apply: SelectionMutation["apply"],
    ): Promise<ActiveContextReconcileResult> {
      return queue.run(async () => {
        if (!current()) return "unchanged";
        const next = apply(state.selection);
        if (
          sameActiveContextSelections(
            state.selections,
            projectedSelectionEntries(next),
          )
        ) {
          // Le refresh doit aussi s’appliquer aux membres restaurés par une annulation.
          // Un résultat inchangé ne doit pas relancer les effets de réconciliation.
          record(apply);
          if (!sameSelectionState(state.selection, next)) commit(next);
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
      // Attendre hors de la file : l’annulation doit pouvoir y entrer.
      if (!await restored || !current()) return false;
      while (current()) {
        await waitUntilIdle();
        const outcome = await queue.run(() => {
          if (!current() || state.failed) return Promise.resolve("cancel");
          // Un geste peut avoir ajouté une écriture entre l’attente et cette barrière.
          if (state.pending) return Promise.resolve("retry");
          action();
          return Promise.resolve("sent");
        });
        if (outcome !== "retry") return outcome === "sent";
      }
      return false;
    }
    function reconcileSingles(
      selection: SelectionState,
      reconcile: (
        singles: readonly ActiveContextSelection[],
      ) => ActiveContextSelection[],
    ): SelectionState {
      // La limite de ressource concerne l’envoi, pas les ressources conservées localement.
      const next = selection.singles.flatMap((single) => reconcile([single]));
      return {
        ...selection,
        singles: next.map((entry) => ({
          ...entry,
          order:
            selection.singles.find((single) =>
              single.scopeKey === entry.scopeKey &&
              single.item.id === entry.item.id
            )!.order,
        })),
      };
    }
    function reconcileGroupsFromItems(
      selection: SelectionState,
      candidates: readonly ContextSelectionItem[],
      complete: boolean,
      reconcileKey?: string,
    ): SelectionState {
      let next = selection;
      for (const group of selection.groups) {
        if (
          group.scopeKey !== actionScope ||
          (reconcileKey !== undefined && group.reconcileKey !== reconcileKey)
        ) continue;
        const prefix = `record:${group.doctype}:`;
        const rows = candidates.filter((item) =>
          (item.reconcileKey ?? item.view) === group.reconcileKey &&
          item.id.startsWith(prefix)
        ).map((item) => ({
          name: item.id.slice(prefix.length),
          label: item.label,
          value: item.value,
          fields: item.fields,
          fieldsSource: item.fieldsSource ?? "row" as const,
          modified: item.modified,
        }));
        next = reconcileSelectionGroup(
          next,
          actionScope,
          group.reconcileKey,
          rows,
          complete,
        );
      }
      return next;
    }
    function isGroupMemberSelected(reconcileKey: string, name: string) {
      return state.selection.groups.some((group) =>
        group.scopeKey === actionScope && group.reconcileKey === reconcileKey &&
        group.members.some((member) => member.name === name)
      );
    }
    function isSelected(candidate: ContextSelectionItem) {
      return state.selection.singles.some((selection) =>
        selection.scopeKey === actionScope && selection.item.id === candidate.id
      ) ||
        state.selection.groups.some((group) =>
          group.scopeKey === actionScope &&
          group.members.some((member) =>
            candidate.id === `record:${group.doctype}:${member.name}`
          )
        );
    }
    return {
      activate,
      activateReversible,
      toggle: (next: ContextSelectionItem) => activate(next, true),
      toggleReversible: (next: ContextSelectionItem) =>
        activateReversible(next, true),
      toggleGroupMember: (
        config: GroupConfig,
        member: SelectionGroupMemberInput,
      ) => perform(() => groupMutation(config, member)),
      toggleGroupMemberReversible: (
        config: GroupConfig,
        member: SelectionGroupMemberInput,
      ) => performReversible(() => groupMutation(config, member)),
      addGroupMembers: (
        config: GroupConfig,
        members: readonly SelectionGroupMemberInput[],
      ) =>
        perform(() =>
          change((selection) =>
            addSelectionGroupMembers(scoped(selection), {
              ...config,
              scopeKey: actionScope,
            }, members), true)
        ),
      removeGroupMembers: (
        config: GroupConfig,
        names: readonly string[],
      ) =>
        perform(() =>
          change((selection) =>
            removeSelectionGroupMembers(selection, {
              ...config,
              scopeKey: actionScope,
            }, names), false)
        ),
      setGroupMembers: (
        config: GroupConfig,
        members: readonly SelectionGroupMemberInput[],
      ) =>
        perform(() => {
          const previous = state.selection.groups.find((group) =>
            group.scopeKey === actionScope &&
            group.reconcileKey === config.reconcileKey
          );
          const adding = members.some((member) =>
            !previous?.members.some((row) => row.name === member.name)
          );
          return change((selection) =>
            setSelectionGroupMembers(scoped(selection), {
              ...config,
              scopeKey: actionScope,
            }, members), adding);
        }),
      removeGroup: (reconcileKey: string, scopeKey = actionScope) =>
        reconcileCurrent((selection) =>
          removeSelectionGroup(selection, scopeKey, reconcileKey)
        ),
      reconcileGroup: (
        reconcileKey: string,
        candidates: readonly SelectionGroupMemberInput[],
        options: { complete?: boolean } = {},
      ) =>
        reconcileCurrent((selection) =>
          reconcileSelectionGroup(
            selection,
            actionScope,
            reconcileKey,
            candidates,
            options.complete ?? false,
          )
        ),
      isGroupMemberSelected,
      remove,
      clear,
      runConversation,
      reconcile: (
        candidates: readonly ContextSelectionItem[],
        options: { complete?: boolean } = {},
      ) =>
        reconcileCurrent((selection) =>
          reconcileGroupsFromItems(
            reconcileSingles(
              selection,
              (items) =>
                reconcileActiveContextSelections(
                  items,
                  actionScope,
                  candidates,
                ),
            ),
            candidates,
            options.complete ?? false,
          )
        ),
      reconcileView: (
        reconcileKey: string,
        candidates: readonly ContextSelectionItem[],
        options: { complete?: boolean } = {},
      ) =>
        reconcileCurrent((selection) =>
          reconcileGroupsFromItems(
            reconcileSingles(selection, (items) =>
              reconcileActiveContextViewSelections(
                items,
                actionScope,
                reconcileKey,
                candidates,
              )),
            candidates,
            options.complete ?? false,
            reconcileKey,
          )
        ),
      reconcileDocument: (
        documentId: string,
        candidates: readonly ContextSelectionItem[],
      ) =>
        reconcileCurrent((selection) => {
          const next = reconcileSingles(selection, (items) =>
            reconcileActiveContextDocumentSelections(
              items,
              actionScope,
              documentId,
              candidates,
            ));
          const candidate = candidates.find((item) =>
            item.id === documentId
          );
          return candidate
            ? reconcileSelectionDocumentFields(
              next,
              actionScope,
              documentId,
              candidate,
            )
            : next;
        }),
      isSelected,
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
      // Conserver l’historique acquitté jusqu’au succès de l’effacement distant.
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

function sameSelectionState(
  left: SelectionState,
  right: SelectionState,
): boolean {
  return left.nextOrder === right.nextOrder &&
    sameActiveContextSelections(left.singles, right.singles) &&
    left.singles.every((single, index) =>
      single.order === right.singles[index].order
    ) &&
    JSON.stringify(left.groups) === JSON.stringify(right.groups);
}
