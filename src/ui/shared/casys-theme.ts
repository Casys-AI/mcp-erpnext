/**
 * Applique la charte clair/sombre à `<html data-theme>`.
 *
 * Trois sources, par priorité décroissante :
 *   1. la surcharge d'URL `?theme=` — pour relire une vue hors hôte ;
 *   2. le thème que l'hôte MCP déclare dans son contexte ;
 *   3. la préférence système du navigateur, en dernier repli.
 *
 * La surcharge passe devant l'hôte à dessein : quand elle est là, c'est que
 * quelqu'un relit la vue dans un navigateur, et il veut voir ce qu'il a
 * demandé. Dans l'hôte, elle est absente et l'hôte décide.
 */

import { getHostContext, subscribeHostContext } from "./host-context-hook";

export type CasysTheme = "light" | "dark";

function isTheme(value: unknown): value is CasysTheme {
  return value === "light" || value === "dark";
}

function systemTheme(): CasysTheme {
  return typeof matchMedia === "function" &&
      matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function resolveTheme(override?: CasysTheme | null): CasysTheme {
  if (isTheme(override)) return override;
  const fromHost = getHostContext().theme;
  if (isTheme(fromHost)) return fromHost;
  return systemTheme();
}

/**
 * Pose le thème et le maintient.
 *
 * Sans surcharge, la vue suit l'hôte : un changement de thème côté client
 * arrive par `host-context-changed` et bascule la vue sans rechargement.
 * Avec surcharge, l'abonnement n'est pas posé — elle gagne, point.
 */
export function applyCasysTheme(override?: CasysTheme | null): CasysTheme {
  const resolved = resolveTheme(override);
  document.documentElement.dataset.theme = resolved;

  if (!isTheme(override)) {
    subscribeHostContext((context) => {
      if (isTheme(context.theme)) {
        document.documentElement.dataset.theme = context.theme;
      }
    });
  }
  return resolved;
}

export function themeFromSearch(search = location.search): CasysTheme | null {
  const value = new URLSearchParams(search).get("theme");
  return isTheme(value) ? value : null;
}
