/**
 * Exact View App manifest served next to the recorded-document-viewer HTML
 * resource.
 *
 * Presentation compatibility only. No runtime capability, qualification, or
 * ERP endpoint is claimed.
 */

import {
  RECORDED_DOCUMENT_SCHEMA,
  RECORDED_DOCUMENT_SESSION_SCHEMA,
  RECORDED_DOCUMENT_VIEW_APP_ID,
  RECORDED_DOCUMENT_VIEW_APP_TITLE,
  RECORDED_DOCUMENT_VIEW_APP_VERSION,
  RECORDED_DOCUMENT_VIEWER_URI,
} from "./identities.ts";
import {
  VIEW_APP_MANIFEST_SCHEMA,
  VIEWER_SESSION_APPLY_ACTION,
} from "../shared/view-app.ts";
import { denseArray, exactRecord, literal } from "../shared/json.ts";

export interface RecordedDocumentViewAppManifest {
  readonly schemaVersion: typeof VIEW_APP_MANIFEST_SCHEMA;
  readonly app: {
    readonly id: typeof RECORDED_DOCUMENT_VIEW_APP_ID;
    readonly title: typeof RECORDED_DOCUMENT_VIEW_APP_TITLE;
    readonly version: typeof RECORDED_DOCUMENT_VIEW_APP_VERSION;
  };
  readonly resources: readonly [{
    readonly uri: typeof RECORDED_DOCUMENT_VIEWER_URI;
    readonly ownership: "whole-view";
    readonly resultSchemas: readonly [typeof RECORDED_DOCUMENT_SCHEMA];
    readonly acceptedActions: readonly [typeof VIEWER_SESSION_APPLY_ACTION];
    readonly sessionSchemas: readonly [typeof RECORDED_DOCUMENT_SESSION_SCHEMA];
  }];
}

export const RECORDED_DOCUMENT_VIEW_APP_MANIFEST:
  RecordedDocumentViewAppManifest = {
    schemaVersion: VIEW_APP_MANIFEST_SCHEMA,
    app: {
      id: RECORDED_DOCUMENT_VIEW_APP_ID,
      title: RECORDED_DOCUMENT_VIEW_APP_TITLE,
      version: RECORDED_DOCUMENT_VIEW_APP_VERSION,
    },
    resources: [{
      uri: RECORDED_DOCUMENT_VIEWER_URI,
      ownership: "whole-view",
      resultSchemas: [RECORDED_DOCUMENT_SCHEMA],
      acceptedActions: [VIEWER_SESSION_APPLY_ACTION],
      sessionSchemas: [RECORDED_DOCUMENT_SESSION_SCHEMA],
    }],
  };

export const RECORDED_DOCUMENT_VIEW_APP_MANIFEST_JSON: string = `${
  JSON.stringify(RECORDED_DOCUMENT_VIEW_APP_MANIFEST)
}\n`;

export function parseRecordedDocumentViewAppManifest(
  value: unknown,
): RecordedDocumentViewAppManifest {
  const root = exactRecord(
    value,
    ["schemaVersion", "app", "resources"],
    "Recorded Document View App manifest",
    "recorded-document contract",
  );
  literal(
    root.schemaVersion,
    VIEW_APP_MANIFEST_SCHEMA,
    "Recorded Document View App manifest.schemaVersion",
  );
  const app = exactRecord(
    root.app,
    ["id", "title", "version"],
    "Recorded Document View App manifest.app",
    "recorded-document contract",
  );
  literal(
    app.id,
    RECORDED_DOCUMENT_VIEW_APP_ID,
    "Recorded Document View App manifest.app.id",
  );
  literal(
    app.title,
    RECORDED_DOCUMENT_VIEW_APP_TITLE,
    "Recorded Document View App manifest.app.title",
  );
  literal(
    app.version,
    RECORDED_DOCUMENT_VIEW_APP_VERSION,
    "Recorded Document View App manifest.app.version",
  );
  const resources = denseArray(
    root.resources,
    "Recorded Document View App manifest.resources",
  );
  if (resources.length !== 1) {
    throw new TypeError(
      "Recorded Document View App manifest.resources must contain exactly one whole view.",
    );
  }
  const resource = exactRecord(
    resources[0],
    [
      "uri",
      "ownership",
      "resultSchemas",
      "acceptedActions",
      "sessionSchemas",
    ],
    "Recorded Document View App manifest.resources[0]",
    "recorded-document contract",
  );
  literal(
    resource.uri,
    RECORDED_DOCUMENT_VIEWER_URI,
    "Recorded Document View App manifest.resources[0].uri",
  );
  literal(
    resource.ownership,
    "whole-view",
    "Recorded Document View App manifest.resources[0].ownership",
  );
  const resultSchemas = denseArray(
    resource.resultSchemas,
    "Recorded Document View App manifest.resources[0].resultSchemas",
  );
  if (
    resultSchemas.length !== 1 ||
    resultSchemas[0] !== RECORDED_DOCUMENT_SCHEMA
  ) {
    throw new TypeError(
      "Recorded Document View App manifest result schemas must list recorded-document/1.0 exactly.",
    );
  }
  const acceptedActions = denseArray(
    resource.acceptedActions,
    "Recorded Document View App manifest.resources[0].acceptedActions",
  );
  if (
    acceptedActions.length !== 1 ||
    acceptedActions[0] !== VIEWER_SESSION_APPLY_ACTION
  ) {
    throw new TypeError(
      "Recorded Document View App manifest must accept viewer.session.apply exactly.",
    );
  }
  const sessionSchemas = denseArray(
    resource.sessionSchemas,
    "Recorded Document View App manifest.resources[0].sessionSchemas",
  );
  if (
    sessionSchemas.length !== 1 ||
    sessionSchemas[0] !== RECORDED_DOCUMENT_SESSION_SCHEMA
  ) {
    throw new TypeError(
      "Recorded Document View App manifest must bind recorded-document-session/1.0 exactly.",
    );
  }
  return RECORDED_DOCUMENT_VIEW_APP_MANIFEST;
}

parseRecordedDocumentViewAppManifest(RECORDED_DOCUMENT_VIEW_APP_MANIFEST);
