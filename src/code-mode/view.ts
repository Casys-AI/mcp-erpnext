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

export const CODE_MODE_RESOURCE_URI = "ui://mcp-erpnext/code-mode";

export function registerCodeModeView(server: McpApp, moduleUrl: string) {
  const dist = resolveViewerDistPath(moduleUrl, "code-mode", statSync);
  if (!dist) return undefined;
  const remote = remoteViewerNetTarget(dist);
  if (remote && !isViewerNetAllowed(netPermission(remote))) return undefined;

  server.registerResource(
    withViewerResourceMeta({
      uri: CODE_MODE_RESOURCE_URI,
      name: "ERPNext",
      description: "Open the ERPNext view declared by the returned operation.",
      mimeType: MCP_APP_MIME_TYPE,
    }),
    async () =>
      withViewerResourceMeta({
        uri: CODE_MODE_RESOURCE_URI,
        mimeType: MCP_APP_MIME_TYPE,
        text: await readViewerDist(dist, readTextFile),
      }),
  );

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
