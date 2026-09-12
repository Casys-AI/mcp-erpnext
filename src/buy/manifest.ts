/**
 * Exact View App manifest served next to the buy-evidence-viewer HTML resource.
 *
 * Presentation compatibility only. No runtime capability, qualification, or
 * ERP endpoint is claimed.
 */

import {
  BUY_EVIDENCE_VIEWER_URI,
  BUY_RECORDED_RESULT_SCHEMA,
  BUY_RECORDED_SESSION_SCHEMA,
  BUY_VIEW_APP_ID,
  BUY_VIEW_APP_TITLE,
  BUY_VIEW_APP_VERSION,
} from "./identities.ts";
import { denseArray, exactRecord, literal } from "./json.ts";

export const VIEW_APP_MANIFEST_SCHEMA =
  "io.casys.mcp.view-app-manifest/1.0" as const;
export const VIEWER_SESSION_APPLY_ACTION = "viewer.session.apply" as const;

export interface BuyViewAppManifest {
  readonly schemaVersion: typeof VIEW_APP_MANIFEST_SCHEMA;
  readonly app: {
    readonly id: typeof BUY_VIEW_APP_ID;
    readonly title: typeof BUY_VIEW_APP_TITLE;
    readonly version: typeof BUY_VIEW_APP_VERSION;
  };
  readonly resources: readonly [{
    readonly uri: typeof BUY_EVIDENCE_VIEWER_URI;
    readonly ownership: "whole-view";
    readonly resultSchemas: readonly [typeof BUY_RECORDED_RESULT_SCHEMA];
    readonly acceptedActions: readonly [typeof VIEWER_SESSION_APPLY_ACTION];
    readonly sessionSchemas: readonly [typeof BUY_RECORDED_SESSION_SCHEMA];
  }];
}

export const BUY_VIEW_APP_MANIFEST: BuyViewAppManifest = {
  schemaVersion: VIEW_APP_MANIFEST_SCHEMA,
  app: {
    id: BUY_VIEW_APP_ID,
    title: BUY_VIEW_APP_TITLE,
    version: BUY_VIEW_APP_VERSION,
  },
  resources: [{
    uri: BUY_EVIDENCE_VIEWER_URI,
    ownership: "whole-view",
    resultSchemas: [BUY_RECORDED_RESULT_SCHEMA],
    acceptedActions: [VIEWER_SESSION_APPLY_ACTION],
    sessionSchemas: [BUY_RECORDED_SESSION_SCHEMA],
  }],
};

export const BUY_VIEW_APP_MANIFEST_JSON: string = `${
  JSON.stringify(BUY_VIEW_APP_MANIFEST)
}\n`;

export function parseBuyViewAppManifest(value: unknown): BuyViewAppManifest {
  const root = exactRecord(
    value,
    ["schemaVersion", "app", "resources"],
    "Buy View App manifest",
  );
  literal(
    root.schemaVersion,
    VIEW_APP_MANIFEST_SCHEMA,
    "Buy View App manifest.schemaVersion",
  );
  const app = exactRecord(
    root.app,
    ["id", "title", "version"],
    "Buy View App manifest.app",
  );
  literal(app.id, BUY_VIEW_APP_ID, "Buy View App manifest.app.id");
  literal(app.title, BUY_VIEW_APP_TITLE, "Buy View App manifest.app.title");
  literal(
    app.version,
    BUY_VIEW_APP_VERSION,
    "Buy View App manifest.app.version",
  );
  const resources = denseArray(
    root.resources,
    "Buy View App manifest.resources",
  );
  if (resources.length !== 1) {
    throw new TypeError(
      "Buy View App manifest.resources must contain exactly one whole view.",
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
    "Buy View App manifest.resources[0]",
  );
  literal(
    resource.uri,
    BUY_EVIDENCE_VIEWER_URI,
    "Buy View App manifest.resources[0].uri",
  );
  literal(
    resource.ownership,
    "whole-view",
    "Buy View App manifest.resources[0].ownership",
  );
  const resultSchemas = denseArray(
    resource.resultSchemas,
    "Buy View App manifest.resources[0].resultSchemas",
  );
  if (
    resultSchemas.length !== 1 ||
    resultSchemas[0] !== BUY_RECORDED_RESULT_SCHEMA
  ) {
    throw new TypeError(
      "Buy View App manifest result schemas must be io.casys.mcp-erpnext.buy-recorded-result/1.0 exactly.",
    );
  }
  const acceptedActions = denseArray(
    resource.acceptedActions,
    "Buy View App manifest.resources[0].acceptedActions",
  );
  if (
    acceptedActions.length !== 1 ||
    acceptedActions[0] !== VIEWER_SESSION_APPLY_ACTION
  ) {
    throw new TypeError(
      "Buy View App manifest must accept viewer.session.apply exactly.",
    );
  }
  const sessionSchemas = denseArray(
    resource.sessionSchemas,
    "Buy View App manifest.resources[0].sessionSchemas",
  );
  if (
    sessionSchemas.length !== 1 ||
    sessionSchemas[0] !== BUY_RECORDED_SESSION_SCHEMA
  ) {
    throw new TypeError(
      "Buy View App manifest must bind buy-recorded-session/1.0 exactly.",
    );
  }
  return BUY_VIEW_APP_MANIFEST;
}

parseBuyViewAppManifest(BUY_VIEW_APP_MANIFEST);
