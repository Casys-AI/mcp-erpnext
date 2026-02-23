/**
 * MCP Apps UI Module for lib/erpnext
 *
 * Provides infrastructure for serving UI components (invoice-viewer,
 * stock-viewer, dashboard-viewer, doclist-viewer) via MCP Apps.
 *
 * Pattern: mirrors lib/plm/src/ui/mod.ts
 *
 * @module lib/erpnext/src/ui
 */

import { statSync, readDirSync, readTextFile } from "../runtime.ts";

/**
 * Metadata for UI resources
 */
export interface UIResourceMeta {
  name: string;
  description: string;
  tools: string[];
}

const UI_NAMESPACE = "mcp-erpnext";

/**
 * Auto-discover UI resources from dist/ folder.
 * Registers each viewer under the mcp-erpnext namespace.
 */
function discoverUiResources(): Record<string, UIResourceMeta> {
  const resources: Record<string, UIResourceMeta> = {};
  const distPath = new URL("./dist", import.meta.url).pathname;

  try {
    for (const uiName of readDirSync(distPath)) {
      if (statSync(`${distPath}/${uiName}/index.html`)) {
        const meta: UIResourceMeta = {
          name: uiName
            .split("-")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" "),
          description: `ERPNext UI: ${uiName}`,
          tools: [],
        };
        resources[`ui://${UI_NAMESPACE}/${uiName}`] = meta;
      }
    }
  } catch (e) {
    console.error(`[mcp-erpnext/ui] Failed to discover UIs from ${distPath}:`, e);
  }

  return resources;
}

/** Registry of available UI resources */
export const UI_RESOURCES: Record<string, UIResourceMeta> = discoverUiResources();

/** Embedded UI HTML bundles (populated at build time or runtime) */
const UI_BUNDLES: Record<string, string> = {};

/**
 * Load UI HTML for a given resource URI.
 *
 * @param uri - The ui://mcp-erpnext/... resource URI
 * @returns The HTML content to serve
 * @throws Error if UI resource not found
 */
export async function loadUiHtml(uri: string): Promise<string> {
  if (UI_BUNDLES[uri]) {
    return UI_BUNDLES[uri];
  }

  const uiPath = uriToPath(uri);
  if (uiPath) {
    try {
      return await readTextFile(uiPath);
    } catch (e) {
      console.error(`[mcp-erpnext/ui] Failed to load UI from ${uiPath}:`, e);
    }
  }

  throw new Error(
    `[mcp-erpnext/ui] UI resource not found: ${uri}. ` +
      `Ensure dist/ folder contains the UI HTML bundles (run: cd src/ui && npm run build).`,
  );
}

/** Register a UI bundle at runtime */
export function registerUiBundle(uri: string, html: string): void {
  UI_BUNDLES[uri] = html;
}

/**
 * Convert ui:// URI to file path.
 * Extracts the viewer name from ui://mcp-erpnext/viewer-name pattern
 * and resolves it from the local dist/ folder.
 */
function uriToPath(uri: string): string | null {
  const match = uri.match(/^ui:\/\/[^/]+\/(.+)$/);
  if (match) {
    const uiName = match[1];
    const distPath = new URL(`./dist/${uiName}/index.html`, import.meta.url).pathname;
    if (statSync(distPath)) {
      return distPath;
    }
  }
  return null;
}

/** List all available UI resources */
export function listUiResources(): Array<{ uri: string; meta: UIResourceMeta }> {
  return Object.entries(UI_RESOURCES).map(([uri, meta]) => ({ uri, meta }));
}
