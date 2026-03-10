export interface UiRefreshRequestData {
  toolName: string;
  arguments: Record<string, unknown>;
}

export interface ToolResultPayload {
  content?: Array<{ type: string; text?: string }>;
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
    return "Refresh timed out";
  }

  return "Refresh failed";
}

export function extractToolResultText(result: ToolResultPayload): string | null {
  return result.content?.find((entry) => entry.type === "text")?.text ?? null;
}
