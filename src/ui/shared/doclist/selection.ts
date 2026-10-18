import { DOC_LIST_DEFAULT_LIMIT } from "../../doc-list-defaults.ts";
import type { DocumentModel } from "../document/types.ts";
import type { SelectionGroupMemberInput } from "../selection-projection.ts";
import { pickAmountColumn, pickDateColumn } from "./columns.ts";
import { doclistRowContextItem } from "./context-items.ts";
import type { DoclistData } from "./types.ts";

/** Les colonnes d'un outil dédié peuvent être des alias absents de Frappe. */
export function doclistQueryFields(data: DoclistData): string[] {
  const request = data.refreshRequest;
  const fields = request?.arguments.fields;
  if (
    request?.toolName !== "erpnext_doc_list" || !Array.isArray(fields) ||
    !fields.every((field) => typeof field === "string")
  ) return ["name"];
  return [...new Set(["name", ...fields])];
}

function amountCurrency(
  document: Record<string, unknown>,
  amountKey: string | undefined,
): string | undefined {
  let currencyKeys: string[];
  switch (amountKey) {
    case "received_amount":
      currencyKeys = ["paid_to_account_currency"];
      break;
    case "paid_amount":
      // accounting.ts expose aussi currency comme alias de la devise payée.
      currencyKeys = ["paid_from_account_currency", "currency"];
      break;
    case "grand_total":
    case "rounded_total":
    case "net_total":
    case "total":
    case "outstanding_amount":
      currencyKeys = ["currency"];
      break;
    default:
      // Les champs base_* nécessiteraient la devise de la société, inconnue ici.
      return undefined;
  }
  for (const key of currencyKeys) {
    const currency = document[key];
    if (typeof currency === "string" && currency.trim()) return currency.trim();
  }
  return undefined;
}

export function doclistGroupMember(
  model: DocumentModel,
  columns: readonly { id: string; label: string; numeric: boolean }[],
  view: string,
  reconcileKey?: string,
): SelectionGroupMemberInput {
  const item = doclistRowContextItem(model, columns, view, reconcileKey);
  const document = model.envelope.document;
  const dateKey = pickDateColumn(columns);
  const amountKey = pickAmountColumn(columns);
  const date = dateKey ? document[dateKey] : undefined;
  const amount = amountKey ? document[amountKey] : undefined;
  const currency = amountCurrency(document, amountKey);
  return {
    name: model.envelope.name,
    label: item.label,
    ...(item.value !== undefined ? { value: item.value } : {}),
    fields: item.fields,
    fieldsSource: "row",
    ...(item.modified ? { modified: item.modified } : {}),
    ...(typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? { date }
      : {}),
    // Une valeur devenue inconnue doit effacer les bornes du précédent refresh.
    amount: currency && typeof amount === "number" && Number.isFinite(amount)
      ? amount
      : undefined,
    currency,
  };
}

export function doclistHeaderSelection(
  filteredMembers: readonly SelectionGroupMemberInput[],
  selectedMembers: readonly SelectionGroupMemberInput[],
) {
  const selectedNames = new Set(selectedMembers.map((member) => member.name));
  const totalCount = filteredMembers.length;
  const selectedCount =
    filteredMembers.filter((member) => selectedNames.has(member.name)).length;
  return {
    checked: totalCount > 0 && selectedCount === totalCount,
    indeterminate: selectedCount > 0 && selectedCount < totalCount,
    selectedCount,
    totalCount,
  };
}

export function doclistFilteredSelectionOperation(
  checked: boolean,
  filteredMembers: readonly SelectionGroupMemberInput[],
):
  | { kind: "add"; members: SelectionGroupMemberInput[] }
  | { kind: "remove"; names: string[] } {
  return checked
    ? { kind: "remove", names: filteredMembers.map((member) => member.name) }
    : { kind: "add", members: [...filteredMembers] };
}

function unionMembers(
  current: readonly SelectionGroupMemberInput[],
  added: readonly SelectionGroupMemberInput[],
): SelectionGroupMemberInput[] {
  return [...new Map(
    [...current, ...added].map((member) => [member.name, member]),
  ).values()];
}

/** Le filtre s'applique avant la pagination ; les membres hors filtre restent. */
export function toggleDoclistFilteredMembers(
  selectedMembers: readonly SelectionGroupMemberInput[],
  filteredMembers: readonly SelectionGroupMemberInput[],
): SelectionGroupMemberInput[] {
  if (!doclistHeaderSelection(filteredMembers, selectedMembers).checked) {
    return unionMembers(selectedMembers, filteredMembers);
  }
  const names = new Set(filteredMembers.map((member) => member.name));
  return selectedMembers.filter((member) => !names.has(member.name));
}

/** L'identité de l'ancre survit aux tris ; sa position est recalculée au clic. */
export function extendDoclistRange(
  selectedMembers: readonly SelectionGroupMemberInput[],
  sortedFilteredMembers: readonly SelectionGroupMemberInput[],
  anchorName: string | null,
  targetName: string,
): SelectionGroupMemberInput[] {
  const target = sortedFilteredMembers.findIndex((member) =>
    member.name === targetName
  );
  if (target < 0) return [...selectedMembers];
  const anchor = sortedFilteredMembers.findIndex((member) =>
    member.name === anchorName
  );
  const from = anchor < 0 ? target : anchor;
  return unionMembers(
    selectedMembers,
    sortedFilteredMembers.slice(
      Math.min(from, target),
      Math.max(from, target) + 1,
    ),
  );
}

interface CheckboxClickEvent {
  shiftKey: boolean;
  stopPropagation(): void;
}

export function doclistCheckboxEvents(
  onClick: (event: CheckboxClickEvent) => void,
) {
  const stop = (event: { stopPropagation(): void }) => event.stopPropagation();
  return {
    onClick: (event: CheckboxClickEvent) => {
      stop(event);
      onClick(event);
    },
    onDblClick: stop,
    // Ne pas annuler l'action native : Espace doit encore cocher la case.
    onKeyDown: stop,
  };
}

/**
 * Seul doc_list garantit ce contrat de pagination. Les autres outils ne peuvent
 * confirmer une absence, même avec limit : leur refresh ne retire aucun membre.
 * `count` désigne la fenêtre renvoyée, jamais le nombre total en base.
 */
export function isDoclistResultComplete(data: DoclistData): boolean {
  const request = data.refreshRequest;
  if (
    request?.toolName !== "erpnext_doc_list" ||
    data.count !== data.data.length
  ) return false;
  const args = request.arguments;
  if (
    (args.offset !== undefined && args.offset !== 0) ||
    (args.limit_start !== undefined && args.limit_start !== 0)
  ) return false;
  const limit = args.limit === undefined ? DOC_LIST_DEFAULT_LIMIT : args.limit;
  if (
    typeof limit !== "number" || !Number.isSafeInteger(limit) || limit < 0
  ) return false;
  return limit === 0 || data.count < limit;
}
