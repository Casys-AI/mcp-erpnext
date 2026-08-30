/**
 * Contexte actif partagé avec le modèle.
 *
 * Un viewer peut désigner quelques points comme contexte actif. Chaque mise à
 * jour remplace le snapshot complet en un appel ; elle ne déclenche jamais de
 * message et ne contient aucune consigne destinée au modèle.
 */

interface TextBlock {
  type: "text";
  text: string;
}

interface EmbeddedResourceBlock {
  type: "resource";
  resource: {
    uri: string;
    mimeType: string;
    blob: string;
  };
}

type ActiveContextContentBlock = TextBlock | EmbeddedResourceBlock;

interface ContextModalities {
  text?: unknown;
  resource?: unknown;
  structuredContent?: unknown;
}

export interface ActiveContextHostCapabilities {
  updateModelContext?: ContextModalities;
}

export interface ActiveContextHost {
  getHostCapabilities(): ActiveContextHostCapabilities | undefined;
  updateModelContext(params: {
    content?: ActiveContextContentBlock[];
    structuredContent?: Record<string, unknown>;
  }): Promise<unknown>;
}

/** Ressource binaire locale, jamais sérialisée dans le snapshot métier. */
export interface ActiveContextLocalResource {
  uri: string;
  mimeType: string;
  bytes: Uint8Array;
}

/** Point unique choisi par l'utilisateur dans un viewer. */
export interface ContextSelectionItem {
  /** Identité stable dans la vue, jamais un prompt. */
  id: string;
  /** Titre de la vue qui donne sa provenance au point. */
  view: string;
  /** Identité interne du niveau qui réconcilie ce point, jamais sérialisée. */
  reconcileKey?: string;
  /** Libellé visible du point. */
  label: string;
  /** Valeur visible associée, si elle existe. */
  value?: string;
  /** Pièce jointe locale optionnelle pour les hôtes acceptant `resource`. */
  resource?: ActiveContextLocalResource;
}

/** Provenance interne : elle sert à ne réconcilier que la racine rafraîchie. */
export interface ActiveContextSelection {
  scopeKey: string;
  item: ContextSelectionItem;
}

/** Mutation locale rejouable du panier, utilisée pour annuler un seul clic. */
export interface ActiveContextMutation {
  id: number;
  active: boolean;
  /** Vrai tant que l'arbitre de clic peut encore demander son annulation. */
  reversible: boolean;
  apply: (
    current: readonly ActiveContextSelection[],
  ) => ActiveContextSelection[];
}

export interface ActiveContextAddResult {
  selections: ActiveContextSelection[];
  /** Point sorti de la borne, null lors d'une simple actualisation. */
  evicted: ActiveContextSelection | null;
}

export const ACTIVE_CONTEXT_SCHEMA = "casys.erpnext/active-context" as const;
export const ACTIVE_CONTEXT_VERSION = 2 as const;
export const ACTIVE_CONTEXT_MAX_ITEMS = 8;
export const ACTIVE_CONTEXT_MAX_RESOURCE_BYTES = 5 * 1024 * 1024;

/**
 * Bornes en caractères, choisies au-dessus des identifiants ERPNext usuels.
 * Le snapshot reste ainsi compact et ne peut pas embarquer un payload métier.
 */
export const ACTIVE_CONTEXT_LIMITS = {
  id: 180,
  view: 120,
  label: 240,
  value: 240,
  resourceUri: 1024,
  resourceMimeType: 160,
} as const;

export type ActiveContextSnapshotItem = Pick<
  ContextSelectionItem,
  "id" | "view" | "label" | "value"
>;

export interface ActiveContextSnapshot extends Record<string, unknown> {
  schema: typeof ACTIVE_CONTEXT_SCHEMA;
  version: typeof ACTIVE_CONTEXT_VERSION;
  items: ActiveContextSnapshotItem[];
}

export type ActiveContextResult =
  | "shared"
  | "cleared"
  | "unsupported"
  | "error";

type ContextModality = "structuredContent" | "text";

export interface ActiveContextQueue {
  run<T>(operation: () => Promise<T>): Promise<T>;
}

function advertised(value: unknown): boolean {
  return typeof value === "object" && value !== null;
}

