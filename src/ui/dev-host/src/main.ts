/**
 * Hôte de démonstration MCP Apps.
 *
 * Charge un viewer construit (`dist/<viewer>-viewer/index.html`) dans une
 * iframe et lui parle le protocole ext-apps avec le vrai `AppBridge` du SDK :
 * capacités déclarées, résultat d'outil initial, `tools/call` servis par des
 * données canned, et tout ce que la vue émet vers l'hôte (contexte, message,
 * lien) journalisé à l'écran. Aucun ERPNext derrière : c'est un banc d'essai
 * pour voir le câblage sans Claude ni serveur.
 */

import {
  AppBridge,
  PostMessageTransport,
} from "@modelcontextprotocol/ext-apps/app-bridge";
import {
  cannedResult,
  initialResult,
  type ViewerKey,
  withDevViewerTools,
} from "./canned.ts";
import {
  capabilitiesForProfile,
  type CapabilityProfile,
  channelsForProfile,
  resolveCapabilityProfile,
} from "./capabilities.ts";

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const frame = $<HTMLIFrameElement>("frame");
const log = $<HTMLElement>("log");
const status = $<HTMLElement>("status");
const viewerSelect = $<HTMLSelectElement>("viewer");
const capsSelect = $<HTMLSelectElement>("caps");

function note(
  kind: "tool" | "ctx" | "msg" | "info",
  title: string,
  body?: unknown,
) {
  const el = document.createElement("div");
  el.className = `ev ${kind}`;
  const when = new Date().toLocaleTimeString("fr-FR");
  el.innerHTML = `<b>${title}</b> <small>${when}</small>` +
    (body === undefined
      ? ""
      : `\n${typeof body === "string" ? body : JSON.stringify(body, null, 1)}`);
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
}

const selectedProfile = (): CapabilityProfile =>
  resolveCapabilityProfile(capsSelect.value) ?? "full";

const textResult = (payload: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(payload) }],
});

let bridge: AppBridge | null = null;

async function mount() {
  const viewer = viewerSelect.value as ViewerKey;
  const profile = selectedProfile();
  const hostCapabilities = capabilitiesForProfile(profile);
  const channels = channelsForProfile(profile);
  log.innerHTML = "<h2>journal hôte</h2>";
  status.textContent = "chargement…";
  note(
    "info",
    `profil ${profile}`,
    channels.length > 0
      ? { "canaux annoncés": channels }
      : { "canaux annoncés": "aucun" },
  );
  if (bridge) {
    await bridge.close().catch(() => {});
    bridge = null;
  }
  // L'iframe garde le même WindowProxy d'une navigation à l'autre : on
  // branche le transport dessus AVANT de charger la vue, sinon son
  // `ui/initialize` part avant qu'on écoute et la poignée de main n'a jamais lieu.
  const target = frame.contentWindow!;

  bridge = new AppBridge(
    null,
    { name: "mcp-erpnext dev host", version: "0.1.0" },
    hostCapabilities,
    {
      hostContext: {
        locale: "fr-FR",
        theme: "dark",
        displayMode: "inline",
        containerDimensions: { width: 740, height: 640 },
      },
    },
  );

  bridge.oninitialized = () => {
    status.textContent = `initialisé · ${profile} · ${
      channels.length > 0 ? channels.join(" + ") : "aucun canal"
    }`;
    note("info", "ui/initialized → résultat d'outil initial envoyé");
    void bridge!.sendToolResult(
      textResult(withDevViewerTools(viewer, initialResult(viewer))),
    );
  };
  bridge.oncalltool = async (params) => {
    const args = (params.arguments ?? {}) as Record<string, unknown>;
    const payload = cannedResult(viewer, params.name, args);
    note("tool", `canal serverTools · tools/call ${params.name}`, args);
    if (payload === null) {
      note("info", `${params.name} : non simulé → isError`);
      return {
        isError: true,
        content: [{
          type: "text",
          text:
            `Banc d'essai : l'outil ${params.name} n'est pas simulé — aucune action réelle.`,
        }],
      };
    }
    return textResult(withDevViewerTools(viewer, payload));
  };
  bridge.onupdatemodelcontext = async (params) => {
    note(
      "ctx",
      "canal updateModelContext · ui/update-model-context (aucun message)",
      params.content,
    );
    return {};
  };
  bridge.onmessage = async (params) => {
    note(
      "msg",
      "canal message · ui/message — UN MESSAGE FABRIQUÉ (repli)",
      params.content,
    );
    return {};
  };
  bridge.onopenlink = async (params) => {
    note("info", "ui/open-link", params.url);
    return {};
  };
  bridge.onloggingmessage = () => {};
  bridge.onsizechange = () => {};

  await bridge.connect(new PostMessageTransport(target, target));
  frame.src = `/${viewer}-viewer/index.html?theme=dark&v=${Date.now()}`;
}

// Les anciennes URLs `caps=tools|context|message` restent des alias valides.
const params = new URLSearchParams(location.search);
const wantedViewer = params.get("viewer");
if (
  wantedViewer &&
  [...viewerSelect.options].some((option) => option.value === wantedViewer)
) {
  viewerSelect.value = wantedViewer;
}
const wantedProfile = resolveCapabilityProfile(params.get("caps"));
if (wantedProfile) capsSelect.value = wantedProfile;

viewerSelect.addEventListener("change", () => void mount());
capsSelect.addEventListener("change", () => void mount());
$<HTMLButtonElement>("reload").addEventListener("click", () => void mount());
void mount();
