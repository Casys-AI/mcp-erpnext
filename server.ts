/**
 * MCP Server Bootstrap for ERPNext Tools
 *
 * Bootstraps ERPNext tools as a proper MCP server
 * that can be loaded via .pml.json or run as HTTP server.
 *
 * Usage in .pml.json (stdio mode):
 * {
 *   "mcpServers": {
 *     "erpnext": {
 *       "command": "deno",
 *       "args": ["run", "--allow-all", "lib/erpnext/server.ts"],
 *       "env": {
 *         "ERPNEXT_URL": "http://localhost:8000",
 *         "ERPNEXT_API_KEY": "your-api-key",
 *         "ERPNEXT_API_SECRET": "your-api-secret"
 *       }
 *     }
 *   }
 * }
 *
 * HTTP mode (default port: 3012):
 *   deno run --allow-all lib/erpnext/server.ts --http
 *   deno run --allow-all lib/erpnext/server.ts --http --port=3012
 *
 * Environment:
 *   ERPNEXT_URL=http://localhost:8000     ERPNext instance URL
 *   ERPNEXT_API_KEY=xxx                   API key from User Settings → API Access
 *   ERPNEXT_API_SECRET=xxx                API secret from User Settings → API Access
 *
 * @module lib/erpnext/server
 */

import { launchInspector, MCP_APP_MIME_TYPE, McpApp } from "@casys/mcp-server";
import { ErpNextToolsClient } from "./src/client.ts";
import { FrappeAPIError } from "./src/api/frappe-client.ts";
import { UI_VIEWERS } from "./src/ui/viewers.ts";
import { resolveViewerDistPath } from "./src/ui/viewer-resource-paths.ts";
import {
  exit,
  getArgs,
  onSignal,
  readTextFile,
  statSync,
} from "./src/runtime.ts";
import { buildAuthProvider, loadAuthConfig } from "./src/auth/config.ts";
import { warmCache } from "./src/cache/warm.ts";
import { resourceMetadataRoute } from "./src/auth/resource-metadata-route.ts";

const DEFAULT_HTTP_PORT = 3012;