function contextModality(
  caps: ActiveContextHostCapabilities | undefined,
): ContextModality | null {
  if (advertised(caps?.updateModelContext?.structuredContent)) {
    return "structuredContent";
  }
  if (advertised(caps?.updateModelContext?.text)) return "text";
  return null;
}

/** L'hôte sait remplacer le panier actif sous une modalité sûre. */
export function canReplaceActiveContext(
  caps: ActiveContextHostCapabilities | undefined,
): boolean {
  return contextModality(caps) !== null;
}

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x1f || codePoint === 0x7f) return true;
  }
  return false;
}

function validResourceUri(uri: string): boolean {
  const normalized = uri.trim();
  return normalized.length > 0 &&
    normalized.length <= ACTIVE_CONTEXT_LIMITS.resourceUri &&
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(normalized) &&
    !hasControlCharacter(normalized);
}

function validResourceMimeType(mimeType: string): boolean {
  const normalized = mimeType.trim();
  const baseType = normalized.split(";", 1)[0].trim();
  return normalized.length <= ACTIVE_CONTEXT_LIMITS.resourceMimeType &&
    /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/.test(baseType) &&
    !hasControlCharacter(normalized);
}

function validLocalResource(
  resource: ActiveContextLocalResource | undefined,
): resource is ActiveContextLocalResource {
  return resource !== undefined && resource.bytes instanceof Uint8Array &&
    resource.bytes.byteLength > 0 &&
    resource.bytes.byteLength <= ACTIVE_CONTEXT_MAX_RESOURCE_BYTES &&
    validResourceUri(resource.uri) && validResourceMimeType(resource.mimeType);
}

/** Vrai seulement si modalité, ressource et bornes mémoire sont toutes valides. */
export function canShareActiveContextResource(
  caps: ActiveContextHostCapabilities | undefined,
  resource: ActiveContextLocalResource | undefined,
): boolean {
  return contextModality(caps) !== null &&
    advertised(caps?.updateModelContext?.resource) &&
    validLocalResource(resource);
}

function rejected(result: unknown): boolean {
  return typeof result === "object" && result !== null &&
    "isError" in result && result.isError === true;
}

/** Trouve la version courante du même point, ou null s'il a disparu. */
export function reconcileActiveContextItem(
  current: ContextSelectionItem,
  candidates: readonly ContextSelectionItem[],
): ContextSelectionItem | null {
  return candidates.find((candidate) => candidate.id === current.id) ?? null;
}

/** Vrai si la provenance et la valeur visibles n'ont pas changé. */
export function sameActiveContextItem(
  left: ContextSelectionItem,
  right: ContextSelectionItem,
): boolean {
  return left.id === right.id && left.view === right.view &&
    left.reconcileKey === right.reconcileKey &&
    left.label === right.label && left.value === right.value &&
    sameLocalResource(left.resource, right.resource);
}

function sameLocalResource(
  left: ActiveContextLocalResource | undefined,
  right: ActiveContextLocalResource | undefined,
): boolean {
  if (left === right) return true;
  if (
    !left || !right || left.uri !== right.uri ||
    left.mimeType !== right.mimeType ||
    left.bytes.byteLength !== right.bytes.byteLength
  ) return false;
  if (left.bytes === right.bytes) return true;
  for (let index = 0; index < left.bytes.byteLength; index += 1) {
    if (left.bytes[index] !== right.bytes[index]) return false;
  }
  return true;
}

function withoutLocalResource(
  item: ContextSelectionItem,
): ContextSelectionItem {
  const { resource: _resource, ...snapshotItem } = item;
  return snapshotItem;
}

function selectionWithoutLocalResource(
  selection: ActiveContextSelection,
): ActiveContextSelection {
  return selection.item.resource
    ? { ...selection, item: withoutLocalResource(selection.item) }
    : selection;
}

function normalizeSelectionResources(
  selections: readonly ActiveContextSelection[],
): ActiveContextSelection[] {
  let newestValidResourceIndex = -1;
  for (let index = selections.length - 1; index >= 0; index -= 1) {
    if (validLocalResource(selections[index].item.resource)) {
      newestValidResourceIndex = index;
      break;
    }
  }
  return selections.map((selection, index) =>
    index === newestValidResourceIndex
      ? selection
      : selectionWithoutLocalResource(selection)
  );
}

function sameSelection(
  left: ActiveContextSelection,
  right: ActiveContextSelection,
): boolean {
  return left.scopeKey === right.scopeKey &&
    sameActiveContextItem(left.item, right.item);
}

