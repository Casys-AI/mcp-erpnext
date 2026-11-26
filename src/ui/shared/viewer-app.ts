import type { App } from "@modelcontextprotocol/ext-apps";
import { createContext } from "preact";
import { useContext } from "preact/hooks";

export const ViewerAppContext = createContext<App | undefined>(undefined);

/** Standalone viewers connect themselves. A declared view shares its shell's connection. */
export function useViewerApp(standalone: App): App {
  if (typeof __ERP_DECLARED_HOST__ !== "undefined" && __ERP_DECLARED_HOST__) {
    const app = useContext(ViewerAppContext);
    if (!app) throw new Error("Missing ERPNext viewer host.");
    return app;
  }
  return standalone;
}
