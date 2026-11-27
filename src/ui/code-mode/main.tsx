import {
  composeSnippetBoard,
  createPanelContexts,
  emitSnippetBoardEvent,
  getPanelControlsCss,
  readSnippetPanels,
  type SnippetPanel as SelectedPanel,
} from "@mcpview/compose/code-mode/board";
import {
  createInvoicePanelInteractions,
  invoiceViewPorts,
} from "./invoice-panels.ts";
import {
  connectKpiPeriods,
  createPeriodFeed,
  kpiViewPorts,
  type MountedKpiPanel,
} from "./kpi-period-panels.tsx";
import type { ViewerInteractions } from "../shared/document-follow.ts";
import { readDeclaredViewSelection } from "@mcpview/contracts";
import { CODE_MODE_RESOURCE_URI } from "../../code-mode/resource-uri.ts";
import { connectBoardLayout } from "./layout-controls.ts";
import { BOARD_PANEL_WIDTHS } from "../../code-mode/board-layout.ts";
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
import { type SnippetEvent, snippetEvent } from "./snippet-contract.ts";
import { t } from "../shared/i18n.ts";
import { isResultRecord } from "../shared/refresh.ts";

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
const controlsStyle = document.createElement("style");
controlsStyle.textContent = getPanelControlsCss();
document.head.append(controlsStyle);
const root = document.getElementById("root")!;
const host = new App({ name: "ERPNext", version: "1.0.0" }, {});
const approval = createWriteApproval(root, host);
const snippetRoot = document.createElement("div");
const viewRoot = document.createElement("div");
viewRoot.tabIndex = -1;
const contextStatus = document.createElement("p");
contextStatus.setAttribute("role", "status");
contextStatus.hidden = true;
root.append(snippetRoot, contextStatus, viewRoot);

const sendContext: App["updateModelContext"] = async (value, options) => {
  const response = await host.updateModelContext(value, options);
  if (!("isError" in response && response.isError)) contextStatus.hidden = true;
  return response;
};
const panelContexts = createPanelContexts(
  sendContext,
  () => t("context.active.error"),
);

