import { MCP_APP_MIME_TYPE, type McpApp } from "@mcpview/server";
import { BUY_VIEW_APP_MANIFEST } from "../buy/manifest.ts";
import { netPermission, readTextFile, statSync } from "../runtime.ts";
import {
  isViewerNetAllowed,
  readViewerDist,
  remoteViewerNetTarget,
  resolveViewerDistPath,
} from "../ui/viewer-resource-paths.ts";
import { UI_VIEWERS, withViewerResourceMeta } from "../ui/viewers.ts";
import {
  CODE_MODE_COMPATIBILITY_URIS,
  CODE_MODE_RESOURCE_URI,
} from "./resource-uri.ts";

export function registerCodeModeView(
  server: Pick<McpApp, "registerResource">,
  moduleUrl: string,
) {
  const dist = resolveViewerDistPath(moduleUrl, "code-mode", statSync);
  if (!dist) return undefined;
  const remote = remoteViewerNetTarget(dist);
  if (remote && !isViewerNetAllowed(netPermission(remote))) return undefined;

  const register = (uri: string, name: string) => {
    server.registerResource(
      withViewerResourceMeta({
        uri,
        name,
        description:
          "Open the ERPNext view declared by the returned operation.",
        mimeType: MCP_APP_MIME_TYPE,
      }),
      async () =>
        withViewerResourceMeta({
          uri,
          mimeType: MCP_APP_MIME_TYPE,
          text: await readViewerDist(dist, readTextFile),
        }),
    );
  };
  register(CODE_MODE_RESOURCE_URI, "ERPNext");
  for (const uri of CODE_MODE_COMPATIBILITY_URIS) {
    register(uri, "ERPNext (compatibility)");
  }

  const sessionResources = BUY_VIEW_APP_MANIFEST.resources;
  const sessions = new Set<string>(
    sessionResources.map((resource) => resource.uri),
  );
  return {
    resourceUri: CODE_MODE_RESOURCE_URI,
    mountableResourceUris: UI_VIEWERS.map((name) => `ui://mcp-erpnext/${name}`)
      .filter((uri) => !sessions.has(uri)),
    sessionResources,
  };
}
