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

/**
 * Mise en page ERPNext du DocType, jointe par le serveur dans
 * `_meta["io.casys/viewer"]._fieldLayout` (`src/tools/doctype-layout.ts`).
 */
export interface DocumentFieldLayout {
  /** Champs à montrer d'abord, dans l'ordre d'affichage. */
  preview: readonly string[];
  /** Champs de données groupés par section ou onglet, dans l'ordre du DocType. */
  sections: readonly {
    label: string | null;
    fields: readonly string[];
  }[];
  /** `fieldname` vers libellé ERPNext. */
  labels: Readonly<Record<string, string>>;
}

export interface DocumentEnvelope {
  document: Record<string, unknown>;
  doctype: string;
  name: string;
  availableTools?: readonly string[];
  refreshRequest?: UiRefreshRequestData;
  sendMessageHints?: readonly NavHint[];
  fieldLayout?: DocumentFieldLayout;
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

/** Un groupe de champs de la mise en page ERPNext ; `label: null` : sans titre. */
export interface DocumentSectionModel {
  key: string;
  label: string | null;
  fields: readonly DocumentFieldModel[];
}

export interface DocumentModel {
  envelope: DocumentEnvelope;
  title: string;
  status?: string;
  docstatus?: number;
  /** Avec mise en page : les champs d'aperçu qui ont une valeur. */
  fields: readonly DocumentFieldModel[];
  /**
   * Présent seulement avec une mise en page : le reste des champs scalaires
   * non vides, groupés comme le DocType (groupes vides omis).
   */
  sections?: readonly DocumentSectionModel[];
  longFields: readonly DocumentFieldModel[];
  progressFields: readonly DocumentFieldModel[];
  collections: readonly DocumentCollectionModel[];
  childTables: readonly ChildTableModel[];
  systemFields: readonly DocumentFieldModel[];
}

export type DocumentTableLayout = "wide" | "panel" | "mobile";
