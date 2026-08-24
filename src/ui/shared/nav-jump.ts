/**
 * L'orchestration d'un saut, sans Preact : ce que `useNavStack` fait quand
 * on lui demande d'empiler. Testée seule, avec un hôte simulé.
 *
 * Un saut à la fois ; une cible déjà en pile y remonte au lieu d'empiler ;
 * la réponse d'un outil ne touche que le niveau qui l'a demandée — un retour
 * entre-temps la laisse tomber.
 */

import {
  type Jump,
  levelFromJump,
  loadLevelBody,
  type ToolHost,
} from "./jumps.ts";
import {
  clearStale,
  currentLevel,
  findLevelByKey,
  levelKey,
  type NavLevel,
  type NavStack,
  patchLevel,
  popToLevel,
  pushLevel,
} from "./nav-stack.ts";

/**
 * Où la pile vit : un écrivain fonctionnel, qui reçoit l'état le plus
 * récent (le `setState` de Preact, ou une variable en test).
 */
export interface StackStore {
  set(update: (stack: NavStack) => NavStack): void;
}

export type JumpOutcome = "ignored" | "popped" | "pushed";

export async function jumpInto(
  store: StackStore,
  host: ToolHost,
  jump: Jump,
): Promise<JumpOutcome> {
  const init = levelFromJump(jump);
  const key = levelKey(jump.tool);
  // Un porteur mutable : TypeScript ne voit pas les écritures faites dans
  // la mise à jour fonctionnelle, un `let` serait rétréci à sa valeur initiale.
  const decision = {
    outcome: "ignored" as JumpOutcome,
    id: "",
    rootIdentity: "",
  };
  // Tout se décide sur l'état que l'écrivain fournit — jamais sur une
  // lecture d'avant : deux sauts du même tick voient chacun le précédent.
  store.set((s) => {
    // Un saut à la fois : un double clic n'empile pas deux niveaux.
    if (currentLevel(s).loading) return s;
    // La pile se replie sur elle-même : une cible déjà ouverte, on y remonte.
    const existing = findLevelByKey(s, key);
    if (existing >= 0) {
      decision.outcome = "popped";
      return popToLevel(s, existing);
    }
    const next = pushLevel(s, init);
    decision.id = currentLevel(next).id;
    decision.rootIdentity = s.rootIdentity;
    decision.outcome = "pushed";
    return next;
  });
  if (decision.outcome !== "pushed") return decision.outcome;
  const id = decision.id;
  const loaded = await loadLevelBody(host, jump.tool);
  // `patchLevel` ne fait rien si le niveau a disparu entre-temps.
  store.set((s) => {
    if (s.rootIdentity !== decision.rootIdentity) return s;
    return patchLevel(s, id, {
      loading: false,
      body: loaded.body,
      count: loaded.count,
      error: loaded.error,
    });
  });
  return decision.outcome;
}

/**
 * Recharge le niveau courant s'il sait comment (un outil) ; la racine
 * relève de la vue, qui garde son propre rafraîchissement.
 */
export async function refreshCurrent(
  store: StackStore,
  host: ToolHost,
): Promise<boolean> {
  const target: {
    id: string;
    rootIdentity: string;
    tool?: NonNullable<NavLevel["tool"]>;
  } = {
    id: "",
    rootIdentity: "",
  };
  store.set((s) => {
    const level = currentLevel(s);
    if (!level.tool) return s;
    target.id = level.id;
    target.rootIdentity = s.rootIdentity;
    target.tool = level.tool;
    return patchLevel(s, level.id, { loading: true });
  });
  if (!target.tool) return false;
  const { id, rootIdentity, tool } = target;
  const loaded = await loadLevelBody(host, tool);
  if (loaded.error) {
    // L'ancien corps reste exploitable et son bandeau périmé garde le bouton
    // de retry. Une erreur de refresh ne transforme pas une valeur connue en
    // écran vide.
    store.set((s) =>
      s.rootIdentity === rootIdentity
        ? patchLevel(s, id, { loading: false })
        : s
    );
    return false;
  }
  store.set((s) => {
    if (s.rootIdentity !== rootIdentity) return s;
    return clearStale(
      patchLevel(s, id, {
        loading: false,
        body: loaded.body,
        count: loaded.count,
        error: undefined,
      }),
      id,
    );
  });
  return true;
}
