import type {
  ActiveContextLocalResource,
  ContextSelectionItem,
} from "../active-context.ts";
import type {
  SelectionGroupConfig,
  SelectionGroupMemberInput,
  SelectionState,
} from "../selection-projection.ts";
import type {
  ClickIntent,
  ClickIntentArbiter,
  ClickIntentCommit,
  ClickIntentKeyEvent,
  ClickIntentRevert,
  ClickIntentSingleResult,
} from "../click-intent.ts";

import { detailOnClickIntent } from "../click-intent.ts";

export interface DocumentContextController {
  supported: boolean;
  pending: boolean;
  selection: SelectionState;
  toggleGroupMember: (
    config: Omit<SelectionGroupConfig, "scopeKey">,
    member: SelectionGroupMemberInput,
  ) => Promise<unknown>;
  setGroupMembers: (
    config: Omit<SelectionGroupConfig, "scopeKey">,
    members: readonly SelectionGroupMemberInput[],
  ) => Promise<unknown>;
  addGroupMembers: (
    config: Omit<SelectionGroupConfig, "scopeKey">,
    members: readonly SelectionGroupMemberInput[],
  ) => Promise<unknown>;
  removeGroupMembers: (
    config: Omit<SelectionGroupConfig, "scopeKey">,
    names: readonly string[],
  ) => Promise<unknown>;
  reconcileGroup: (
    reconcileKey: string,
    candidates: readonly SelectionGroupMemberInput[],
    options?: { complete?: boolean },
  ) => Promise<unknown>;
  isGroupMemberSelected: (reconcileKey: string, name: string) => boolean;
  activate: (item: ContextSelectionItem) => Promise<unknown>;
  activateReversible: (
    item: ContextSelectionItem,
  ) => Promise<ClickIntentRevert | undefined>;
  toggle: (item: ContextSelectionItem) => Promise<unknown>;
  toggleReversible: (item: ContextSelectionItem) => ClickIntentCommit;
  reconcileDocument: (
    documentId: string,
    candidates: readonly ContextSelectionItem[],
  ) => Promise<unknown>;
  reconcileView: (
    reconcileKey: string,
    candidates: readonly ContextSelectionItem[],
  ) => Promise<unknown>;
  isSelected: (item: ContextSelectionItem) => boolean;
  canShareResource: (resource: ActiveContextLocalResource) => boolean;
}

/** Cible directe, sur le même contrat clic/clavier que les données des charts. */
export interface ContextInteractionTarget {
  label: string;
  /** Libelle brut du chevron, distinct de l'instruction portee par la ligne. */
  detailLabel?: string;
  /** Présence dans le panier de contexte ; absente si ce canal n'existe pas. */
  selected?: boolean;
  /** État du rail d'actions distinct de la sélection de contexte. */
  expanded?: boolean;
  controls?: string;
  /** Action exclusive du double-clic / de la touche Entree. */
  onDoubleActivate?: () => void;
  doublePolicy?: ClickIntent["doublePolicy"];
  clickAction?: "detail";
  onActivate: () => ClickIntentSingleResult;
}

interface ContextInteractionIntent {
  arbiter: ClickIntentArbiter;
  key: string;
}

interface ContextInteractionProps {
  role: "button";
  tabIndex: number;
  "aria-pressed"?: boolean;
  "aria-expanded"?: boolean;
  "aria-controls"?: string;
  "aria-keyshortcuts"?: string;
  "aria-label": string;
  title: string;
  onClick: (event?: { detail?: number }) => void;
  onDblClick?: () => void;
  onKeyDown: (event: ClickIntentKeyEvent) => void;
}

/** Rend la donnée elle-même activable, sans ajouter un bouton d'interface. */
export function contextInteractionProps(
  target: ContextInteractionTarget,
  intent?: ContextInteractionIntent,
): ContextInteractionProps;
export function contextInteractionProps(
  target: undefined,
  intent?: ContextInteractionIntent,
): Record<string, never>;
export function contextInteractionProps(
  target: ContextInteractionTarget | undefined,
  intent?: ContextInteractionIntent,
): ContextInteractionProps | Record<string, never>;
export function contextInteractionProps(
  target: ContextInteractionTarget | undefined,
  intent?: ContextInteractionIntent,
): ContextInteractionProps | Record<string, never> {
  if (!target) return {};
  const detailOnly = target.clickAction === "detail";
  let clickIntent: ClickIntent | null = null;
  if (intent && detailOnly) {
    clickIntent = detailOnClickIntent(intent.key, target.onActivate);
  } else if (intent && target.onDoubleActivate) {
    clickIntent = {
      key: intent.key,
      onSingle: target.onActivate,
      onDouble: target.onDoubleActivate,
      doublePolicy: target.doublePolicy,
    };
  }
  const action = clickIntent;
  return {
    role: "button" as const,
    tabIndex: 0,
    ...(!detailOnly && target.selected !== undefined
      ? { "aria-pressed": target.selected }
      : {}),
    ...(target.expanded !== undefined
      ? { "aria-expanded": target.expanded }
      : {}),
    ...(target.controls ? { "aria-controls": target.controls } : {}),
    // Espace reste l'activation primaire de la donnee. Seule Entree est une
    // voie clavier supplementaire vers le detail et merite d'etre annoncee.
    ...(action && !detailOnly ? { "aria-keyshortcuts": "Enter" } : {}),
    "aria-label": target.label,
    title: target.label,
    onClick: action
      ? (event) => intent!.arbiter.click(action, event?.detail ?? 1)
      : () => target.onActivate(),
    ...(action && target.onDoubleActivate
      ? {
        onDblClick: () => intent!.arbiter.doubleClick(action),
      }
      : {}),
    onKeyDown: (event: ClickIntentKeyEvent) => {
      if (action) {
        intent!.arbiter.keyDown(action, event);
        return;
      }
      if (event.repeat || (event.key !== "Enter" && event.key !== " ")) return;
      event.preventDefault();
      target.onActivate();
    },
  };
}
