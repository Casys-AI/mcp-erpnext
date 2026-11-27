import {
  connectSnippetBoardLayout,
  type SnippetLayoutStatus,
} from "@mcpview/compose/code-mode/board";
import type { App } from "@modelcontextprotocol/ext-apps";
import {
  EXECUTION_REFERENCE_META,
  SNIPPET_LAYOUT_META,
  STAGE_BOARD_LAYOUT_TOOL,
} from "../../code-mode/board-layout.ts";
import { t } from "../shared/i18n.ts";

type Result = Awaited<ReturnType<App["callServerTool"]>>;

const messages: Record<SnippetLayoutStatus, string> = {
  ready: "",
  pending: "code_mode.layout_pending",
  failed: "code_mode.layout_failed",
  local: "code_mode.layout_local",
  "restore-failed": "code_mode.layout_restore_failed",
};

export function connectBoardLayout(
  board: HTMLElement,
  host: App,
  result: Result,
  updateContext: App["updateModelContext"],
  signal: AbortSignal,
) {
  const status = document.createElement("div");
  status.className = "code-mode-layout-status";
  status.hidden = true;
  const message = document.createElement("span");
  message.setAttribute("role", "status");
  message.setAttribute("aria-live", "polite");
  const retry = document.createElement("button");
  retry.type = "button";
  retry.textContent = t("common.retry");
  retry.hidden = true;
  status.append(message, retry);
  board.after(status);

  const retryLayout = connectSnippetBoardLayout(board, {
    host,
    updateContext,
    stageTool: STAGE_BOARD_LAYOUT_TOOL,
    runId: result._meta?.[EXECUTION_REFERENCE_META],
    savedLayout: result._meta?.[SNIPPET_LAYOUT_META],
    signal,
    onStatus(state) {
      status.hidden = state === "ready";
      status.classList.toggle("sr-only", state === "pending");
      const text = messages[state] ? t(messages[state]) : "";
      if (message.textContent !== text) message.textContent = text;
      retry.hidden = state !== "failed";
    },
  });
  retry.addEventListener("click", retryLayout, { signal });
}
