/** Doclist Viewer types */

import type { UiRefreshRequestData } from "~/shared/refresh";

/** Server-driven row action — injected in tool payload to make rows clickable */
export interface RowAction {
  toolName: string;
  idField: string;
  argName: string;
  /** Extra static args merged into every callServerTool call (e.g. { doctype: "Campaign" }) */
  extraArgs?: Record<string, unknown>;
}

/** Navigation hint for sendMessage cross-viewer links */
/** Hint de navigation attaché par le serveur (`src/tools/ui-refresh.ts`). */
export interface SendMessageHint {
  /** Clé de libellé côté vue (`doclist.hint.<key>`), `label` en repli. */
  key?: string;
  label: string;
  message: string;
}

export interface DoclistData {
  count: number;
  doctype?: string;
  _title?: string;
  data: Record<string, unknown>[];
  refreshRequest?: UiRefreshRequestData;
  _rowAction?: RowAction;
  _sendMessageHints?: SendMessageHint[];
}

export type SortDir = "asc" | "desc";