export function sameActiveContextSelections(
  left: readonly ActiveContextSelection[],
  right: readonly ActiveContextSelection[],
): boolean {
  return left.length === right.length &&
    left.every((selection, index) => sameSelection(selection, right[index]));
}

/**
 * Ajoute ou actualise un point de la racine courante. Un point réactivé devient
 * le plus récent ; au-delà de la borne, le plus ancien sort du snapshot.
 */
export function addActiveContextSelectionWithEviction(
  current: readonly ActiveContextSelection[],
  scopeKey: string,
  item: ContextSelectionItem,
): ActiveContextAddResult {
  const normalizedCurrent = normalizeSelectionResources(current);
  const previousItem = normalizedCurrent.find((selection) =>
    selection.scopeKey === scopeKey && selection.item.id === item.id
  )?.item;
  const incomingResource = validLocalResource(item.resource)
    ? item.resource
    : undefined;
  const retainedResource = incomingResource ?? previousItem?.resource;
  const normalizedItem = item.resource === retainedResource ? item : {
    ...withoutLocalResource(item),
    ...(retainedResource ? { resource: retainedResource } : {}),
  };
  const next = normalizedCurrent
    .filter((selection) =>
      selection.scopeKey !== scopeKey || selection.item.id !== item.id
    )
    .map((selection) =>
      incomingResource ? selectionWithoutLocalResource(selection) : selection
    );
  next.push({ scopeKey, item: normalizedItem });
  const overflow = Math.max(0, next.length - ACTIVE_CONTEXT_MAX_ITEMS);
  return {
    selections: next.slice(-ACTIVE_CONTEXT_MAX_ITEMS),
    evicted: overflow > 0 ? next[overflow - 1] : null,
  };
}

export function addActiveContextSelection(
  current: readonly ActiveContextSelection[],
  scopeKey: string,
  item: ContextSelectionItem,
): ActiveContextSelection[] {
  return addActiveContextSelectionWithEviction(current, scopeKey, item)
    .selections;
}

/** Isole la racine courante avant un remplacement : deux scopes ne se mélangent jamais. */
export function activeContextSelectionsForScope(
  current: readonly ActiveContextSelection[],
  scopeKey: string,
): ActiveContextSelection[] {
  return normalizeSelectionResources(
    current.filter((selection) => selection.scopeKey === scopeKey),
  );
}

/** Retire exactement un point, sans toucher aux autres racines. */
export function removeActiveContextSelection(
  current: readonly ActiveContextSelection[],
  target: ActiveContextSelection,
): ActiveContextSelection[] {
  return normalizeSelectionResources(
    current.filter((selection) =>
      selection.scopeKey !== target.scopeKey ||
      selection.item.id !== target.item.id
    ),
  );
}

/**
 * Rejoue les mutations confirmées dans leur ordre. Désactiver une entrée puis
 * rejouer le journal annule cette opération précise sans restaurer un ancien
 * snapshot qui écraserait les clics plus récents.
 */
export function replayActiveContextMutations(
  mutations: readonly ActiveContextMutation[],
  base: readonly ActiveContextSelection[] = [],
): ActiveContextSelection[] {
  let current: ActiveContextSelection[] = base.slice();
  for (const mutation of mutations) {
    if (mutation.active) current = mutation.apply(current);
  }
  return current;
}

export interface ActiveContextMutationCompaction {
  base: ActiveContextSelection[];
  mutations: ActiveContextMutation[];
}

/**
 * Plie le préfixe qui ne peut plus être annulé dans un snapshot borné. Les
 * closures — et leurs éventuelles ressources binaires — sortent ainsi du
 * journal dès la fin de la fenêtre de double-clic.
 */
export function compactActiveContextMutations(
  base: readonly ActiveContextSelection[],
  mutations: readonly ActiveContextMutation[],
): ActiveContextMutationCompaction {
  const firstReversible = mutations.findIndex((mutation) =>
    mutation.reversible
  );
  const compactCount = firstReversible === -1
    ? mutations.length
    : firstReversible;
  if (compactCount === 0) {
    return { base: base.slice(), mutations: mutations.slice() };
  }
  return {
    base: replayActiveContextMutations(
      mutations.slice(0, compactCount),
      base,
    ),
    mutations: mutations.slice(compactCount),
  };
}

