import {
  type BuyRecordedResult,
  parseBuyRecordedResult,
} from "../../../buy/result.ts";
import { parseBuyViewerSession } from "../../../buy/session.ts";

export type BuyEvidenceViewData = BuyRecordedResult;

export type DisplayState =
  | { readonly kind: "loading" }
  | { readonly kind: "empty" }
  | { readonly kind: "error"; readonly message: string }
  | {
    readonly kind: "unresolved";
    readonly status: "unresolved";
    readonly reason: string;
  }
  | {
    readonly kind: "unavailable";
    readonly status: "unavailable";
    readonly reason: string;
  }
  | { readonly kind: "result"; readonly result: BuyEvidenceViewData };

export function displayStateFromToolResult(value: unknown): DisplayState {
  const result = record(value, "tool result");
  if (result.isError === true) {
    return { kind: "error", message: toolErrorMessage(result) };
  }
  const structured = result.structuredContent !== undefined
    ? (isRecord(result.structuredContent)
      ? result.structuredContent
      : undefined)
    : jsonTextFallback(result.content);
  if (structured === undefined) return { kind: "empty" };
  try {
    return { kind: "result", result: parseBuyRecordedResult(structured) };
  } catch (error) {
    return {
      kind: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function displayStateFromViewerSession(
  value: unknown,
): Promise<DisplayState> {
  const session = await parseBuyViewerSession(value);
  if (session.projection.status === "unresolved") {
    return {
      kind: "unresolved",
      status: "unresolved",
      reason: session.projection.reason,
    };
  }
  if (session.projection.status === "unavailable") {
    return {
      kind: "unavailable",
      status: "unavailable",
      reason: session.projection.reason,
    };
  }
  return { kind: "result", result: session.projection.result };
}

function toolErrorMessage(value: unknown): string {
  if (!isRecord(value) || !Array.isArray(value.content)) {
    return "The Buy evidence tool reported an error.";
  }
  const text = value.content.find((item) =>
    isRecord(item) && item.type === "text"
  )
    ?.text;
  return typeof text === "string" && text.trim()
    ? text
    : "The Buy evidence tool reported an error.";
}

function jsonTextFallback(
  content: unknown,
): Record<string, unknown> | undefined {
  if (!Array.isArray(content)) return undefined;
  for (const item of content) {
    if (
      !isRecord(item) || item.type !== "text" || typeof item.text !== "string"
    ) {
      continue;
    }
    try {
      const parsed: unknown = JSON.parse(item.text);
      if (isRecord(parsed)) return parsed;
    } catch {
      // Human-readable summaries remain valid text blocks; try the next block.
    }
  }
  return undefined;
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (!isRecord(value)) throw new TypeError(`${name} must be an object.`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
