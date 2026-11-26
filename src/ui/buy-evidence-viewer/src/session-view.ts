import {
  type DeclaredSessionViewModule,
  mountDeclaredSessionApp,
} from "@mcpview/view";
import type { App } from "@modelcontextprotocol/ext-apps";
import { startBuyEvidenceApp } from "./app.ts";

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
    (runtime) => startBuyEvidenceApp(root, undefined, runtime),
  );
