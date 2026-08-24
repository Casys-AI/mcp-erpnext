/**
 * La pile de navigation d'une vue — sans Preact, testée seule.
 *
 * Le niveau 1 est le contenu propre de la vue. Chaque saut empile un niveau
 * qui garde sa payload, son état d'interface (tri, page, ligne active…) et
 * la façon de le recharger. Revenir restaure sans rappeler l'outil. Le fil
 * (`crumbs`) dit quoi afficher : au-delà de trois niveaux, les intermédiaires
 * s'élident derrière « …N » ; l'origine, le précédent et le courant restent lus.
 *
 * Trois règles de plus, venues des vues qui ne rentrent pas dans le moule :
 * un saut vers un niveau déjà en pile y remonte au lieu d'empiler (`key`) ;
 * une action en profondeur marque les niveaux périmés, elle ne les recharge
 * pas (`stale`) ; l'origine garde la couleur de sa nature (`origin`).
 */

import type { Jump } from "./jumps.ts";
import type { DocumentChangeEvent } from "./document-events.ts";

export type LevelKind = "root" | "list" | "record" | "chart";

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

/**
 * La requête qui sait reconstruire une racine de viewer. Elle reprend la
 * forme `refreshRequest` des payloads sans coupler la pile à leur module.
 */
export interface ViewerRootRequest {
  toolName: string;
  arguments: Record<string, unknown>;
}

/**
 * L'état d'interface qu'un niveau garde et restaure : celui d'une liste
 * (tri, filtre, page, ligne active, chips) — le fil les décrit — et ce qui
 * ne se décrit pas (la recherche ouverte).
 */
export interface LevelUi {
  sortKey?: string | null;
  sortDir?: "asc" | "desc";
  filter?: string;
  page?: number;
  expandedId?: string | null;
  chipFilters?: Record<string, string>;
  searchOpen?: boolean;
}

export interface StaleSnapshot {
  /** Libellé court déjà consommé par l'interface, par exemple « 14:02 ». */
  at: string;
  /** Compatibilité avec l'UX existante qui met le document touché en évidence. */
  subject?: string;
  /** Référence canonique structurée, conservée pour l'UX et le diagnostic. */
  documentChange?: DocumentChangeEvent;
}

export interface NavLevel {
  id: string;
  /** Le segment du fil : « Factures », « SO-1043 ». */
  title: string;
  kind: LevelKind;
  /** Note de pied : « liées à SO-1043 ». */
  subtitle?: string;
  /** Comment (re)charger le corps. Absent pour la racine. */
  tool?: ToolCall;
  /** La payload une fois chargée — sa forme dépend de `kind`. */
  body?: unknown;
  count?: number;
  /** État d'interface propre au corps, restauré au retour. */
  ui: LevelUi;
  loading: boolean;
  error?: string;
  /** Les sauts que ce niveau propose (une fiche : ses listes, ses graphiques). */
  jumps?: Jump[];
  /** L'identité du niveau (outil + arguments) : la pile ne la répète jamais. */
  key?: string;
  /** Racine seulement : la nature du niveau 1, pour colorer l'origine du fil. */
  origin?: Exclude<LevelKind, "root">;
  /** Une action plus bas a changé ce que ce niveau montre ; à l'utilisateur d'actualiser. */
  stale?: StaleSnapshot;
}

export interface NavStack {
  levels: NavLevel[];
  /** Identité de la racine : un changement remplace toute la pile. */
  rootIdentity: string;
  /** Le prochain id : un niveau repoussé après un retour n'hérite jamais de l'ancien. */
  nextId: number;
}

export type LevelInit =
  & Omit<NavLevel, "id" | "ui" | "loading">
  & Partial<Pick<NavLevel, "ui" | "loading">>;

function levelId(seq: number, title: string): string {
  return `${seq}:${title}`;
}

export function createStack(root: LevelInit): NavStack {
  return {
    levels: [{
      ui: {},
      loading: false,
      ...root,
      id: levelId(0, root.title),
    }],
    rootIdentity: navRootIdentity(root),
    nextId: 1,
  };
}

/**
 * L'identité métier d'une racine. Une clé explicite prime ; sinon le chrome
 * stable suffit. Le corps, le compte et l'état d'interface n'en font pas
 * partie : leur actualisation ne doit pas jeter le parcours ouvert.
 */
export function navRootIdentity(root: LevelInit): string {
  if (root.key) return `key:${root.key}`;
  return `root:${
    stableJson({
      title: root.title,
      kind: root.kind,
      origin: root.origin ?? null,
      tool: root.tool ?? null,
    })
  }`;
}

/** Garde la pile pour la même racine ; repart proprement pour une autre. */
export function reconcileRoot(stack: NavStack, root: LevelInit): NavStack {
  return stack.rootIdentity === navRootIdentity(root)
    ? stack
    : createStack(root);
}

export function pushLevel(stack: NavStack, level: LevelInit): NavStack {
  return {
    levels: [...stack.levels, {
      ui: {},
      loading: false,
      ...level,
      id: levelId(stack.nextId, level.title),
    }],
    rootIdentity: stack.rootIdentity,
    nextId: stack.nextId + 1,
  };
}

/** Un niveau en arrière ; à la racine, rien ne bouge. */
export function popLevel(stack: NavStack): NavStack {
  if (stack.levels.length <= 1) return stack;
  return { ...stack, levels: stack.levels.slice(0, -1) };
}

