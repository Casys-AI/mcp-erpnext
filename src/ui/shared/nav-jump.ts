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
  type NavStack,
  patchLevel,
  popToLevel,
  pushLevel,
} from "./nav-stack.ts";

/** Où la pile vit : un lecteur et un écrivain, fonctionnel ou non. */
export interface StackStore {
  get(): NavStack;
  set(update: (stack: NavStack) => NavStack): void;
}

export type JumpOutcome = "ignored" | "popped" | "pushed";

export async function jumpInto(
  store: StackStore,
  host: ToolHost,
  jump: Jump,
): Promise<JumpOutcome> {
  // Un saut à la fois : un double clic n'empile pas deux niveaux.
  if (currentLevel(store.get()).loading) return "ignored";
  // La pile se replie sur elle-même : une cible déjà ouverte, on y remonte.
  const existing = findLevelByKey(store.get(), levelKey(jump.tool));
  if (existing >= 0) {
    store.set((s) => popToLevel(s, existing));
    return "popped";
  }
  const next = pushLevel(store.get(), levelFromJump(jump));
  const id = currentLevel(next).id;
  store.set(() => next);
  const loaded = await loadLevelBody(host, jump.tool);
  // `patchLevel` ne fait rien si le niveau a disparu entre-temps.
  store.set((s) =>
    patchLevel(s, id, {
      loading: false,
      body: loaded.body,
      count: loaded.count,
      error: loaded.error,
    })
  );
  return "pushed";
}

/**
 * Recharge le niveau courant s'il sait comment (un outil) ; la racine
 * relève de la vue, qui garde son propre rafraîchissement.
 */
export async function refreshCurrent(
  store: StackStore,
  host: ToolHost,
): Promise<boolean> {
  const level = currentLevel(store.get());
  if (!level.tool) return false;
  const id = level.id;
  store.set((s) => patchLevel(s, id, { loading: true, error: undefined }));
  const loaded = await loadLevelBody(host, level.tool);
  store.set((s) =>
    clearStale(
      patchLevel(s, id, {
        loading: false,
        body: loaded.body,
        count: loaded.count,
        error: loaded.error,
      }),
      id,
    )
  );
  return true;
}
