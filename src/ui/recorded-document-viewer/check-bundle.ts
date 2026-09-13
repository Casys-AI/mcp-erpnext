/**
 * Inspect the built whole-view HTML. The MCP View SDK may contain gated
 * callServerTool; this App must not embed live ERP tools or DocViewer.
 */

import {
  RECORDED_DOCUMENT_SCHEMA,
  RECORDED_DOCUMENT_SESSION_SCHEMA,
  RECORDED_DOCUMENT_VIEW_APP_ID,
  RECORDED_DOCUMENT_VIEWER_URI,
} from "../../recorded-document/identities.ts";
import { VIEWER_SESSION_APPLY_ACTION } from "../../shared/view-app.ts";

const html = await Deno.readTextFile(
  new URL("../dist/recorded-document-viewer/index.html", import.meta.url),
);

function requireContains(needle: string): void {
  if (!html.includes(needle)) {
    throw new Error(`built viewer is missing ${needle}`);
  }
}

function requireAbsent(needle: string): void {
  if (html.includes(needle)) {
    throw new Error(`built viewer must not contain ${needle}`);
  }
}

if ((html.match(/<!doctype html>/gi) ?? []).length !== 1) {
  throw new Error("the built viewer must contain exactly one HTML document");
}

requireContains(VIEWER_SESSION_APPLY_ACTION);
requireContains(RECORDED_DOCUMENT_SESSION_SCHEMA);
requireContains(RECORDED_DOCUMENT_SCHEMA);
requireContains(RECORDED_DOCUMENT_VIEW_APP_ID);
requireContains("recorded.document");
requireContains("recorded-document-viewer-state");
requireContains("available");
requireContains("unavailable");
requireContains("unresolved");
requireContains("historical");
requireAbsent("erpnext_file_download");
requireAbsent("erpnext_doc_submit");
requireAbsent("DocViewer");
requireAbsent("useAttachments");
requireAbsent("useViewerNav");
requireAbsent("LevelBody");
requireAbsent("REFRESH_INTERVAL_MS");

if (
  !html.includes(RECORDED_DOCUMENT_VIEWER_URI) &&
  !html.includes("recorded-document")
) {
  throw new Error("built viewer must identify the recorded document resource");
}

console.log(
  `[recorded-document-viewer] whole-view HTML ok (${html.length} bytes)`,
);
