import {
  composeSnippetBoard,
  readSnippetPanels,
  type SnippetPanel as SelectedPanel,
} from "@mcpview/compose/code-mode/board";
import {
  createInvoicePanelInteractions,
  invoiceViewPorts,
} from "./invoice-panels.ts";
import type { ViewerInteractions } from "../shared/document-follow.ts";
import { readDeclaredViewSelection } from "@mcpview/contracts";
import { CODE_MODE_RESOURCE_URI } from "../../code-mode/resource-uri.ts";
import { createPanelContexts } from "./panel-hosts.ts";
import { installMcpViewTheme } from "@mcpview/components";
import {
  createDeclaredViewDispatcher,
  type DeclaredSessionViewModule,
  type DeclaredViewModule,
} from "@mcpview/view";
import { App } from "@modelcontextprotocol/ext-apps";
import { type ComponentType, render } from "preact";
import "./styles.css";
import { applyCasysTheme, themeFromSearch } from "../shared/casys-theme.ts";
import { bindHostContext } from "../shared/host-context-hook.ts";
import { UI_VIEWERS } from "../viewers.ts";
import { createWriteApproval } from "./approval.ts";
import { mountComponent } from "./mount.ts";
import { SnippetPanel } from "./SnippetPanel.tsx";
import { executionReference, snippetEvent } from "./snippet-contract.ts";
import { t } from "../shared/i18n.ts";

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
const viewerInteractions = new WeakMap<App, ViewerInteractions>();
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
    return Promise.resolve(
      mountComponent(
        exports[componentName],
        approval,
        (app) => viewerInteractions.get(app),
      ),
    );
  };
  loaders.set(`ui://mcp-erpnext/${name}`, load);
}

applyCasysTheme(themeFromSearch());
installMcpViewTheme();
const root = document.getElementById("root")!;
const host = new App({ name: "ERPNext", version: "1.0.0" }, {});
const approval = createWriteApproval(root, host);
const snippetRoot = document.createElement("div");
const viewRoot = document.createElement("div");
viewRoot.tabIndex = -1;
root.append(snippetRoot, viewRoot);
const dispatcher = createDeclaredViewDispatcher({
  root: viewRoot,
  host,
  loaders,
});

type HostResult = Awaited<ReturnType<App["callServerTool"]>>;

function resultText(result: HostResult): string {
  return result.content?.flatMap((entry) =>
    entry.type === "text" ? [entry.text] : []
  ).join("\n") ?? "";
}

function showText(text: string) {
  viewRoot.hidden = false;
  const message = document.createElement("pre");
  message.textContent = text;
  viewRoot.replaceChildren(message);
}

const panelContexts = createPanelContexts(host.updateModelContext.bind(host));
let panels: ReturnType<typeof createDeclaredViewDispatcher<App>>[] = [];
let boardLifetime: AbortController | undefined;
let clearing = Promise.resolve();

function clearPanels() {
  if (!boardLifetime) return clearing;
  boardLifetime.abort();
  boardLifetime = undefined;
  for (const panel of panels) panel.dispose();
  panels = [];
  clearing = panelContexts.clear().catch(console.error);
  return clearing;
}

