/**
 * Côté Preact du contexte hôte : le branchement sur `App` et le hook.
 *
 * Séparé du magasin (host-context.ts) pour que celui-ci reste pur et
 * testable sous Deno. Ici on importe `preact/hooks` et le SDK ext-apps —
 * les deux dépendances npm que Deno ne résout pas.
 */

import { useEffect, useState } from "preact/hooks";
import type { App } from "@modelcontextprotocol/ext-apps";
import {
  getHostContext,
  type HostContext,
  mergeHostContext,
  subscribeHostContext,
} from "./host-context";

export type { HostContext } from "./host-context";
export { getHostContext, mergeHostContext, subscribeHostContext };

/**
 * Branche une `App` sur le magasin : lit le contexte initial après la
 * connexion, puis suit les changements.
 *
 * À appeler une fois par vue, après `app.connect()`. Le handler est posé
 * avant la lecture initiale pour ne pas rater une notification émise entre
 * les deux.
 */
export function bindHostContext(app: App): void {
  app.onhostcontextchanged = (patch) => {
    mergeHostContext(patch as HostContext);
  };
  mergeHostContext(app.getHostContext() as HostContext | undefined);
}

/** Le contexte hôte courant, réactif. */
export function useHostContext(): HostContext {
  const [context, setContext] = useState<HostContext>(getHostContext());
  useEffect(() => subscribeHostContext(setContext), []);
  return context;
}
