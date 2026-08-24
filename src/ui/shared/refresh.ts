import { t } from "./i18n.ts";

export interface UiRefreshRequestData {
  toolName: string;
  arguments: Record<string, unknown>;
}

export interface ToolResultPayload {
  content?: Array<{ type: string; text?: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export interface UiRefreshableData {
  refreshRequest?: UiRefreshRequestData;
}

export interface UiRefreshGate {
  request: UiRefreshRequestData | null;
  visibilityState: string;
  refreshInFlight: boolean;
  now: number;
  lastRefreshStartedAt: number;
  minIntervalMs: number;
}

/**
 * Séquence des refreshs racine.
 *
 * `generation` invalide les réponses anciennes, `inFlight` identifie l'appel
 * physique courant, et `pendingForced` coalesce les relectures obligatoires
 * demandées pendant cet appel.
 */
export interface UiRefreshSequence {
  generation: number;
  inFlight: number | null;
  pendingForced: boolean;
}

export interface UiRefreshStart {
  state: UiRefreshSequence;
  generation: number | null;
}

export interface UiRefreshCompletion {
  state: UiRefreshSequence;
  /** La réponse appartient toujours à la génération visible. */
  accept: boolean;
  /** Une relecture forcée doit être tentée dès que les autres gardes l'autorisent. */
  runPending: boolean;
}

export function createUiRefreshSequence(): UiRefreshSequence {
  return { generation: 0, inFlight: null, pendingForced: false };
}

/**
 * Réserve une génération, ou met une demande forcée en attente.
 * Une demande forcée invalide immédiatement l'appel déjà en vol : sa réponse
 * ne peut donc pas remettre des valeurs antérieures à la mutation.
 */
export function beginUiRefresh(
  state: UiRefreshSequence,
  options: { force?: boolean } = {},
): UiRefreshStart {
  if (state.inFlight !== null) {
    if (!options.force) return { state, generation: null };
    return {
      state: {
        ...state,
        generation: state.generation + 1,
        pendingForced: true,
      },
      generation: null,
    };
  }

  const generation = state.generation + 1;
  return {
    state: { generation, inFlight: generation, pendingForced: false },
    generation,
  };
}

/** Toute payload spontanée de l'hôte prime sur les refreshs déjà partis. */
export function invalidateUiRefresh(
  state: UiRefreshSequence,
): UiRefreshSequence {
  return { ...state, generation: state.generation + 1 };
}

/** Termine l'appel physique sans perdre une relecture forcée coalescée. */
export function completeUiRefresh(
  state: UiRefreshSequence,
  generation: number,
): UiRefreshCompletion {
  if (state.inFlight !== generation) {
    return { state, accept: false, runPending: false };
  }
  return {
    state: { ...state, inFlight: null },
    accept: state.generation === generation,
    runPending: state.pendingForced,
  };
}

export function canRequestUiRefresh(
  gate: UiRefreshGate,
  options: { ignoreInterval?: boolean } = {},
): boolean {
  if (!gate.request) {
    return false;
  }

  if (gate.visibilityState !== "visible" || gate.refreshInFlight) {
    return false;
  }

  if (options.ignoreInterval) {
    return true;
  }

  return gate.now - gate.lastRefreshStartedAt >= gate.minIntervalMs;
}

export function resolveUiRefreshRequest<T extends UiRefreshableData>(
  payload: T | null,
  fallback: UiRefreshRequestData | null,
): UiRefreshRequestData | null {
  return payload?.refreshRequest ?? fallback;
}

export function normalizeUiRefreshFailureMessage(cause: unknown): string {
  if (cause instanceof Error && /timed? out/i.test(cause.message)) {
    return t("common.error.refresh_timeout");
  }

  return t("common.error.refresh_failed");
}

export function extractToolResultText(
  result: ToolResultPayload,
): string | null {
  if (result.structuredContent) {
    return JSON.stringify(result.structuredContent);
  }
  return result.content?.find((entry) => entry.type === "text")?.text ?? null;
}
