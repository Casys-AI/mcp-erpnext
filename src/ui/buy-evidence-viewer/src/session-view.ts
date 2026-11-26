import {
  type DeclaredSessionViewModule,
  mountDeclaredSessionApp,
} from "@mcpview/view";
import type { App } from "@modelcontextprotocol/ext-apps";
import { startBuyEvidenceApp } from "./app.ts";
import { BUY_COMPONENT_REGISTRY } from "./components.tsx";

export const mountSession: DeclaredSessionViewModule<App>["mountSession"] = (
  root,
  host,
  session,
  signal,
) =>
  mountDeclaredSessionApp(
    host,
    session,
    signal,
    (runtime) => startBuyEvidenceApp(root, BUY_COMPONENT_REGISTRY, runtime),
  );
