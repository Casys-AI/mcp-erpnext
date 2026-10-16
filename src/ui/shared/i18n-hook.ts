/** @jsxImportSource preact */
/**
 * Hook Preact pour i18n.
 *
 * Séparé de i18n.ts pour que ce dernier reste pur (aucun import preact/hooks
 * au niveau module) et puisse passer deno test sans environnement DOM.
 *
 * useT() force un re-rendu à chaque changement de contexte hôte (locale,
 * thème, …) — t() lit la langue fraîche à chaque appel, donc le composant
 * voit immédiatement la nouvelle locale sans rechargement.
 */

import { useEffect, useState } from "preact/hooks";
import { subscribeHostContext } from "./host-context.ts";
import { t } from "./i18n.ts";

export type TFunction = (
  key: string,
  params?: Record<string, unknown>,
) => string;

/**
 * Hook qui retourne la fonction de traduction t() et se réabonne au
 * changement de locale via subscribeHostContext.
 *
 * @example
 *   function MyComponent() {
 *     const t = useT();
 *     return <button>{t("common.refresh")}</button>;
 *   }
 */
export function useT(): TFunction {
  // On n'a besoin que de déclencher un re-rendu — la valeur du compteur
  // n'est pas consommée par le composant.
  const [, setTick] = useState(0);
  useEffect(
    () => subscribeHostContext(() => setTick((n) => n + 1)),
    [],
  );
  return t;
}
