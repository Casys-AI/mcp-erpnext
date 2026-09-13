import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import {
  BUY_RECORDED_RESULT_SCHEMA,
  BUY_RECORDED_RESULT_SCHEMA_V2,
  BUY_RECORDED_SESSION_SCHEMA,
  BUY_VIEW_APP_ID,
} from "../../buy/identities.ts";
import { VIEWER_SESSION_APPLY_ACTION } from "../../buy/manifest.ts";

const html = await readBuiltHtml();

Deno.test({
  name: "built buy-evidence-viewer HTML is a whole-view with session apply",
  ignore: html === null,
  fn() {
    if (html === null) return;
    assertEquals(
      (html.match(/<!doctype html>/gi) ?? []).length,
      1,
      "the built viewer must contain exactly one HTML document",
    );
    assertStringIncludes(html, VIEWER_SESSION_APPLY_ACTION);
    assertStringIncludes(html, BUY_RECORDED_SESSION_SCHEMA);
    assertStringIncludes(html, BUY_RECORDED_RESULT_SCHEMA);
    assertStringIncludes(html, BUY_RECORDED_RESULT_SCHEMA_V2);
    assertStringIncludes(html, BUY_VIEW_APP_ID);
    assertStringIncludes(html, "buy.configuration-cost");
    assertStringIncludes(html, "covered-subtotal");
    assert(html.includes("partial"));
    assert(html.includes("unavailable"));
    assert(html.includes("unresolved"));
    assert(html.includes("documentary"));
    assertEquals(html.includes("erpnext_file_download"), false);
    assertEquals(html.includes("erpnext_doc_submit"), false);
    assertEquals(html.includes("DocViewer"), false);
    assertEquals(html.includes("REFRESH_INTERVAL_MS"), false);
  },
});

async function readBuiltHtml(): Promise<string | null> {
  try {
    return await Deno.readTextFile(
      new URL("../dist/buy-evidence-viewer/index.html", import.meta.url),
    );
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return null;
    throw error;
  }
}
