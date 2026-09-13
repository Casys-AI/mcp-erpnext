import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import {
  RECORDED_DOCUMENT_SCHEMA,
  RECORDED_DOCUMENT_SESSION_SCHEMA,
  RECORDED_DOCUMENT_VIEW_APP_ID,
} from "../../recorded-document/identities.ts";
import { VIEWER_SESSION_APPLY_ACTION } from "../../shared/view-app.ts";

const html = await readBuiltHtml();

Deno.test({
  name:
    "built recorded-document-viewer HTML is a whole-view with session apply",
  ignore: html === null,
  fn() {
    if (html === null) return;
    assertEquals(
      (html.match(/<!doctype html>/gi) ?? []).length,
      1,
      "the built viewer must contain exactly one HTML document",
    );
    assertStringIncludes(html, VIEWER_SESSION_APPLY_ACTION);
    assertStringIncludes(html, RECORDED_DOCUMENT_SESSION_SCHEMA);
    assertStringIncludes(html, RECORDED_DOCUMENT_SCHEMA);
    assertStringIncludes(html, RECORDED_DOCUMENT_VIEW_APP_ID);
    assertStringIncludes(html, "recorded.document");
    assertStringIncludes(html, "recorded-document-viewer-state");
    assertStringIncludes(html, 'aria-live="polite"');
    assertStringIncludes(html, 'aria-busy="true"');
    assertStringIncludes(html, "Loading recorded document…");
    assert(html.includes("available"));
    assert(html.includes("unavailable"));
    assert(html.includes("unresolved"));
    assert(html.includes("historical"));
    assertEquals(html.includes("erpnext_file_download"), false);
    assertEquals(html.includes("erpnext_doc_submit"), false);
    assertEquals(html.includes("DocViewer"), false);
    assertEquals(html.includes("useAttachments"), false);
    assertEquals(html.includes("useViewerNav"), false);
    assertEquals(html.includes("LevelBody"), false);
    assertEquals(html.includes("REFRESH_INTERVAL_MS"), false);
  },
});

async function readBuiltHtml(): Promise<string | null> {
  try {
    return await Deno.readTextFile(
      new URL("../dist/recorded-document-viewer/index.html", import.meta.url),
    );
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return null;
    throw error;
  }
}
