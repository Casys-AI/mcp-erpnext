/**
 * Map a recorded document onto the shared document surface model.
 *
 * The adapter builds the passive envelope `{document, doctype, name}`
 * itself from the parsed record — the shared live-envelope parser is never
 * used here — then reuses `documentModelOf` and the six operational
 * profiles exactly. No refresh, tools, attachments, navigation, or context
 * slots are attached. Locally summed child-table totals are stripped, like
 * the operational dossiers do: ERP values are shown as kept, never
 * recomputed.
 */

import { documentModelOf } from "../../shared/document/model.ts";
import type {
  DocumentEnvelope,
  DocumentModel,
} from "../../shared/document/types.ts";
import type { RecordedDocumentViewData } from "./model.ts";

export function recordedViewDataToDocumentModel(
  data: RecordedDocumentViewData,
): DocumentModel {
  const envelope: DocumentEnvelope = {
    document: data.record.document,
    doctype: data.record.doctype,
    name: data.record.name,
  };
  const model = documentModelOf(envelope);
  return {
    ...model,
    childTables: model.childTables.map((table) => ({
      ...table,
      total: undefined,
    })),
  };
}
