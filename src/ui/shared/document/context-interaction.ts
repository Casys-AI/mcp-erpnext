import type {
  ActiveContextLocalResource,
  ContextSelectionItem,
} from "../active-context.ts";
import type {
  ClickIntentArbiter,
  ClickIntentKeyEvent,
  ClickIntentRevert,
  ClickIntentSingleResult,
} from "../click-intent.ts";

export interface DocumentContextController {
  supported: boolean;
  activate: (item: ContextSelectionItem) => Promise<unknown>;
  activateReversible: (
    item: ContextSelectionItem,
  ) => Promise<ClickIntentRevert | undefined>;
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
  const clickIntent = intent && target.onDoubleActivate
    ? {
      key: intent.key,
      onSingle: target.onActivate,
      onDouble: target.onDoubleActivate,
    }
    : null;
  return {
    role: "button" as const,
    tabIndex: 0,
    ...(target.selected !== undefined
      ? { "aria-pressed": target.selected }
      : {}),
    ...(target.expanded !== undefined
      ? { "aria-expanded": target.expanded }
      : {}),
    ...(target.controls ? { "aria-controls": target.controls } : {}),
    // Espace reste l'activation primaire de la donnee. Seule Entree est une
    // voie clavier supplementaire vers le detail et merite d'etre annoncee.
    ...(clickIntent ? { "aria-keyshortcuts": "Enter" } : {}),
    "aria-label": target.label,
    title: target.label,
    onClick: clickIntent
      ? (event) => intent!.arbiter.click(clickIntent, event?.detail ?? 1)
      : target.onActivate,
    ...(clickIntent && target.onDoubleActivate
      ? {
        onDblClick: () => intent!.arbiter.doubleClick(clickIntent),
      }
      : {}),
    onKeyDown: (event: ClickIntentKeyEvent) => {
      if (clickIntent) {
        intent!.arbiter.keyDown(clickIntent, event);
        return;
      }
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      target.onActivate();
    },
  };
}
