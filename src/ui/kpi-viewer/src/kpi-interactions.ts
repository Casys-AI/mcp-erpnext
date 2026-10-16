import type {
  ClickIntent,
  ClickIntentKeyEvent,
  ClickIntentSingleResult,
} from "../../shared/click-intent.ts";
import type { KpiData, KpiViewerError } from "./types.ts";

export function kpiCardLayout(
  layout: "wide" | "panel" | "mobile",
  width: number | null,
): "wide" | "panel" | "mobile" {
  // The wide card needs room for its metric beside a 300px trend panel.
  return layout === "wide" && width !== null && width < 680 ? "panel" : layout;
}

export function kpiErrorRetry(
  error: KpiViewerError | null,
  refreshing: boolean,
  refresh: (() => void) | undefined,
): (() => void) | undefined {
  return error?.origin === "data" && !refreshing ? refresh : undefined;
}

export function kpiContextEnabled(
  contextSupported: boolean,
  hasSparkline: boolean,
): boolean {
  return contextSupported && hasSparkline;
}

/** Without a detail action, Enter must not become a native button click. */
export function handleKpiContextKey(
  event: ClickIntentKeyEvent,
  contextEnabled: boolean,
  onToggle: () => void,
): void {
  if (event.key !== " " && event.key !== "Enter") return;
  event.preventDefault();
  if (event.key === " " && contextEnabled && !event.repeat) onToggle();
}

export function kpiKeyShortcuts(
  contextEnabled: boolean,
  hasMessage: boolean,
): string | undefined {
  if (contextEnabled) return hasMessage ? "Space Enter" : "Space";
  return hasMessage ? "Enter" : undefined;
}

/** A conversation waits for the first click's compensation and queued writes. */
export function kpiClickIntent(target: {
  key: string;
  contextEnabled: boolean;
  onSingle: () => ClickIntentSingleResult;
  onDouble: () => void;
  runConversation: (
    action: () => void,
    restored: Promise<boolean>,
  ) => Promise<boolean>;
}): ClickIntent {
  return {
    key: target.key,
    onSingle: () => target.contextEnabled ? target.onSingle() : undefined,
    onDouble: target.onDouble,
    runConversation: target.runConversation,
    doublePolicy: "after-context",
  };
}

/** Stable payloads predate the optional per-view tool allowlist. */
export function kpiCanRefresh(
  serverTools: unknown,
  data: Pick<KpiData, "_availableTools"> | null,
  toolName: string,
): boolean {
  if (!serverTools) return false;
  if (data?._availableTools === undefined) return true;
  return Array.isArray(data._availableTools) &&
    data._availableTools.includes(toolName);
}
