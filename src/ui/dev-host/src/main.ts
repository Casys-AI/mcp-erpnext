/**
 * Hôte local MCP Apps, connecté au serveur ERPNext source.
 *
 * Charge un viewer construit (`dist/<viewer>-viewer/index.html`) dans une
 * iframe et lui parle le protocole ext-apps avec le vrai `AppBridge` du SDK :
 * capacités déclarées, résultat d'outil initial et `tools/call` réels. Aucun
 * résultat simulé ni canal conversationnel sans modèle connecté.
 */

import {
  AppBridge,
  PostMessageTransport,
} from "@modelcontextprotocol/ext-apps/app-bridge";
import {
  summarizeDownloadContents,
  summarizeModelContextContents,
  toolArgumentsForLog,
  type ViewerKey,
} from "./canned.ts";
import {
  initialLiveResult,
  livePayload,
  liveRpc,
  viewerNameOf,
} from "./live.ts";

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const frame = $<HTMLIFrameElement>("frame");
const log = $<HTMLElement>("log");
const status = $<HTMLElement>("status");
const viewerSelect = $<HTMLSelectElement>("viewer");
type BridgeToolResult = Awaited<
  ReturnType<NonNullable<AppBridge["oncalltool"]>>
>;

function note(
  kind: "tool" | "ctx" | "msg" | "info",
  title: string,
  body?: unknown,
) {
  const el = document.createElement("div");
  el.className = `ev ${kind}`;
  const when = new Date().toLocaleTimeString("fr-FR");
  const heading = document.createElement("b");
  heading.textContent = title;
  const timestamp = document.createElement("small");
  timestamp.textContent = ` ${when}`;
  el.append(heading, timestamp);
  if (body !== undefined) {
    el.append(document.createTextNode(
      `\n${typeof body === "string" ? body : JSON.stringify(body, null, 1)}`,
    ));
  }
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
}

const hostCapabilities = {
  serverTools: {},
  downloadFile: {},
  updateModelContext: { text: {}, resource: {} },
};

let bridge: AppBridge | null = null;
let mountEpoch = 0;
let viewReady = false;
let serverVersion: string | undefined;

function versionOf(result: BridgeToolResult): string | undefined {
  const meta = result._meta;
  if (!meta || typeof meta !== "object") return undefined;
  const info = (meta as Record<string, unknown>)[
    "io.modelcontextprotocol/serverInfo"
  ];
  if (!info || typeof info !== "object") return undefined;
  const version = (info as Record<string, unknown>).version;
  return typeof version === "string" && version.trim()
    ? version.trim()
    : undefined;
}

function replaceAddress() {
  const query = params.toString();
  history.replaceState(
    null,
    "",
    `${location.pathname}${query ? `?${query}` : ""}${location.hash}`,
  );
}

function reflectMountedViewer(viewerName: string) {
  const key = viewerName.replace(/-viewer$/, "");
  if (
    [...viewerSelect.options].some((option) => option.value === key)
  ) {
    viewerSelect.value = key;
    params.set("viewer", key);
    replaceAddress();
  }
}

const currentHostContext = () => ({
  locale: "fr-FR",
  theme: "dark" as const,
  displayMode: "inline" as const,
  containerDimensions: {
    width: frame.clientWidth,
    height: frame.clientHeight,
  },
});

new ResizeObserver(() => {
  if (bridge && viewReady) bridge.setHostContext(currentHostContext());
}).observe(frame);

