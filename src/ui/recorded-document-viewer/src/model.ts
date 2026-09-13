import type { RecordedDocument } from "../../../recorded-document/record.ts";
import type { RecordedApplicability } from "../../../recorded-document/session.ts";
import { parseRecordedViewerSession } from "../../../recorded-document/session.ts";

export interface RecordedDocumentViewData {
  readonly record: RecordedDocument;
  readonly applicability?: RecordedApplicability;
}

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
  | { readonly kind: "result"; readonly data: RecordedDocumentViewData };

export async function displayStateFromViewerSession(
  value: unknown,
): Promise<DisplayState> {
  const session = await parseRecordedViewerSession(value);
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
  const { record, applicability } = session.projection;
  return {
    kind: "result",
    data: applicability === undefined ? { record } : { record, applicability },
  };
}
