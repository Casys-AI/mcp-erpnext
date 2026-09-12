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
  BUY_RECORDED_SESSION_SCHEMA,
  BUY_VIEW_APP_ID,
  BUY_VIEW_APP_VERSION,
} from "../../../buy/identities.ts";
import type { BuyRecordedResult } from "../../../buy/result.ts";
import {
  type BuyEvidenceViewData,
  type DisplayState,
  displayStateFromToolResult,
  displayStateFromViewerSession,
} from "./model.ts";

export const BUY_APP_INFO = {
  name: BUY_VIEW_APP_ID,
  version: BUY_VIEW_APP_VERSION,
} as const;

export const BUY_STATUS_CLASS = "buy-evidence-viewer-state";
export const SESSION_REJECTED_CODE = "session-rejected";

export type BuySurfaceState = SurfaceDisplayState<BuyEvidenceViewData>;

export function startBuyEvidenceApp(
  root: HTMLElement,
  registry: ViewComponentRegistry<BuyEvidenceViewData>,
  runtime?: SurfaceAppRuntime,
): Promise<SurfaceAppHandle<BuyEvidenceViewData>> {
  installMcpViewFonts(root.ownerDocument);
  return startPreactSurfaceApp(buySurfaceAppOptions(root, registry), runtime);
}

export function buySurfaceAppOptions(
  root: HTMLElement,
  registry: ViewComponentRegistry<BuyEvidenceViewData>,
): PreactSurfaceAppOptions<BuyEvidenceViewData, unknown> {
  return {
    root,
    info: BUY_APP_INFO,
    registry,
    strict: true,
    surfaceClassName: "buy-evidence-surface",
    statusClassName: BUY_STATUS_CLASS,
    loadingLabel: "Receiving a sealed Buy result or recorded session…",
    emptyLabel: "Buy evidence returned no supported sealed projection.",
    fromToolResult: (result) =>
      toSurfaceState(displayStateFromToolResult(result)),
    viewerSession: {
      validate: (_value: unknown): _value is unknown => true,
      toState: async (value) => {
        try {
          return toSurfaceState(await displayStateFromViewerSession(value));
        } catch (error) {
          return {
            kind: "error",
            title: "Session rejected",
            code: SESSION_REJECTED_CODE,
            message: `Rejected ${BUY_RECORDED_SESSION_SCHEMA} session: ${
              errorMessage(error)
            }`,
          };
        }
      },
    },
    surfaceFor: (_data: BuyRecordedResult) => ({
      layout: { type: "stack", gap: "sm" },
      components: [{ id: "evidence", component: "buy.configuration-cost" }],
    }),
    onError: (error) => {
      console.error("[mcp-erpnext] Buy evidence projection failed", error);
    },
  };
}

export function toSurfaceState(state: DisplayState): BuySurfaceState {
  switch (state.kind) {
    case "loading":
    case "empty":
    case "error":
    case "result":
      return state;
    case "unresolved":
      return {
        kind: "notice",
        tone: "warning",
        title: "Unresolved recorded evidence",
        message: state.reason,
        code: state.status,
      };
    case "unavailable":
      return {
        kind: "notice",
        tone: "warning",
        title: "Recorded evidence unavailable",
        message: state.reason,
        code: state.status,
      };
  }
}

export function renderStartupFailure(error: unknown): HTMLElement {
  return renderStatusMessage(
    error instanceof Error ? error.message : "The viewer could not start.",
    {
      className: BUY_STATUS_CLASS,
      title: "Buy evidence viewer unavailable",
      tone: "danger",
    },
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