async function mount() {
  const epoch = ++mountEpoch;
  viewReady = false;
  const viewer = viewerSelect.value as ViewerKey;
  log.innerHTML = "<h2>journal hôte</h2>";
  status.textContent = "chargement…";
  note("info", "ERPNext réel · interfaces locales");
  const previousBridge = bridge;
  bridge = null;
  if (previousBridge) await previousBridge.close().catch(() => {});
  if (epoch !== mountEpoch) return;
  frame.src = "about:blank";
  // L'iframe garde le même WindowProxy d'une navigation à l'autre : on
  // branche le transport dessus AVANT de charger la vue, sinon son
  // `ui/initialize` part avant qu'on écoute et la poignée de main n'a jamais lieu.
  let initial: BridgeToolResult;
  let viewerName = `${viewer}-viewer`;
  try {
    const tool = params.get("tool");
    const args = JSON.parse(params.get("args") ?? "{}");
    if (!args || typeof args !== "object" || Array.isArray(args)) {
      throw new Error("Les arguments initiaux doivent être un objet JSON.");
    }
    const result = await initialLiveResult(
      viewer,
      liveRpc,
      tool ? { tool, args } : undefined,
    );
    if (epoch !== mountEpoch) return;
    initial = result as BridgeToolResult;
    serverVersion = versionOf(initial);
    viewerName = viewerNameOf(result);
    reflectMountedViewer(viewerName);
    await liveRpc("resources/read", {
      uri: `ui://mcp-erpnext/${viewerName}`,
    });
    if (epoch !== mountEpoch) return;
    const payload = livePayload(result);
    note("info", "Résultat ERPNext chargé", {
      interface: viewerName,
      doctype: payload.doctype,
      count: payload.count,
    });
  } catch (error) {
    if (epoch !== mountEpoch) return;
    status.textContent = "chargement impossible";
    note(
      "info",
      "Échec du chargement",
      error instanceof Error ? error.message : String(error),
    );
    return;
  }
  if (epoch !== mountEpoch) return;
  const target = frame.contentWindow!;

  const mountedBridge = new AppBridge(
    null,
    { name: "mcp-erpnext dev host", version: "0.1.0" },
    hostCapabilities,
    {
      hostContext: currentHostContext(),
    },
  );
  bridge = mountedBridge;

  mountedBridge.oninitialized = () => {
    if (epoch !== mountEpoch) return;
    viewReady = true;
    mountedBridge.setHostContext(currentHostContext());
    status.textContent = `${
      serverVersion ?? "version inconnue"
    } · source locale`;
    note("info", "ui/initialized → résultat d'outil initial envoyé");
    void mountedBridge.sendToolResult(initial);
  };
  bridge.oncalltool = async (params) => {
    const args = (params.arguments ?? {}) as Record<string, unknown>;
    note(
      "tool",
      `canal serverTools · tools/call ${params.name}`,
      toolArgumentsForLog(args),
    );
    const result = await liveRpc("tools/call", {
      name: params.name,
      arguments: args,
    });
    if (epoch === mountEpoch) {
      note("info", "Réponse ERPNext", {
        outil: params.name,
        erreur: result.isError === true,
      });
    }
    return result as BridgeToolResult;
  };
  bridge.ondownloadfile = async (params) => {
    const files = summarizeDownloadContents(params.contents);
    note(
      "info",
      "canal downloadFile · ui/download-file",
      { fichiers: files },
    );
    for (const content of params.contents) {
      if (content.type !== "resource" || !("blob" in content.resource)) {
        continue;
      }
      const resource = content.resource;
      const bytes = Uint8Array.from(
        atob(resource.blob),
        (char) => char.charCodeAt(0),
      );
      const url = URL.createObjectURL(
        new Blob([bytes], {
          type: resource.mimeType ?? "application/octet-stream",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = decodeURIComponent(
        new URL(resource.uri).pathname.split("/").pop() || "download",
      );
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
    }
    return {};
  };
  bridge.onupdatemodelcontext = async (params) => {
    note(
      "ctx",
      "canal updateModelContext · ui/update-model-context (aucun message)",
      summarizeModelContextContents(params.content),
    );
    return {};
  };
  bridge.onmessage = async (params) => {
    note(
      "msg",
      "Demande conversationnelle refusée : aucun modèle connecté",
      summarizeModelContextContents(params.content),
    );
    return { isError: true };
  };
  bridge.onopenlink = async (params) => {
    note("info", "ui/open-link", params.url);
    return {};
  };
  bridge.onloggingmessage = () => {};
  bridge.onsizechange = () => {};

  await mountedBridge.connect(new PostMessageTransport(target, target));
  if (epoch !== mountEpoch) {
    await mountedBridge.close();
    return;
  }
  frame.src = `/__viewer/${viewerName}?theme=dark&v=${Date.now()}`;
}

const params = new URLSearchParams(location.search);
const wantedViewer = params.get("viewer");
if (
  wantedViewer &&
  [...viewerSelect.options].some((option) => option.value === wantedViewer)
) {
  viewerSelect.value = wantedViewer;
}

viewerSelect.addEventListener("change", () => {
  params.delete("tool");
  params.delete("args");
  params.set("viewer", viewerSelect.value);
  replaceAddress();
  void mount();
});
$<HTMLButtonElement>("reload").addEventListener("click", () => void mount());
if (import.meta.hot) {
  import.meta.hot.on("erpnext-viewers-built", (result) => {
    if (result.success) void mount();
    else {
      status.textContent = "compilation impossible";
      note(
        "info",
        "Les interfaces n’ont pas pu être reconstruites",
        result.error,
      );
    }
  });
}
void mount();
