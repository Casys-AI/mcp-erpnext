import { formatCurrency } from "../../shared/format.ts";
import {
  canSendTextMessage,
  sendTextMessage,
  type TextMessageHost,
} from "../../shared/host-message.ts";
import type { UiRefreshRequestData } from "../../shared/refresh.ts";
import {
  canCallViewerTool,
  readAvailableTools,
} from "../../shared/viewer-tools.ts";
import type {
  ClickIntent,
  ClickIntentSingleResult,
} from "../../shared/click-intent.ts";

export function canRefreshFunnel(
  payload: unknown,
  request: UiRefreshRequestData | null,
  serverTools: unknown,
): boolean {
  return request !== null && canCallViewerTool(
    serverTools,
    readAvailableTools(payload),
    request.toolName,
  );
}

export async function sendFunnelMessage(
  host: TextMessageHost,
  message: string,
): Promise<"message" | "error" | "none"> {
  if (!canSendTextMessage(host.getHostCapabilities())) return "none";
  return await sendTextMessage(host, message) ? "message" : "error";
}

export function funnelStageValueText(
  value: number | null | undefined,
  currency: string | undefined,
): string {
  return value != null && value > 0 ? formatCurrency(value, currency) : "—";
}

export function stageMessage(
  stage: { label: string; _drillDown?: string },
  fallback: (label: string) => string | undefined,
): string | undefined {
  return stage._drillDown?.trim() || fallback(stage.label);
}

export function createFunnelStageIntent(
  {
    key,
    contextSupported,
    messageSupported,
    onContext,
    onConversation,
    runConversation,
  }: {
    key: string;
    contextSupported: boolean;
    messageSupported: boolean;
    onContext: () => ClickIntentSingleResult;
    onConversation: () => void;
    runConversation: ClickIntent["runConversation"];
  },
): ClickIntent {
  return {
    key,
    doublePolicy: "after-context",
    onSingle: () => contextSupported ? onContext() : undefined,
    onDouble: () => {
      if (messageSupported) onConversation();
    },
    runConversation,
  };
}