/**
 * Actualise uniquement les points de `scopeKey`. Les autres racines restent
 * intactes ; dans la racine rafraîchie, un id absent est retiré.
 */
export function reconcileActiveContextSelections(
  current: readonly ActiveContextSelection[],
  scopeKey: string,
  candidates: readonly ContextSelectionItem[],
): ActiveContextSelection[] {
  return reconcileActiveContextSelectionSubset(
    current,
    scopeKey,
    candidates,
    () => true,
  );
}

/**
 * Réconcilie uniquement les points produits par une vue nommée.
 *
 * Une racine et ses niveaux imbriqués partagent le même `scopeKey`, mais pas
 * nécessairement le même jeu de données. Un refresh du chart racine ne doit
 * donc jamais supprimer les sélections d'une liste ou d'une fiche ouverte.
 */
export function reconcileActiveContextViewSelections(
  current: readonly ActiveContextSelection[],
  scopeKey: string,
  reconcileKey: string,
  candidates: readonly ContextSelectionItem[],
): ActiveContextSelection[] {
  const itemReconcileKey = (item: ContextSelectionItem) =>
    item.reconcileKey ?? item.view;
  return reconcileActiveContextSelectionSubset(
    current,
    scopeKey,
    candidates.filter((candidate) =>
      itemReconcileKey(candidate) === reconcileKey
    ),
    (id) =>
      current.some((selection) =>
        selection.scopeKey === scopeKey && selection.item.id === id &&
        itemReconcileKey(selection.item) === reconcileKey
      ),
  );
}

/**
 * Réconcilie une seule fiche dans une racine de liste.
 *
 * L'id de la fiche et ses ids `:row:` forment un sous-ensemble fermé : les
 * lignes disparues en sortent, tandis que les autres fiches et pièces jointes
 * déjà sélectionnées dans la même racine restent intactes.
 */
export function reconcileActiveContextDocumentSelections(
  current: readonly ActiveContextSelection[],
  scopeKey: string,
  documentId: string,
  candidates: readonly ContextSelectionItem[],
): ActiveContextSelection[] {
  const rowPrefix = `${documentId}:row:`;
  const belongsToDocument = (id: string) =>
    id === documentId || id.startsWith(rowPrefix);
  return reconcileActiveContextSelectionSubset(
    current,
    scopeKey,
    candidates.filter((candidate) => belongsToDocument(candidate.id)),
    belongsToDocument,
  );
}

function reconcileActiveContextSelectionSubset(
  current: readonly ActiveContextSelection[],
  scopeKey: string,
  candidates: readonly ContextSelectionItem[],
  belongsToSubset: (id: string) => boolean,
): ActiveContextSelection[] {
  const byId = new Map(
    candidates.map((candidate) => [candidate.id, candidate]),
  );
  const next: ActiveContextSelection[] = [];
  let changed = false;

  for (const selection of current) {
    if (
      selection.scopeKey !== scopeKey ||
      !belongsToSubset(selection.item.id)
    ) {
      next.push(selection);
      continue;
    }
    const candidate = byId.get(selection.item.id);
    if (!candidate) {
      changed = true;
      continue;
    }
    const refreshedItem = selection.item.resource && !candidate.resource
      ? { ...candidate, resource: selection.item.resource }
      : candidate;
    const refreshed = { scopeKey, item: refreshedItem };
    if (!sameSelection(selection, refreshed)) changed = true;
    next.push(refreshed);
  }

  const normalized = normalizeSelectionResources(next);
  if (normalized.some((selection, index) => selection !== next[index])) {
    changed = true;
  }

  return changed ? normalized : current.slice();
}

/**
 * Sérialise les remplacements : une ancienne réponse lente ne peut ainsi
 * repasser après un clic plus récent dans le contexte distant.
 */
export function createActiveContextQueue(): ActiveContextQueue {
  let tail: Promise<void> = Promise.resolve();
  return {
    run<T>(operation: () => Promise<T>): Promise<T> {
      const result = tail.then(operation, operation);
      tail = result.then(() => undefined, () => undefined);
      return result;
    },
  };
}

