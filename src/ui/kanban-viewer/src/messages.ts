import type { t as translate } from "../../shared/i18n.ts";
import { kanbanTransitionLabel } from "../../shared/kanban/labels.ts";

type TFunction = typeof translate;
export type UiMessage =
  | { key: string; params?: Record<string, unknown>; destination?: string }
  | { text: string };

export class UiError extends Error {
  constructor(readonly key: string) {
    super(key);
  }
}

export function errorMessage(error: unknown, fallbackKey: string): UiMessage {
  if (error instanceof UiError) return { key: error.key };
  if (error instanceof SyntaxError) return { key: fallbackKey };
  if (error instanceof Error) return { text: error.message };
  if (typeof error === "string") return { text: error };
  return { key: fallbackKey };
}

export function messageValue(message: UiMessage): string {
  return "text" in message ? message.text : message.key;
}

export function messageText(message: UiMessage, t: TFunction): string {
  if ("text" in message) return message.text;
  const params = message.destination === undefined ? message.params : {
    ...message.params,
    label: kanbanTransitionLabel(message.destination, t),
  };
  return t(message.key, params);
}