/** Saut direct vers un parent : tout ce qui est au-dessus disparaît. */
export function popToLevel(stack: NavStack, index: number): NavStack {
  if (index < 0 || index >= stack.levels.length - 1) return stack;
  return { ...stack, levels: stack.levels.slice(0, index + 1) };
}

export function patchLevel(
  stack: NavStack,
  id: string,
  patch: Partial<Omit<NavLevel, "id">>,
): NavStack {
  if (!stack.levels.some((level) => level.id === id)) return stack;
  return {
    ...stack,
    levels: stack.levels.map((level) =>
      level.id === id ? { ...level, ...patch } : level
    ),
  };
}

export function patchLevelUi(
  stack: NavStack,
  id: string,
  ui: Partial<LevelUi>,
): NavStack {
  const level = stack.levels.find((l) => l.id === id);
  if (!level) return stack;
  return patchLevel(stack, id, { ui: { ...level.ui, ...ui } });
}

export function currentLevel(stack: NavStack): NavLevel {
  return stack.levels[stack.levels.length - 1];
}

/** L'identité d'un niveau : son outil et ses arguments, clés triées. */
export function levelKey(tool: ToolCall): string {
  return `${tool.name}:${stableJson(tool.args)}`;
}

/**
 * Clé métier d'un viewer racine.
 *
 * La requête de refresh est l'identité la plus précise : elle distingue par
 * exemple deux stocks filtrés sur des entrepôts différents, même si leur
 * titre est identique. Sans elle, `identity` porte l'identité intrinsèque
 * disponible dans la payload (doctype, boardId, nom de pièce). Les libellés,
 * lignes, totaux et timestamps restent volontairement hors de la clé dès
 * qu'une requête existe afin qu'un auto-refresh conserve la pile.
 */
export function viewerRootKey(
  viewer: string,
  request?: ViewerRootRequest,
  identity?: Record<string, unknown>,
): string {
  return `${viewer}:${
    stableJson(
      request
        ? { request: { name: request.toolName, args: request.arguments } }
        : { identity: identity ?? null },
    )
  }`;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${
      Object.keys(value as Record<string, unknown>).sort().map((k) =>
        `${JSON.stringify(k)}:${
          stableJson((value as Record<string, unknown>)[k])
        }`
      ).join(",")
    }}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** L'index du niveau qui porte déjà cette identité, ou -1. */
export function findLevelByKey(stack: NavStack, key: string): number {
  return stack.levels.findIndex((level) => level.key === key);
}

/**
 * Une action vient de changer `subject` : tous les niveaux ouverts montrent
 * des valeurs d'avant. On les marque, on ne les recharge pas.
 */
export function markStale(
  stack: NavStack,
  at: string,
  subject?: string,
): NavStack {
  return {
    ...stack,
    levels: stack.levels.map((level) => ({ ...level, stale: { at, subject } })),
  };
}

/**
 * Un document canonique vient de changer. Tant que les dépendances métier des
 * niveaux ne sont pas déclarées, chaque snapshot ouvert est potentiellement
 * concerné : on les marque donc tous sans toucher à leur corps ni à leur UI.
 */
export function reportDocumentChange(
  stack: NavStack,
  at: string,
  event: DocumentChangeEvent,
): NavStack {
  // La copie garde la pile indépendante d'un objet possédé par l'émetteur.
  const documentChange: DocumentChangeEvent = { ...event };
  return {
    ...stack,
    levels: stack.levels.map((level) => ({
      ...level,
      stale: { at, subject: event.name, documentChange },
    })),
  };
}

export function clearStale(stack: NavStack, id: string): NavStack {
  const level = stack.levels.find((l) => l.id === id);
  if (!level || !level.stale) return stack;
  const { stale: _stale, ...rest } = level;
  return {
    ...stack,
    levels: stack.levels.map((l) => (l.id === id ? rest : l)),
  };
}

export interface Crumb {
  level: NavLevel;
  index: number;
}

export interface Crumbs {
  depth: number;
  /** Au niveau 1 la barre n'existe pas. */
  showBar: boolean;
  /** Les intermédiaires, élidés derrière « …N » dès quatre niveaux — jamais l'origine. */
  elided: Crumb[];
  /** Deux parents au plus : l'origine et le précédent. */
  parents: Crumb[];
  /** Ordre visuel des ancêtres : origine, ellipse éventuelle, précédent. */
  trail: Array<Crumb | { elided: Crumb[] }>;
  current: Crumb;
}

export function crumbs(stack: NavStack): Crumbs {
  const levels = stack.levels.map((level, index) => ({ level, index }));
  const depth = levels.length;
  const current = levels[depth - 1];
  if (depth <= 1) {
    return {
      depth,
      showBar: false,
      elided: [],
      parents: [],
      trail: [],
      current,
    };
  }
  if (depth <= 3) {
    const parents = levels.slice(0, depth - 1);
    return {
      depth,
      showBar: true,
      elided: [],
      parents,
      trail: parents,
      current,
    };
  }
  // L'origine reste le premier segment, même à cinq niveaux : c'est elle
  // qui dit d'où l'on vient quand tout le reste est tabulaire.
  const elided = levels.slice(1, depth - 2);
  const parents = [levels[0], levels[depth - 2]];
  return {
    depth,
    showBar: true,
    elided,
    parents,
    trail: [parents[0], { elided }, parents[1]],
    current,
  };
}