function contextHost(update: App["updateModelContext"]): App {
  return new Proxy(host, {
    get(target, key) {
      if (key === "updateModelContext") return update;
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

// The declared-view dispatcher keeps a same-view update mounted and aborts its
// signal when it replaces, rejects or disposes that viewer.
const singleLoaders = new Map<string, () => Promise<View>>();
for (const [uri, load] of loaders) {
  singleLoaders.set(uri, async (): Promise<View> => {
    const view = await load();
    const scoped = (signal: AbortSignal) =>
      contextHost(panelContexts.forPanel("single", uri, signal));
    if ("mountSession" in view) {
      return {
        mountSession(root, _host, session, signal) {
          return view.mountSession(root, scoped(signal), session, signal);
        },
      };
    }
    return {
      mount(root, _host, result, signal) {
        return view.mount(root, scoped(signal), result, signal);
      },
    };
  });
}

const dispatcher = createDeclaredViewDispatcher({
  root: viewRoot,
  host,
  loaders: singleLoaders,
});
async function dispatchSingle(result: HostResult, signal: AbortSignal) {
  try {
    return await dispatcher.dispatch(result);
  } finally {
    try {
      await panelContexts.clear();
    } catch {
      // The next delivery or context update retries from the last acknowledged snapshot.
      if (!signal.aborted) {
        contextStatus.textContent = t("context.active.error");
        contextStatus.hidden = false;
      }
    }
  }
}

type HostResult = Awaited<ReturnType<App["callServerTool"]>>;

function resultText(result: HostResult): string {
  return result.content?.flatMap((entry) =>
    entry.type === "text" ? [entry.text] : []
  ).join("\n") ?? "";
}

function showText(text: string) {
  const message = document.createElement("pre");
  message.textContent = text;
  viewRoot.replaceChildren(message);
}

let panels: ReturnType<typeof createDeclaredViewDispatcher<App>>[] = [];
let boardLifetime: AbortController | undefined;
// A receipt can replace a board in the same iframe. Keep its business basket
// until a new execution or teardown, while retiring layout receipts with the UI.
let boardBasket: AbortController | undefined;

function clearPanels() {
  boardLifetime?.abort();
  boardLifetime = undefined;
  for (const panel of panels) panel.dispose();
  panels = [];
}

async function showExecution(result: HostResult, signal: AbortSignal) {
  boardBasket?.abort();
  clearPanels();
  if (signal.aborted) return;
  if (!readSnippetPanels(result).length) {
    const rendered = await dispatchSingle(result, signal);
    if (signal.aborted) return;
    if (!rendered) showText(resultText(result));
    return;
  }

  await dispatchSingle({ content: [] }, signal);
  if (signal.aborted) return;
  const board = composeSnippetBoard(result, {
    layout: "grid",
    resolveView: (panel) => {
      const resourceUri =
        readDeclaredViewSelection(panel.result)?.resourceUri ??
          CODE_MODE_RESOURCE_URI;
      return {
        resourceUri,
        supportedWidths: BOARD_PANEL_WIDTHS,
        events: invoiceViewPorts(resourceUri) ??
          kpiViewPorts(resourceUri, panel.name),
      };
    },
  });
  boardLifetime = new AbortController();
  boardBasket = new AbortController();
  const basketSignal = boardBasket.signal;
  const panelSignal = AbortSignal.any([signal, boardLifetime.signal]);
  const interactions = createInvoicePanelInteractions(
    board,
    panelSignal,
    (id, event, data, deliver) =>
      emitSnippetBoardEvent(board, id, event, data, deliver),
  );
  const grid = document.createElement("div");
  grid.className = "code-mode-board";
  grid.dataset.composeBoard = "";
  grid.dataset.composeIntrinsic = "";
  viewRoot.replaceChildren(grid);
  const mountedKpis = new Map<string, MountedKpiPanel>();
  await Promise.all(board.children.map(async (child) => {
    const panel = child.context!.panel as SelectedPanel;
    const native = panel.result as HostResult;
    const section = document.createElement("section");
    section.className = "code-mode-panel";
    const label = panel.title || panel.name;
    section.setAttribute("aria-label", label);
    section.dataset.composePanel = "";
    section.dataset.panelLabel = label;
    if ("layoutId" in panel && typeof panel.layoutId === "string") {
      section.dataset.composePanelId = panel.layoutId;
    }
    if (child.supportedWidths?.length) {
      section.dataset.composeWidths = child.supportedWidths.join(" ");
    }
    const grip = document.createElement("button");
    grip.type = "button";
    grip.dataset.composeGrip = "";
    grip.setAttribute(
      "aria-label",
      t("code_mode.move_panel", { name: label }),
    );
    const body = document.createElement("div");
    body.className = "code-mode-panel-body";
    section.append(grip, body);
    grid.append(section);

    const updateContext = panelContexts.forPanel(
      panel.id,
      label,
      basketSignal,
    );
    const panelHost = contextHost((value, options) => {
      panelSignal.throwIfAborted();
      return updateContext(value, options);
    });
    const kpiPorts = kpiViewPorts(
      readDeclaredViewSelection(native)?.resourceUri ?? "",
      panel.name,
    );
    const periods = kpiPorts?.emits && isResultRecord(native.structuredContent)
      ? createPeriodFeed(native.structuredContent.sparklinePeriods)
      : undefined;
    const interaction = interactions.forPanel(child.slot, panel.id);
    if (periods) {
      viewerInteractions.set(panelHost, {
        updateKpiPeriods: periods.update,
        kpiPeriodSelection: periods.selection,
      });
    } else if (interaction) viewerInteractions.set(panelHost, interaction);
    const mounted = createDeclaredViewDispatcher({
      root: body,
      host: panelHost,
      loaders,
    });
    panels.push(mounted);
    try {
      const displayed = await mounted.dispatch(native);
      interactions.setMounted(panel.id, displayed);
      if (displayed && kpiPorts) {
        mountedKpis.set(panel.id, {
          panel,
          periods,
          body,
          display: (value) => mounted.dispatch(value),
        });
      }
      if (displayed || panelSignal.aborted) return;
      body.textContent = resultText(native);
    } catch (error) {
      interactions.setMounted(panel.id, false);
      if (!panelSignal.aborted) {
        body.textContent = error instanceof Error
          ? error.message
          : String(error);
      }
    }
  }));
  if (panelSignal.aborted) return;
  connectBoardLayout(
    grid,
    host,
    result,
    panelContexts.forBoard(panelSignal),
    panelSignal,
  );
  connectKpiPeriods(board, mountedKpis, host, panelSignal);
}

async function clearExecution(signal: AbortSignal, keepBasket: boolean) {
  if (!keepBasket) boardBasket?.abort();
  clearPanels();
  if (signal.aborted) return;
  await dispatchSingle({ content: [] }, signal);
  if (!signal.aborted) {
    viewRoot.replaceChildren();
  }
}

let delivery = new AbortController();
function showSnippets(event: SnippetEvent, signal: AbortSignal) {
  render(
    <SnippetPanel
      event={event}
      canCall={Boolean(host.getHostCapabilities()?.serverTools)}
      call={async (args) => {
        signal.throwIfAborted();
        const result = await host.callServerTool(
          { name: "execute", arguments: args },
          { signal },
        );
        signal.throwIfAborted();
        if (result.isError) {
          throw new Error(resultText(result) || t("code_mode.snippet_failed"));
        }
        const next = snippetEvent(result);
        if (
          (args.snippets && next?.kind === "list") ||
          (next?.kind === "source" && next.snippet.name === args.inspectSnippet)
        ) {
          return next;
        }
        throw new Error(t("code_mode.snippet_failed"));
      }}
    />,
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
    const event = snippetEvent(confirmed);
    if (event) {
      await clearExecution(
        signal,
        event.kind === "saved" || event.kind === "updated",
      );
      if (!signal.aborted) showSnippets(event, signal);
    } else {
      await showExecution(confirmed, signal);
    }
  } catch (error) {
    if (!signal.aborted) {
      render(null, snippetRoot);
      showText(error instanceof Error ? error.message : String(error));
    }
  }
};
host.onteardown = async () => {
  delivery.abort();
  boardBasket?.abort();
  approval.close();
  render(null, snippetRoot);
  dispatcher.dispose();
  clearPanels();
  try {
    await panelContexts.clear();
  } catch {
    console.warn(
      "The host could not acknowledge the final context update during teardown.",
    );
  }
  return {};
};
const ready = host.connect().then(() => bindHostContext(host));
void ready.catch((error) =>
  showText(error instanceof Error ? error.message : String(error))
);
