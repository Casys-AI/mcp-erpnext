import type { BuyRecordedResult } from "../../../buy/result.ts";
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
