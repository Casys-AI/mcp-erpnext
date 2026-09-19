import { assertEquals } from "@std/assert";
import {
  BUY_VIEW_APP_MANIFEST,
  BUY_VIEW_APP_MANIFEST_JSON,
  parseBuyViewAppManifest,
  VIEW_APP_MANIFEST_SCHEMA,
  VIEWER_SESSION_APPLY_ACTION,
} from "./manifest.ts";
import {
  BUY_EVIDENCE_VIEWER_URI,
  BUY_RECORDED_RESULT_SCHEMA,
  BUY_RECORDED_RESULT_SCHEMA_V2,
  BUY_RECORDED_SESSION_SCHEMA,
  BUY_VIEW_APP_VERSION,
} from "./identities.ts";

Deno.test("Buy View App manifest is the published whole-view contract", () => {
  const parsed = parseBuyViewAppManifest(
    JSON.parse(BUY_VIEW_APP_MANIFEST_JSON),
  );
  assertEquals(parsed.schemaVersion, VIEW_APP_MANIFEST_SCHEMA);
  assertEquals(parsed.app.version, BUY_VIEW_APP_VERSION);
  assertEquals(parsed.app.version, "3.1.0-beta.11");
  assertEquals(parsed.resources[0].uri, BUY_EVIDENCE_VIEWER_URI);
  assertEquals(parsed.resources[0].ownership, "whole-view");
  assertEquals(parsed.resources[0].acceptedActions, [
    VIEWER_SESSION_APPLY_ACTION,
  ]);
  assertEquals(parsed.resources[0].resultSchemas, [
    BUY_RECORDED_RESULT_SCHEMA,
    BUY_RECORDED_RESULT_SCHEMA_V2,
  ]);
  assertEquals(parsed.resources[0].sessionSchemas, [
    BUY_RECORDED_SESSION_SCHEMA,
  ]);
  assertEquals(BUY_VIEW_APP_MANIFEST.app.version.includes("local"), false);
});
