import type { NavHint } from "../jumps.ts";
import type { UiRefreshRequestData } from "../refresh.ts";

export type DocumentDisplayValue = string | number | boolean | null;

export type DocumentFieldKind =
  | "text"
  | "number"
  | "boolean"
  | "date"
  | "datetime"
  | "status"
  | "progress"
  | "json"
  | "empty";

export interface DocumentEnvelope {
  document: Record<string, unknown>;
  doctype: string;
  name: string;
  availableTools?: readonly string[];
  refreshRequest?: UiRefreshRequestData;
  sendMessageHints?: readonly NavHint[];
}

export interface DocumentFieldModel {
  key: string;
  label: string;
  value: DocumentDisplayValue;
  kind: DocumentFieldKind;
}

export interface DocumentCollectionModel {
  key: string;
  label: string;
  values: readonly DocumentDisplayValue[];
}

export interface ChildTableColumn {
  key: string;
  label: string;
  numeric: boolean;
}

export type ChildTableRow = Readonly<Record<string, DocumentDisplayValue>>;

export interface ChildTableTotal {
  key: string;
  label: string;
  value: number;
}

export interface ChildTableModel {
  key: string;
  label: string;
  rows: readonly ChildTableRow[];
  /** All business columns. Layout helpers choose the visible subset. */
  columns: readonly ChildTableColumn[];
  total?: ChildTableTotal;
}

export interface DocumentModel {
  envelope: DocumentEnvelope;
  title: string;
  status?: string;
  docstatus?: number;
  fields: readonly DocumentFieldModel[];
  longFields: readonly DocumentFieldModel[];
  progressFields: readonly DocumentFieldModel[];
  collections: readonly DocumentCollectionModel[];
  childTables: readonly ChildTableModel[];
  systemFields: readonly DocumentFieldModel[];
}

export type DocumentTableLayout = "wide" | "panel" | "mobile";
