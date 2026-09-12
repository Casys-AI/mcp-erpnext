/**
 * Inspect the built whole-view HTML. The MCP View SDK may contain gated
 * callServerTool; this App must not embed live ERP tools or DocViewer.
 */

import {
  BUY_EVIDENCE_VIEWER_URI,
  BUY_RECORDED_RESULT_SCHEMA,
  BUY_RECORDED_SESSION_SCHEMA,
  BUY_VIEW_APP_ID,
} from "../../buy/identities.ts";
import { VIEWER_SESSION_APPLY_ACTION } from "../../buy/manifest.ts";

const html = await Deno.readTextFile(
  new URL("../dist/buy-evidence-viewer/index.html", import.meta.url),
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
requireContains(BUY_RECORDED_SESSION_SCHEMA);
requireContains(BUY_RECORDED_RESULT_SCHEMA);
requireContains(BUY_VIEW_APP_ID);
requireContains("buy.configuration-cost");
requireContains("covered-subtotal");
requireContains("partial");
requireContains("unavailable");
requireContains("unresolved");
requireContains("documentary");
requireAbsent("erpnext_file_download");
requireAbsent("erpnext_doc_submit");
requireAbsent("DocViewer");
requireAbsent("REFRESH_INTERVAL_MS");

if (!html.includes(BUY_EVIDENCE_VIEWER_URI) && !html.includes("buy-evidence")) {
  throw new Error("built viewer must identify the Buy evidence resource");
}

console.log(
  `[buy-evidence-viewer] whole-view HTML ok (${html.length} bytes)`,
);
