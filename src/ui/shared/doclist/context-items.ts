import type { ContextSelectionItem } from "../active-context.ts";
import { documentContextItem } from "../document/context-items.ts";
import type { DocumentModel } from "../document/types.ts";

export function doclistRowContextItem(
  model: DocumentModel,
  visibleColumns: readonly { id: string; label: string }[],
  view: string,
  reconcileKey?: string,
): ContextSelectionItem {
  const fields = visibleColumns.slice(0, 6).flatMap((column) => {
    const raw = model.envelope.document[column.id];
    if (
      typeof raw !== "string" && typeof raw !== "number" &&
      typeof raw !== "boolean"
    ) return [];
    const value = String(raw).trim();
    return value ? [{ label: column.label, value }] : [];
  });
  return {
    ...documentContextItem(model, view, reconcileKey),
    fields,
    fieldsSource: "row",
  };
}
