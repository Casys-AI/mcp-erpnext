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
export interface SendMessageHint {
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