async function showExecution(result: HostResult, signal: AbortSignal) {
  await clearPanels();
  if (signal.aborted) return;
  if (!readSnippetPanels(result).length) {
    const rendered = await dispatcher.dispatch(result);
    if (signal.aborted) return;
    viewRoot.hidden = false;
    if (!rendered) showText(resultText(result));
    return;
  }

  await dispatcher.dispatch({ content: [] });
  if (signal.aborted) return;
  const board = composeSnippetBoard(result, {
    layout: "grid",
    resolveView: (panel) => {
      const resourceUri =
        readDeclaredViewSelection(panel.result)?.resourceUri ??
          CODE_MODE_RESOURCE_URI;
      return { resourceUri, events: invoiceViewPorts(resourceUri) };
    },
  });
  boardLifetime = new AbortController();
  const panelSignal = AbortSignal.any([signal, boardLifetime.signal]);
  const interactions = createInvoicePanelInteractions(board, panelSignal);
  const grid = document.createElement("div");
  grid.className = "code-mode-board";
  viewRoot.hidden = false;
  viewRoot.replaceChildren(grid);
  await Promise.all(board.children.map(async (child) => {
    const panel = child.context!.panel as SelectedPanel;
    const native = panel.result as HostResult;
    const section = document.createElement("section");
    section.className = "code-mode-panel";
    const heading = document.createElement("h2");
    heading.id = `erp-panel-${child.slot}`;
    heading.textContent = panel.title || panel.name;
    section.setAttribute("aria-labelledby", heading.id);
    const body = document.createElement("div");
    body.className = "code-mode-panel-body";
    section.append(heading, body);
    grid.append(section);

    const updateContext = panelContexts.forPanel(
      panel.id,
      heading.textContent,
      panelSignal,
    );
    const panelHost = new Proxy(host, {
      get(target, key) {
        if (key === "updateModelContext") return updateContext;
        const value = Reflect.get(target, key, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const interaction = interactions(child.slot, panel.id);
    if (interaction) viewerInteractions.set(panelHost, interaction);
    const mounted = createDeclaredViewDispatcher({
      root: body,
      host: panelHost,
      loaders,
    });
    panels.push(mounted);
    try {
      if (await mounted.dispatch(native) || panelSignal.aborted) return;
      body.textContent = resultText(native);
    } catch (error) {
      if (!panelSignal.aborted) {
        body.textContent = error instanceof Error
          ? error.message
          : String(error);
      }
    }
  }));
}

async function clearExecution(signal: AbortSignal) {
  await clearPanels();
  if (signal.aborted) return;
  await dispatcher.dispatch({ content: [] });
  if (!signal.aborted) {
    viewRoot.replaceChildren();
    viewRoot.hidden = false;
  }
}

let delivery = new AbortController();
let panelRevision = 0;
function showSnippets(
  result: HostResult,
  signal: AbortSignal,
) {
  const event = snippetEvent(result);
  const reference = executionReference(result);
  const canCall = Boolean(host.getHostCapabilities()?.serverTools);
  render(
    event || (canCall && reference)
      ? (
        <SnippetPanel
          key={++panelRevision}
          event={event}
          reference={reference}
          canCall={canCall}
          setResultHidden={event ? undefined : (hidden) => {
            if (!signal.aborted) viewRoot.hidden = hidden;
          }}
          call={async (args) => {
            signal.throwIfAborted();
            const result = await host.callServerTool(
              { name: "execute", arguments: args },
              { signal },
            );
            signal.throwIfAborted();
            if (result.isError) {
              throw new Error(
                resultText(result) || t("code_mode.snippet_failed"),
              );
            }
            const event = snippetEvent(result);
            const expected = args.save
              ? "saved"
              : args.snippets
              ? "list"
              : "source";
            if (
              event?.kind !== expected ||
              (event.kind === "source" &&
                event.snippet.name !== args.inspectSnippet)
            ) {
              throw new Error(t("code_mode.snippet_failed"));
            }
            if (event.kind === "saved") await clearExecution(signal);
            signal.throwIfAborted();
            return event;
          }}
        />
      )
      : null,
    snippetRoot,
  );
}

host.ontoolresult = async (result) => {
  delivery.abort();
  render(null, snippetRoot);
  approval.close();
  delivery = new AbortController();
  const { signal } = delivery;
  try {
    await ready;
    if (signal.aborted) return;
    const confirmed = await approval.resolve(result, signal);
    if (signal.aborted) return;
    if (snippetEvent(confirmed)) {
      await clearExecution(signal);
    } else {
      await showExecution(confirmed, signal);
    }
    if (!signal.aborted) showSnippets(confirmed, signal);
  } catch (error) {
    if (!signal.aborted) {
      render(null, snippetRoot);
      showText(error instanceof Error ? error.message : String(error));
    }
  }
};
host.onteardown = async () => {
  delivery.abort();
  approval.close();
  render(null, snippetRoot);
  dispatcher.dispose();
  await clearPanels();
  return {};
};
const ready = host.connect().then(() => bindHostContext(host));
void ready.catch((error) =>
  showText(error instanceof Error ? error.message : String(error))
);
