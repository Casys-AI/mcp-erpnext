import { FrappeAPIError } from "../api/frappe-client.ts";
import type { FrappeClient } from "../api/frappe-client.ts";
import type { FrappeDoc } from "../api/types.ts";

const SELLING_DOCTYPES = new Set([
  "Sales Order",
  "Sales Invoice",
  "Quotation",
]);
const BUYING_DOCTYPES = new Set([
  "Purchase Order",
  "Purchase Invoice",
  "Purchase Receipt",
]);
const WAREHOUSE_DOCTYPES = new Set([
  "Sales Order",
  "Sales Invoice",
  "Purchase Order",
  "Purchase Invoice",
  "Purchase Receipt",
  "Delivery Note",
  "Stock Entry",
  "Work Order",
]);
const WAREHOUSE_FIELDS = new Set([
  "warehouse",
  "set_warehouse",
  "from_warehouse",
  "to_warehouse",
  "s_warehouse",
  "t_warehouse",
  "wip_warehouse",
  "fg_warehouse",
]);
const RECOVERY_PREFIX = "\nRecovery: ";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mandatoryFields(
  body: Record<string, unknown>,
  doctype: string,
): string[] {
  if (typeof body.exception !== "string") return [];
  // Native MandatoryError exposes field names here only when traces are allowed.
  // Match that single exception line, never traceback text or translated labels.
  const match =
    /^(?:frappe\.exceptions\.)?MandatoryError: \[([^,\[\]\r\n]+), [^\[\]\r\n]+\]: ([a-z][a-z0-9_]*(?:, [a-z][a-z0-9_]*)*)$/
      .exec(body.exception);
  return match?.[1] === doctype ? match[2].split(", ") : [];
}

function mandatoryRecovery(
  body: Record<string, unknown>,
  doctype: string,
): string {
  const fields = mandatoryFields(body, doctype);
  const hints: string[] = [];
  if (doctype === "Item" && fields.includes("stock_uom")) {
    hints.push(
      "Set stock_uom to an existing UOM; erpnext_item_create exposes this field as uom.",
    );
  }
  if (doctype === "Item" && fields.includes("item_group")) {
    hints.push("Set item_group to an existing Item Group.");
  }
  if (SELLING_DOCTYPES.has(doctype) && fields.includes("selling_price_list")) {
    hints.push(
      "Set selling_price_list to an enabled selling Price List and check its currency.",
    );
  }
  if (doctype === "Price List" && fields.includes("currency")) {
    hints.push("Set the Price List's currency to an existing Currency.");
  }
  if (
    WAREHOUSE_DOCTYPES.has(doctype) &&
    fields.some((field) => WAREHOUSE_FIELDS.has(field))
  ) {
    hints.push(
      "Set the required warehouse fields on the document or indicated item rows, using warehouses for the document's company.",
    );
  }
  const general =
    "Supply the required fields identified by ERPNext, including any indicated child rows; correct the creation data or its defaults.";
  return [general, ...hints].join(" ");
}

function hasRaisedDisabledPriceListTitle(
  body: Record<string, unknown>,
): boolean {
  if (typeof body._server_messages !== "string") return false;
  try {
    const messages: unknown = JSON.parse(body._server_messages);
    if (!Array.isArray(messages)) return false;
    return messages.some((encoded) => {
      if (typeof encoded !== "string") return false;
      const message: unknown = JSON.parse(encoded);
      return isRecord(message) && message.title === "Disabled Price List" &&
        (message.raise_exception === 1 || message.raise_exception === true);
    });
  } catch {
    return false;
  }
}

function recoveryFor(
  body: Record<string, unknown>,
  doctype: string,
  data: Record<string, unknown>,
): string | undefined {
  switch (body.exc_type) {
    case "LinkValidationError":
      return "Use erpnext_doc_list or erpnext_doc_get to look up the linked documents named by ERPNext, then correct the creation data with their exact existing IDs.";
    case "MandatoryError":
      return mandatoryRecovery(body, doctype);
    case "WarehouseRequired":
      return doctype === "Sales Order"
        ? "Set the warehouse on the affected stock item rows, or set_warehouse on the Sales Order, using a warehouse for the order's company."
        : undefined;
    case "WarehouseMissingError":
      return doctype === "Purchase Invoice" &&
          (data.update_stock === 1 || data.update_stock === true)
        ? "With update_stock enabled, set warehouse on the affected Purchase Invoice item rows using warehouses for the invoice's company."
        : undefined;
    case "ValidationError":
      // This exact native English title is a limited fallback, not a locale parser.
      return (SELLING_DOCTYPES.has(doctype) || BUYING_DOCTYPES.has(doctype)) &&
          hasRaisedDisabledPriceListTitle(body)
        ? "Choose an enabled Price List for this document's selling or buying side; verify the list named by ERPNext before changing defaults."
        : undefined;
    default:
      return undefined;
  }
}

export async function createWithDiagnostics<T extends FrappeDoc = FrappeDoc>(
  client: FrappeClient,
  doctype: string,
  data: Record<string, unknown>,
): Promise<T> {
  try {
    return await client.create<T>(doctype, data as Partial<T>);
  } catch (error) {
    if (
      error instanceof FrappeAPIError && error.status === 417 &&
      isRecord(error.body) && !error.message.includes(RECOVERY_PREFIX)
    ) {
      const recovery = recoveryFor(error.body, doctype, data);
      if (recovery) error.message += `${RECOVERY_PREFIX}${recovery}`;
    }
    throw error;
  }
}
