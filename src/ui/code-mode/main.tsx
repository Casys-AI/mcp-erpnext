import {
  createDeclaredViewDispatcher,
  type DeclaredSessionViewModule,
  type DeclaredViewModule,
} from "@mcpview/view";
import { App } from "@modelcontextprotocol/ext-apps";
import type { ComponentType } from "preact";
import "./styles.css";
import { applyCasysTheme, themeFromSearch } from "../shared/casys-theme.ts";
import { applyDocumentLocale } from "../shared/document-locale.ts";
import { mergeHostContext } from "../shared/host-context.ts";
import { UI_VIEWERS } from "../viewers.ts";
import { createWriteApproval } from "./approval.ts";
import { mountComponent } from "./mount.ts";

import.meta.glob("../*-viewer/src/*.css", { eager: true });
const components = import.meta.glob<Record<string, ComponentType>>(
  "../*-viewer/src/*Viewer.tsx",
  { eager: true },
);
const sessions = import.meta.glob<DeclaredSessionViewModule<App>>(
  "../*-viewer/src/session-view.ts",
  { eager: true },
);

type View = DeclaredViewModule<App> | DeclaredSessionViewModule<App>;
const loaders = new Map<string, () => Promise<View>>();
for (const name of UI_VIEWERS) {
  const directory = `../${name}/src/`;
  const entries = Object.entries(components).filter(([path]) =>
    path.startsWith(directory)
  );
  const session = sessions[`${directory}session-view.ts`];
  if (entries.length + Number(Boolean(session)) !== 1) {
    throw new Error(`Expected a single declared viewer entry in ${directory}`);
  }
  const load = (): Promise<View> => {
    if (session) return Promise.resolve(session);
    const [path, exports] = entries[0];
    const componentName = path.slice(directory.length, -".tsx".length);
    if (!exports[componentName]) {
      throw new Error(`Missing ${componentName} export in ${path}`);
    }
    return Promise.resolve(mountComponent(exports[componentName], approval));
  };
  loaders.set(`ui://mcp-erpnext/${name}`, load);
}

applyCasysTheme(themeFromSearch());
const root = document.getElementById("root")!;
const host = new App({ name: "ERPNext", version: "1.0.0" }, {});
const approval = createWriteApproval(root, host);
const dispatcher = createDeclaredViewDispatcher({ root, host, loaders });

function showText(text: string) {
  const message = document.createElement("pre");
  message.textContent = text;
  root.replaceChildren(message);
}

let delivery = new AbortController();
host.ontoolresult = async (result) => {
  delivery.abort();
  approval.close();
  delivery = new AbortController();
  const { signal } = delivery;
  try {
    await ready;
    if (signal.aborted) return;
    const confirmed = await approval.resolve(result, signal);
    if (signal.aborted) return;
    if (!(await dispatcher.dispatch(confirmed)) && !signal.aborted) {
      showText(
        confirmed.content?.flatMap((entry) =>
          entry.type === "text" ? [entry.text] : []
        ).join("\n") ?? "",
      );
    }
  } catch (error) {
    if (!signal.aborted) {
      showText(error instanceof Error ? error.message : String(error));
    }
  }
};
host.onteardown = () => {
  delivery.abort();
  approval.close();
  dispatcher.dispose();
  return {};
};
const ready = host.connect().then(() => {
  const context = host.getHostContext();
  mergeHostContext(context);
  applyDocumentLocale(context?.locale, document.documentElement);
});
void ready.catch((error) =>
  showText(error instanceof Error ? error.message : String(error))
);
