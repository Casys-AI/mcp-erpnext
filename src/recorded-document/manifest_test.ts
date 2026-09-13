import { assertEquals } from "@std/assert";
import {
  parseRecordedDocumentViewAppManifest,
  RECORDED_DOCUMENT_VIEW_APP_MANIFEST,
  RECORDED_DOCUMENT_VIEW_APP_MANIFEST_JSON,
} from "./manifest.ts";
import {
  RECORDED_DOCUMENT_SCHEMA,
  RECORDED_DOCUMENT_SESSION_SCHEMA,
  RECORDED_DOCUMENT_VIEW_APP_VERSION,
  RECORDED_DOCUMENT_VIEWER_URI,
} from "./identities.ts";
import {
  VIEW_APP_MANIFEST_SCHEMA,
  VIEWER_SESSION_APPLY_ACTION,
} from "../shared/view-app.ts";

Deno.test("Recorded Document View App manifest is the published whole-view contract", () => {
  const parsed = parseRecordedDocumentViewAppManifest(
    JSON.parse(RECORDED_DOCUMENT_VIEW_APP_MANIFEST_JSON),
  );
  assertEquals(parsed.schemaVersion, VIEW_APP_MANIFEST_SCHEMA);
  assertEquals(parsed.app.version, RECORDED_DOCUMENT_VIEW_APP_VERSION);
  assertEquals(parsed.app.version, "3.1.0-beta.10");
  assertEquals(parsed.resources[0].uri, RECORDED_DOCUMENT_VIEWER_URI);
  assertEquals(parsed.resources[0].ownership, "whole-view");
  assertEquals(parsed.resources[0].acceptedActions, [
    VIEWER_SESSION_APPLY_ACTION,
  ]);
  assertEquals(parsed.resources[0].resultSchemas, [RECORDED_DOCUMENT_SCHEMA]);
  assertEquals(parsed.resources[0].sessionSchemas, [
    RECORDED_DOCUMENT_SESSION_SCHEMA,
  ]);
  assertEquals(
    RECORDED_DOCUMENT_VIEW_APP_MANIFEST.app.version.includes("local"),
    false,
  );
});
