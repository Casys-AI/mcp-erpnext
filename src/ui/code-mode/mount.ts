import type { DeclaredViewModule } from "@mcpview/view";
import type { App } from "@modelcontextprotocol/ext-apps";
import { type ComponentType, h, render } from "preact";
import type { WriteApproval } from "./approval.ts";
import type { ViewerInteractions } from "../shared/document-follow.ts";
import {
  ViewerAppContext,
  ViewerInteractionsContext,
} from "../shared/viewer-app.ts";

/** Keep each component's lifecycle local while sharing the shell's MCP connection. */
export function mountComponent(
  Component: ComponentType,
  approval: WriteApproval,
  getInteractions?: (host: App) => ViewerInteractions | undefined,
): DeclaredViewModule<App> {
  return {
    mount(root, host, first, signal) {
      signal.throwIfAborted();
      const interactions = getInteractions?.(host);
      let latest = first;
      let connected = false;
      let disposed = false;
      let receive: App["ontoolresult"];
      let contextListener: App["onhostcontextchanged"];

      function setContextListener(next: App["onhostcontextchanged"]) {
        if (contextListener) {
          host.removeEventListener("hostcontextchanged", contextListener);
        }
        contextListener = next;
        if (next) host.addEventListener("hostcontextchanged", next);
      }

      // App methods touch SDK private fields and must keep the connected host as receiver.
      // The outer tool's streamed JS input does not belong to the mounted ERP operation.
      const app = new Proxy(host, {
        get(target, property) {
          if (property === "connect") {
            return async () => {
              if (connected || disposed) return;
              connected = true;
              await receive?.(latest);
            };
          }
          if (property === "callServerTool") {
            return async (...args: Parameters<App["callServerTool"]>) => {
              signal.throwIfAborted();
              return approval.resolve(
                await host.callServerTool(...args),
                signal,
              );
            };
          }
          if (property === "ontoolresult") return receive;
          if (property === "onhostcontextchanged") return contextListener;
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
        set(_target, property, value) {
          if (disposed) return true;
          if (property === "ontoolresult") receive = value;
          else if (property === "onhostcontextchanged") {
            setContextListener(value);
          } else if (
            property !== "ontoolinput" && property !== "ontoolinputpartial"
          ) return false;
          return true;
        },
      });

      function dispose() {
        if (disposed) return;
        disposed = true;
        signal.removeEventListener("abort", dispose);
        setContextListener(undefined);
        receive = undefined;
        render(null, root);
      }
      signal.addEventListener("abort", dispose, { once: true });
      try {
        render(
          h(
            ViewerAppContext.Provider,
            { value: app },
            h(
              ViewerInteractionsContext.Provider,
              { value: interactions },
              h(Component, {}),
            ),
          ),
          root,
        );
      } catch (error) {
        dispose();
        throw error;
      }
      return {
        async update(result) {
          latest = result;
          if (connected && !disposed) await receive?.(latest);
        },
        dispose,
      };
    },
  };
}
