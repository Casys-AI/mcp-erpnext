import {
  capturePanelLayout,
  installPanelMovement,
  installPanelResizing,
  type PanelLayoutSnapshot,
  restorePanelLayout,
} from "@mcpview/compose/code-mode/board";
import type { App } from "@modelcontextprotocol/ext-apps";
import {
  EXECUTION_REFERENCE_META,
  SNIPPET_LAYOUT_META,
  STAGE_BOARD_LAYOUT_TOOL,
} from "../../code-mode/board-layout.ts";
import { canReplaceActiveContext } from "../shared/active-context.ts";
import { t } from "../shared/i18n.ts";
import { isResultRecord } from "../shared/refresh.ts";
import { createLayoutPublisher } from "./layout-draft.ts";

type Result = Awaited<ReturnType<App["callServerTool"]>>;

export function connectBoardLayout(
  board: HTMLElement,
  host: App,
  result: Result,
  updateContext: App["updateModelContext"],
  signal: AbortSignal,
) {
  installPanelMovement(board, signal);
  installPanelResizing(board, signal);
  const previous = result._meta?.[SNIPPET_LAYOUT_META];
  const restored = previous === undefined ||
    restorePanelLayout(board, previous);
  const runId = result._meta?.[EXECUTION_REFERENCE_META];
  const caps = host.getHostCapabilities();
  const canStage = typeof runId === "string" && !!caps?.serverTools &&
    canReplaceActiveContext(caps);
  const status = document.createElement("div");
  status.className = "code-mode-layout-status";
  status.hidden = restored;
  const message = document.createElement("span");
  message.setAttribute("role", "status");
  message.setAttribute("aria-live", "polite");
  if (!restored) message.textContent = t("code_mode.layout_restore_failed");
  const retry = document.createElement("button");
  retry.type = "button";
  retry.textContent = t("common.retry");
  retry.hidden = true;
  status.append(message, retry);
  board.after(status);

  function show(key: string, retryable = false) {
    status.hidden = !key;
    status.classList.toggle("sr-only", key === "code_mode.layout_pending");
    const text = key ? t(key) : "";
    if (message.textContent !== text) message.textContent = text;
    retry.hidden = !retryable;
  }
  if (!canStage) {
    board.addEventListener(
      "compose-panel-layout-committed",
      () => show("code_mode.layout_local"),
      { signal },
    );
    return;
  }

  const publish = createLayoutPublisher<PanelLayoutSnapshot>(
    runId,
    signal,
    async (layout, revision) => {
      const response = await host.callServerTool({
        name: STAGE_BOARD_LAYOUT_TOOL,
        arguments: { runId, revision, layout },
      }, { signal });
      const ack = response.structuredContent;
      if (
        response.isError || !isResultRecord(ack) || ack.runId !== runId ||
        ack.revision !== revision
      ) {
        throw new Error("Layout revision not acknowledged");
      }
    },
    async (snippetLayout) => {
      const value = { snippetLayout };
      const response = await updateContext(
        caps.updateModelContext?.structuredContent
          ? { structuredContent: value }
          : { content: [{ type: "text", text: JSON.stringify(value) }] },
        { signal },
      );
      if ("isError" in response && response.isError) {
        throw new Error("Layout receipt not acknowledged");
      }
    },
    (state) => {
      show(
        state === "ready"
          ? ""
          : state === "pending"
          ? "code_mode.layout_pending"
          : "code_mode.layout_failed",
        state === "failed",
      );
    },
  );
  function changed() {
    const snapshot = capturePanelLayout(board);
    if (snapshot) void publish(snapshot);
    else show("code_mode.layout_local");
  }
  board.addEventListener("compose-panel-layout-committed", changed, { signal });
  retry.addEventListener("click", changed, { signal });
}