function boundRequired(
  value: string,
  field: keyof typeof ACTIVE_CONTEXT_LIMITS,
): string {
  const normalized = value.trim();
  if (!normalized) throw new TypeError(`Active context ${field} is empty`);
  return Array.from(normalized).slice(0, ACTIVE_CONTEXT_LIMITS[field]).join("");
}

function boundOptional(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  return Array.from(normalized).slice(0, ACTIVE_CONTEXT_LIMITS.value).join("");
}

/** Borne un point avant son entrée dans le snapshot canonique. */
function boundItem(item: ContextSelectionItem): ActiveContextSnapshotItem {
  const value = boundOptional(item.value);
  return {
    id: boundRequired(item.id, "id"),
    view: boundRequired(item.view, "view"),
    label: boundRequired(item.label, "label"),
    ...(value === undefined ? {} : { value }),
  };
}

export function activeContextSnapshot(
  items: readonly ContextSelectionItem[],
): ActiveContextSnapshot {
  return {
    schema: ACTIVE_CONTEXT_SCHEMA,
    version: ACTIVE_CONTEXT_VERSION,
    items: items.slice(-ACTIVE_CONTEXT_MAX_ITEMS).map(boundItem),
  };
}

function activeLocalResource(
  items: readonly ContextSelectionItem[],
): ActiveContextLocalResource | undefined {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (items[index].resource) return items[index].resource;
  }
  return undefined;
}

function bytesToBase64(bytes: Uint8Array): string {
  // Multiple-of-three chunks concatenate without intermediate base64 padding.
  const chunkSize = 3 * 8192;
  const encoded: string[] = [];
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    let binary = "";
    const end = Math.min(offset + chunkSize, bytes.byteLength);
    for (let index = offset; index < end; index += 1) {
      binary += String.fromCharCode(bytes[index]);
    }
    encoded.push(btoa(binary));
  }
  return encoded.join("");
}

function embeddedResource(
  resource: ActiveContextLocalResource,
): EmbeddedResourceBlock {
  if (!validLocalResource(resource)) {
    throw new TypeError("Active context resource is invalid or too large");
  }
  return {
    type: "resource",
    resource: {
      uri: resource.uri.trim(),
      mimeType: resource.mimeType.trim(),
      blob: bytesToBase64(resource.bytes),
    },
  };
}

/**
 * Remplace le contexte du viewer par le panier complet en un seul appel.
 *
 * Le contenu structuré est préféré. Si l'hôte n'accepte que le texte, le même
 * snapshot JSON est envoyé tel quel : aucune phrase impérative n'est ajoutée.
 */
export async function replaceActiveContext(
  host: ActiveContextHost,
  items: readonly ContextSelectionItem[],
): Promise<ActiveContextResult> {
  const capabilities = host.getHostCapabilities();
  const modality = contextModality(capabilities);
  if (!modality) return "unsupported";

  try {
    const activeItems = items.slice(-ACTIVE_CONTEXT_MAX_ITEMS);
    const snapshot = activeContextSnapshot(activeItems);
    const resource = activeLocalResource(activeItems);
    const resourceBlock = resource &&
        advertised(capabilities?.updateModelContext?.resource)
      ? embeddedResource(resource)
      : undefined;
    const params = modality === "structuredContent"
      ? {
        structuredContent: snapshot,
        ...(resourceBlock ? { content: [resourceBlock] } : {}),
      }
      : {
        content: [{
          type: "text" as const,
          text: JSON.stringify(snapshot),
        }, ...(resourceBlock ? [resourceBlock] : [])],
      };
    const result = await host.updateModelContext(params);
    return rejected(result) ? "error" : "shared";
  } catch {
    return "error";
  }
}

/** Efface explicitement le snapshot actif en un seul remplacement vide. */
export async function clearActiveContext(
  host: ActiveContextHost,
): Promise<ActiveContextResult> {
  const capabilities = host.getHostCapabilities();
  const modality = contextModality(capabilities);
  if (!modality) return "unsupported";

  const resourceAdvertised = advertised(
    capabilities?.updateModelContext?.resource,
  );
  const params = modality === "structuredContent"
    ? {
      structuredContent: {},
      ...(resourceAdvertised
        ? { content: [] as ActiveContextContentBlock[] }
        : {}),
    }
    : { content: [] as TextBlock[] };

  try {
    const result = await host.updateModelContext(params);
    return rejected(result) ? "error" : "cleared";
  } catch {
    return "error";
  }
}
