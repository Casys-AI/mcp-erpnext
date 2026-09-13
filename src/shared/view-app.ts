/**
 * View App protocol constants shared by whole-view manifests.
 *
 * The manifest schema and the session-apply action belong to the MCP View
 * App protocol, not to any business domain. Each domain manifest cites
 * these exact literals; no domain redefines them.
 */

export const VIEW_APP_MANIFEST_SCHEMA =
  "io.casys.mcp.view-app-manifest/1.0" as const;
export const VIEWER_SESSION_APPLY_ACTION = "viewer.session.apply" as const;
