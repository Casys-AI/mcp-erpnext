/**
 * Le contexte que l'hôte MCP donne à la vue — thème, tactile, locale, taille.
 *
 * Le protocole ext-apps envoie tout cela dans `McpUiHostContext`, à la
 * connexion puis à chaque changement. Jusqu'ici on le devinait depuis le
 * navigateur : `matchMedia` pour le thème et le pointeur, un ResizeObserver
 * pour la largeur. Or la vue tourne dans une iframe : ces sondes mesurent
 * l'appareil qui affiche la fenêtre, pas le contexte que l'hôte lui réserve.
 * Un hôte de bureau qui rend une vue dans un panneau tactile, et la sonde
 * ment. L'hôte, lui, sait — il n'a pas à être deviné.
 *
 * Ordre de priorité partout : l'hôte, puis le navigateur en repli, puis une
 * surcharge d'URL (`?theme=`, `?layout=`) pour la relecture hors hôte.
 *
 * Un seul magasin pour les sept vues : chacune crée sa propre `App`, mais les
 * hooks de thème et de mise en page vivent dans shared/ et n'ont pas accès à
 * cette instance. Le viewer alimente le magasin, les hooks s'y abonnent.
 *
 * Ce fichier est le magasin PUR — ni Preact ni le SDK ext-apps : il se teste
 * sous Deno et se réutilise hors d'une vue. Le hook et le branchement sur
 * `App` vivent dans host-context-hook.ts, qui importe celui-ci.
 */

import { setLocaleSource } from "./format.ts";
import { setLangSource } from "./i18n.ts";

/** Le sous-ensemble du contexte hôte que les vues consomment. */
export interface HostContext {
  theme?: "light" | "dark";
  locale?: string;
  timeZone?: string;
  platform?: "web" | "desktop" | "mobile";
  deviceCapabilities?: { touch?: boolean; hover?: boolean };
  containerDimensions?: {
    width?: number;
    maxWidth?: number;
    height?: number;
    maxHeight?: number;
  };
}

type Listener = (context: HostContext) => void;

let current: HostContext = {};
const listeners = new Set<Listener>();

// Les formateurs lisent la locale ici sans dépendre de ce module.
setLocaleSource(() => current.locale);
// Le moteur i18n lit la locale sur le même patron.
setLangSource(() => current.locale);

/**
 * Fusionne, n'écrase jamais.
 *
 * Chaque notification `host-context-changed` ne porte que les champs qui ont
 * bougé. Remplacer l'objet entier ferait perdre la locale reçue à la
 * connexion dès qu'un changement de thème arrive.
 */
export function mergeHostContext(patch: HostContext | undefined): void {
  if (!patch) return;
  current = { ...current, ...patch };
  for (const listener of listeners) listener(current);
}

export function getHostContext(): HostContext {
  return current;
}

export function subscribeHostContext(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
