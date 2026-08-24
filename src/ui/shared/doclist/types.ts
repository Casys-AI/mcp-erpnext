/** Doclist Viewer types */

import type { UiRefreshRequestData } from "../refresh.ts";

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
  key?: string;
  label: string;
  message: string;
  /** Quand l'hôte relaie les outils : l'outil et ses arguments (avec `{id}` / `{doctype}`). */
  tool?: string;
  args?: Record<string, unknown>;
  /** La forme du niveau qu'ouvre le saut — liste par défaut. */
  kind?: "list" | "record" | "chart";
}

export interface DoclistData {
  count: number;
  doctype?: string;
  _title?: string;
  data: Record<string, unknown>[];
  refreshRequest?: UiRefreshRequestData;
  /** Outils exacts autorisés par le registre serveur pour ce viewer. */
  _availableTools?: string[];
  _rowAction?: RowAction;
  _sendMessageHints?: SendMessageHint[];
}

export type SortDir = "asc" | "desc";
