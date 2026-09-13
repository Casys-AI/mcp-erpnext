/**
 * Dedicated Vite config for the recorded document viewer.
 *
 * Reuses the published ERP UI pipeline and `@casys/mcp-view-components`
 * already declared in src/ui/package.json. No unpublished local MCP View roots.
 * UI_NAME is set before the shared config is loaded (static re-exports would
 * evaluate the shared config first).
 */

process.env.UI_NAME = "recorded-document-viewer";

const { default: config } = await import("../vite.single.config.mjs");
export default config;
