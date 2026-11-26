import type { App } from "@modelcontextprotocol/ext-apps";

import { t } from "../shared/i18n.ts";

type HostResult = Awaited<ReturnType<App["callServerTool"]>>;

type WriteConfirmation = {
  ticket: string;
  operation: string;
  arguments: Record<string, unknown>;
};

function confirmationFrom(result: HostResult): WriteConfirmation | undefined {
  if (result.isError) return;
  const meta = result._meta?.["io.casys/erpnext-write-confirmation"];
  if (!meta || typeof meta !== "object") return;
  const entry = meta as Record<string, unknown>;
  if (
    typeof entry.ticket !== "string" || !entry.ticket ||
    typeof entry.operation !== "string" || !entry.operation ||
    !entry.arguments || typeof entry.arguments !== "object" ||
    Array.isArray(entry.arguments)
  ) return;
  return {
    ticket: entry.ticket,
    operation: entry.operation,
    arguments: entry.arguments as Record<string, unknown>,
  };
}

export function createWriteApproval(
  root: HTMLElement,
  host: Pick<App, "callServerTool">,
) {
  const panel = document.createElement("section");
  panel.className = "erp-write-approval";
  panel.hidden = true;
  root.before(panel);
  let close: (() => void) | undefined;

  async function ask(
    request: WriteConfirmation,
    signal: AbortSignal,
  ): Promise<HostResult> {
    signal.throwIfAborted();
    close?.();
    return await new Promise((resolve, reject) => {
      const title = document.createElement("h2");
      title.textContent = t("code_mode.confirm_change");
      panel.setAttribute("aria-label", title.textContent);
      const operation = document.createElement("strong");
      operation.textContent = request.operation;
      const args = document.createElement("pre");
      args.textContent = JSON.stringify(request.arguments, null, 2);
      const status = document.createElement("p");
      status.setAttribute("role", "alert");
      const approve = document.createElement("button");
      approve.type = "button";
      approve.textContent = t("code_mode.approve");
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.textContent = t("common.cancel");
      panel.replaceChildren(title, operation, args, status, approve, cancel);
      panel.hidden = false;
      root.inert = true;
      cancel.focus();
      let active = true;
      function finish() {
        active = false;
        signal.removeEventListener("abort", interrupted);
        close = undefined;
        panel.replaceChildren();
        panel.hidden = true;
        root.inert = false;
      }
      function interrupted() {
        finish();
        reject(new DOMException("Confirmation closed.", "AbortError"));
      }
      close = interrupted;
      signal.addEventListener("abort", interrupted, { once: true });
      async function decide(decision: "approve" | "cancel") {
        if (!active || approve.disabled) return;
        approve.disabled = cancel.disabled = true;
        status.textContent = t("code_mode.waiting");
        try {
          const result = await host.callServerTool({
            name: "erpnext_confirm_write",
            arguments: { ticket: request.ticket, decision },
          });
          if (!active) return;
          finish();
          resolve(result);
        } catch (error) {
          if (!active) return;
          status.textContent = error instanceof Error
            ? error.message
            : String(error);
          approve.disabled = cancel.disabled = false;
        }
      }
      approve.onclick = () => void decide("approve");
      cancel.onclick = () => void decide("cancel");
    });
  }

  return {
    async resolve(
      result: HostResult,
      signal: AbortSignal,
    ): Promise<HostResult> {
      let current = result;
      let request = confirmationFrom(current);
      while (request) {
        current = await ask(request, signal);
        request = confirmationFrom(current);
      }
      return current;
    },
    close() {
      close?.();
    },
  };
}

export type WriteApproval = ReturnType<typeof createWriteApproval>;
