/**
 * La pile de navigation, côté Preact : l'état, les sauts, le chargement.
 *
 * `jump(jump)` empile un niveau vide, appelle l'outil du saut, puis remplit
 * le niveau — qui garde sa payload jusqu'à ce qu'on le coupe. `patchUi`
 * écrit l'état d'interface du niveau courant (tri, page, ligne active).
 */

import { useCallback, useLayoutEffect, useMemo, useState } from "preact/hooks";
import type { Jump, ToolHost } from "./jumps";
import { jumpInto, refreshCurrent, type StackStore } from "./nav-jump";
import {
  clearStale,
  createStack,
  currentLevel,
  type LevelInit,
  type LevelUi,
  markStale as markStaleLevels,
  navRootIdentity,
  type NavStack,
  patchLevelUi,
  popLevel,
  popToLevel,
  reconcileRoot,
} from "./nav-stack";

export function useNavStack(host: ToolHost, root: LevelInit) {
  const [stack, setStack] = useState<NavStack>(() => createStack(root));
  const rootIdentity = navRootIdentity(root);

  // Les payloads d'une même ressource arrivent sans démonter le viewer : ils
  // gardent le parcours. Une autre ressource repart, elle, à son niveau 1.
  useLayoutEffect(() => {
    setStack((s) => reconcileRoot(s, root));
  }, [rootIdentity]);

  const current = currentLevel(stack);

  // La pile vit dans l'état Preact ; l'orchestration, dans `nav-jump.ts`.
  const store = useMemo<StackStore>(() => ({
    set: (update) => setStack((s) => update(s)),
  }), []);

  const jump = useCallback((jump: Jump) => jumpInto(store, host, jump), [
    store,
    host,
  ]);

  const pop = useCallback(() => setStack((s) => popLevel(s)), []);
  const popTo = useCallback(
    (index: number) => setStack((s) => popToLevel(s, index)),
    [],
  );
  const patchUi = useCallback((patch: Partial<LevelUi>) => {
    setStack((s) => patchLevelUi(s, currentLevel(s).id, patch));
  }, []);

  /** Une action vient de changer `subject` : les niveaux ouverts sont périmés. */
  const markStale = useCallback((subject?: string) => {
    setStack((s) => markStaleLevels(s, timeLabel(new Date()), subject));
  }, []);

  /**
   * Recharge le niveau courant s'il sait comment (un outil) ; la racine
   * relève de la vue, qui garde son propre rafraîchissement.
   */
  const refreshLevel = useCallback(() => refreshCurrent(store, host), [
    store,
    host,
  ]);

  const clearStaleLevel = useCallback((id: string) => {
    setStack((s) => clearStale(s, id));
  }, []);

  return {
    stack,
    current,
    depth: stack.levels.length,
    isRoot: stack.levels.length === 1,
    jump,
    pop,
    popTo,
    patchUi,
    markStale,
    refreshLevel,
    clearStale: clearStaleLevel,
  };
}

/** « 14:02 » — l'heure des valeurs qu'un niveau périmé affiche encore. */
function timeLabel(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export type NavStackState = ReturnType<typeof useNavStack>;