async function main() {
  const args = getArgs();

  // Inspector mode — launch MCP Inspector for interactive debugging
  if (args.includes("--inspect")) {
    await launchInspector("deno", [
      "run",
      "--allow-all",
      import.meta.filename!,
    ]);
    return;
  }

  // Category filtering
  const categoriesArg = args.find((arg) => arg.startsWith("--categories="));
  const categories = categoriesArg
    ? categoriesArg.split("=")[1].split(",")
    : undefined;

  // HTTP mode
  const httpFlag = args.includes("--http");
  const portArg = args.find((arg) => arg.startsWith("--port="));
  const httpPort = portArg
    ? parseInt(portArg.split("=")[1], 10)
    : DEFAULT_HTTP_PORT;
  const hostnameArg = args.find((arg) => arg.startsWith("--hostname="));
  // Safe default: bind to loopback only. Exposing HTTP mode to the network must
  // be an explicit choice (`--hostname=0.0.0.0`), since every tool acts with the
  // server's ERPNext API key. In Docker, the published port needs
  // `--hostname=0.0.0.0` in the container CMD to be reachable.
  const hostname = hostnameArg ? hostnameArg.split("=")[1] : "127.0.0.1";

  // Auth (HTTP mode only) — built before the McpApp constructor since the
  // provider is wired in there, not at startHttp() time.
  const authConfig = httpFlag ? loadAuthConfig() : null;
  const authProvider = authConfig ? buildAuthProvider(authConfig) : undefined;
  const authMetadataRoute = authProvider
    ? resourceMetadataRoute(authProvider)
    : undefined;

  // Initialize tools client
  const toolsClient = new ErpNextToolsClient(
    categories ? { categories } : undefined,
  );

  // Build MCP server
  const server = new McpApp({
    name: "mcp-erpnext",
    version: "2.6.0",
    maxConcurrent: 10,
    backpressureStrategy: "queue",
    validateSchema: true,
    auth: authProvider ? { provider: authProvider } : undefined,
    logger: (msg: string) => console.error(`[mcp-erpnext] ${msg}`),
    toolErrorMapper: (error: unknown) => {
      if (error instanceof FrappeAPIError) return error.message;
      if (error instanceof Error) return error.message;
      return String(error);
    },
  });

  // Register all tools with their handlers
  const mcpTools = toolsClient.toMCPFormat();
  const handlers = toolsClient.buildHandlersMap();
  server.registerTools(mcpTools, handlers);

  // Register UI resources (MCP Apps viewers)
  // Built by: cd lib/erpnext/src/ui && node build-all.mjs
  for (const viewerName of UI_VIEWERS) {
    const distPath = resolveViewerDistPath(
      import.meta.url,
      viewerName,
      statSync,
    );

    const resourceUri = `ui://mcp-erpnext/${viewerName}`;
    const humanName = viewerName
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

    if (distPath) {
      server.registerResource(
        {
          uri: resourceUri,
          name: `ERPNext ${humanName}`,
          description: `ERPNext UI: ${viewerName}`,
          mimeType: MCP_APP_MIME_TYPE,
        },
        async () => {
          const html = await readTextFile(distPath);
          return { uri: resourceUri, mimeType: MCP_APP_MIME_TYPE, text: html };
        },
      );
      console.error(`[mcp-erpnext] Registered UI resource: ${resourceUri}`);
    } else {
      console.error(
        `[mcp-erpnext] Warning: UI not built for ${resourceUri}. ` +
          `Run 'cd lib/erpnext/src/ui && node build-all.mjs' first or package ui-dist with the npm bundle.`,
      );
    }
  }

  console.error(
    `[mcp-erpnext] Initialized — ${toolsClient.count} tools${
      categories ? ` (categories: ${categories.join(", ")})` : ""
    }`,
  );

  // Fire-and-forget — must never block or fail startup (see warmCache() docs).
  warmCache().catch((err) => {
    console.error("[mcp-erpnext] Cache warm failed (non-fatal):", err);
  });

  // Start server
  if (httpFlag) {
    const isLoopback = hostname === "127.0.0.1" || hostname === "::1" ||
      hostname === "localhost";
    if (!isLoopback) {
      console.error(
        `[mcp-erpnext] WARNING: binding to ${hostname} exposes the HTTP server ` +
          `to the network. Every tool acts with the server's ERPNext API key, ` +
          `so restrict access (firewall, private network) or configure auth ` +
          `via MCP_AUTH_TOKEN(S)/MCP_OAUTH_JWKS_URL.`,
      );
    }

    onSignal("SIGINT", () => {
      console.error("[mcp-erpnext] Shutting down...");
      exit(0);
    });

    if (!authConfig) {
      // No auth configured — warn and fall back to unprotected HTTP.
      // Set MCP_AUTH_TOKEN, MCP_AUTH_TOKENS, or MCP_OAUTH_JWKS_URL to enable auth.
      console.error(
        "[mcp-erpnext] WARNING: No auth configured for HTTP mode. " +
          "Set MCP_AUTH_TOKEN, MCP_AUTH_TOKENS, or MCP_OAUTH_JWKS_URL to restrict access.",
      );
    }

    await server.startHttp({
      port: httpPort,
      hostname,
      cors: true,
      customRoutes: authMetadataRoute ? [authMetadataRoute] : undefined,
      onListen: (info: { hostname: string; port: number }) => {
        console.error(
          `[mcp-erpnext] HTTP server listening${
            authConfig ? "" : " (unauthenticated)"
          } on http://${info.hostname}:${info.port}`,
        );
        if (authConfig) {
          const authMethods: string[] = [];
          if (authConfig.tokens.size > 0) {
            authMethods.push(`static tokens (${authConfig.tokens.size})`);
          }
          if (authConfig.jwksUrl) {
            authMethods.push(`OAuth JWT JWKS (${authConfig.jwksUrl})`);
          }
          console.error(`[mcp-erpnext] Auth: ${authMethods.join(", ")}`);
        }
      },
    });
  } else {
    await server.start();
    console.error("[mcp-erpnext] stdio mode ready");
  }
}

main().catch((err) => {
  console.error("[mcp-erpnext] Fatal error:", err);
  exit(1);
});
