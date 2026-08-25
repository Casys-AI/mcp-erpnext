export const UI_VIEWERS = [
  "invoice-viewer",
  "stock-viewer",
  "doclist-viewer",
  "doc-viewer",
  "chart-viewer",
  "kpi-viewer",
  "funnel-viewer",
  "kanban-viewer",
] as const;

/**
 * MCP Apps CSP metadata shared by every viewer resource.
 *
 * Attachment previews use local object URLs only: images consume `blob:` as a
 * static resource, while PDFs consume it as a nested frame. No remote origin is
 * opened by this policy.
 */
export const VIEWER_RESOURCE_META = {
  ui: {
    csp: {
      resourceDomains: ["blob:"],
      frameDomains: ["blob:"],
    },
  },
} as const;

/** Apply identical MCP Apps metadata to resources/list and resources/read. */
export function withViewerResourceMeta<T extends Record<string, unknown>>(
  resource: T,
): T & { _meta: typeof VIEWER_RESOURCE_META } {
  return { ...resource, _meta: VIEWER_RESOURCE_META };
}
