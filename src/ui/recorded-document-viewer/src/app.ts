import {
  type PreactSurfaceAppOptions,
  renderStatusMessage,
  startPreactSurfaceApp,
  type SurfaceAppHandle,
  type SurfaceAppRuntime,
  type SurfaceDisplayState,
} from "@casys/mcp-view-components/preact";
import { installMcpViewFonts } from "@casys/mcp-view-components/fonts";
import type { ViewComponentRegistry } from "@casys/mcp-view-components";
import {
  RECORDED_DOCUMENT_SESSION_SCHEMA,
  RECORDED_DOCUMENT_VIEW_APP_ID,
  RECORDED_DOCUMENT_VIEW_APP_VERSION,
  RECORDED_DOCUMENT_VIEWER_SESSION_KIND,
} from "../../../recorded-document/identities.ts";
import { createSerialQueue } from "../../shared/single-flight.ts";
import {
  type DisplayState,
  displayStateFromViewerSession,
  type RecordedDocumentViewData,
} from "./model.ts";

export const RECORDED_APP_INFO = {
  name: RECORDED_DOCUMENT_VIEW_APP_ID,
  version: RECORDED_DOCUMENT_VIEW_APP_VERSION,
} as const;

export const RECORDED_STATUS_CLASS = "recorded-document-viewer-state";
export const SESSION_REJECTED_CODE = "session-rejected";
export const TOOL_RESULT_REJECTED_CODE = "tool-result-rejected";

export type RecordedSurfaceState = SurfaceDisplayState<
  RecordedDocumentViewData
>;
export type RecordedSessionValidator = (
  value: unknown,
) => Promise<DisplayState>;

export function startRecordedDocumentApp(
  root: HTMLElement,
  registry: ViewComponentRegistry<RecordedDocumentViewData>,
  runtime?: SurfaceAppRuntime,
  validator: RecordedSessionValidator = displayStateFromViewerSession,
): Promise<SurfaceAppHandle<RecordedDocumentViewData>> {
  installMcpViewFonts(root.ownerDocument);
  return startPreactSurfaceApp(
    recordedSurfaceAppOptions(root, registry, validator),
    runtime,
  );
}

// Shared surface status screens do not expose host context yet. Keep their
// fallback English explicit; the recorded component owns host-aware
// localization.
export function recordedSurfaceAppOptions(
  root: HTMLElement,
  registry: ViewComponentRegistry<RecordedDocumentViewData>,
  validator: RecordedSessionValidator = displayStateFromViewerSession,
): PreactSurfaceAppOptions<RecordedDocumentViewData, unknown> {
  // Session validations run in intent order: a slow first validation can
  // never finish after — and overwrite — a newer selection.
  const sessionQueue = createSerialQueue();
  return {
    root,
    info: RECORDED_APP_INFO,
    registry,
    strict: true,
    surfaceClassName: "recorded-document-surface",
    statusClassName: RECORDED_STATUS_CLASS,
    loadingLabel: "Receiving a recorded document session…",
    emptyLabel: "Recorded document returned no supported projection.",
    fromToolResult: () => ({
      kind: "error" as const,
      title: "Raw tool result rejected",
      code: TOOL_RESULT_REJECTED_CODE,
      message:
        "This App accepts a recorded session only. Raw tool results are not evidence.",
    }),
    viewerSession: {
      validate: (value: unknown): value is Record<string, unknown> =>
        typeof value === "object" && value !== null && !Array.isArray(value) &&
        (value as Record<string, unknown>).schemaVersion ===
          RECORDED_DOCUMENT_SESSION_SCHEMA &&
        (value as Record<string, unknown>).kind ===
          RECORDED_DOCUMENT_VIEWER_SESSION_KIND,
      toState: (value) =>
        sessionQueue.run(async () => {
          try {
            return toSurfaceState(await validator(value));
          } catch (error) {
            return {
              kind: "error",
              title: "Session rejected",
              code: SESSION_REJECTED_CODE,
              message: `Rejected ${RECORDED_DOCUMENT_SESSION_SCHEMA} session: ${
                errorMessage(error)
              }`,
            };
          }
        }),
    },
    surfaceFor: (_data: RecordedDocumentViewData) => ({
      layout: { type: "stack", gap: "sm" },
      components: [{ id: "document", component: "recorded.document" }],
    }),
    onError: (error) => {
      console.error("[mcp-erpnext] Recorded document projection failed", error);
    },
  };
}

export function toSurfaceState(state: DisplayState): RecordedSurfaceState {
  switch (state.kind) {
    case "loading":
    case "empty":
    case "error":
      return state;
    case "result":
      return { kind: "result", result: state.data };
    case "unresolved":
      return {
        kind: "notice",
        tone: "warning",
        title: "Unresolved recorded document",
        message: state.reason,
        code: state.status,
      };
    case "unavailable":
      return {
        kind: "notice",
        tone: "warning",
        title: "Recorded document unavailable",
        message: state.reason,
        code: state.status,
      };
  }
}

export function renderStartupFailure(error: unknown): HTMLElement {
  return renderStatusMessage(
    error instanceof Error ? error.message : "The viewer could not start.",
    {
      className: RECORDED_STATUS_CLASS,
      title: "Recorded document viewer unavailable",
      tone: "danger",
    },
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
