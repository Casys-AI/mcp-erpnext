/**
 * Réponses d'outils pour l'hôte de démonstration.
 *
 * Même forme que le serveur : un bloc texte JSON. Les listes portent
 * `{ doctype, count, data }`, les lectures `{ data }`. Rien ici n'est lu
 * par le code de production : c'est le décor d'un banc d'essai.
 */

import {
  INVOICE_FIXTURE,
  ITEM_FIXTURES,
} from "../../invoice-viewer/src/fixture.ts";
import { DOCLIST_FIXTURE } from "../../doclist-viewer/src/fixture.ts";
import {
  KANBAN_FIXTURE,
  KANBAN_FIXTURE_DETAILS,
  KANBAN_FIXTURE_USERS,
} from "../../kanban-viewer/src/fixture.ts";
import { STOCK_FIXTURE } from "../../stock-viewer/src/fixture.ts";
import { FUNNEL_FIXTURE } from "../../funnel-viewer/src/fixture.ts";
import { KPI_FIXTURE } from "../../kpi-viewer/src/fixture.ts";

export type ViewerKey =
  | "invoice"
  | "doclist"
  | "doc"
  | "kanban"
  | "stock"
  | "funnel"
  | "kpi"
  | "chart";

const DEV_AVAILABLE_TOOLS: Partial<Record<ViewerKey, readonly string[]>> = {
  invoice: [
    "erpnext_sales_invoice_get",
    "erpnext_doc_submit",
    "erpnext_doc_cancel",
    "erpnext_sales_invoice_submit",
    "erpnext_item_get",
    "erpnext_stock_balance",
    "erpnext_doc_list",
    "erpnext_customer_get",
    "erpnext_doc_get",
    "erpnext_file_download",
    "erpnext_file_list",
    "erpnext_file_upload",
  ],
  doclist: [
    "erpnext_sales_invoice_list",
    "erpnext_sales_invoice_get",
    "erpnext_doc_get",
    "erpnext_doc_list",
    "erpnext_doc_submit",
    "erpnext_doc_cancel",
  ],
  doc: [
    "erpnext_doc_cancel",
    "erpnext_doc_get",
    "erpnext_doc_submit",
    "erpnext_file_download",
    "erpnext_file_list",
    "erpnext_file_upload",
  ],
  kanban: [
    "erpnext_kanban_get_board",
    "erpnext_kanban_move_card",
    "erpnext_doc_get",
    "erpnext_doc_update",
    "erpnext_user_list",
    "erpnext_doc_assign",
    "erpnext_doc_unassign",
    "erpnext_doc_list",
  ],
  stock: [
    "erpnext_stock_balance",
    "erpnext_item_get",
    "erpnext_stock_entry_list",
    "erpnext_doc_list",
    "erpnext_stock_chart",
    "erpnext_doc_get",
  ],
};

/** Décore les payloads canned comme le registre complet du serveur. */
export function withDevViewerTools(
  viewer: ViewerKey,
  payload: unknown,
): unknown {
  const tools = DEV_AVAILABLE_TOOLS[viewer];
  if (!tools || typeof payload !== "object" || payload === null) return payload;
  return { ...payload, _availableTools: [...tools] };
}

type Row = Record<string, unknown>;

export const DEV_DOCUMENT_DOCTYPE = "BOM";
export const DEV_DOCUMENT_NAME = "BOM-2026-00042";
export const DEV_INVOICE_DOCTYPE = "Sales Invoice";
export const DEV_INVOICE_NAME = "ACC-SINV-2026-00042";

/**
 * Fiche générique volontairement différente des viewers métier dédiés. Les
 * deux tables enfant permettent de vérifier le rendu récursif du doc-viewer.
 */
export const DEV_DOCUMENT_FIXTURE = {
  data: {
    doctype: DEV_DOCUMENT_DOCTYPE,
    name: DEV_DOCUMENT_NAME,
    item: "PACK-LINE-CONTROL-CABINET",
    item_name: "Packaging line control cabinet",
    company: "Casys Taiwan",
    quantity: 1,
    uom: "Nos",
    is_active: 1,
    is_default: 0,
    docstatus: 0,
    description:
      "Manufacturing definition for the control cabinet used on the Taichung packaging line.",
    items: [
      {
        idx: 1,
        item_code: "PLC-CPU-1516",
        item_name: "Fail-safe PLC CPU",
        qty: 1,
        uom: "Nos",
        source_warehouse: "Stores - CS",
        rate: 2_840,
        amount: 2_840,
      },
      {
        idx: 2,
        item_code: "IO-REMOTE-ET200",
        item_name: "Remote I/O station",
        qty: 2,
        uom: "Nos",
        source_warehouse: "Stores - CS",
        rate: 680,
        amount: 1_360,
      },
      {
        idx: 3,
        item_code: "ENCLOSURE-IP55",
        item_name: "IP55 floor-standing enclosure",
        qty: 1,
        uom: "Nos",
        source_warehouse: "Fabrication - CS",
        rate: 940,
        amount: 940,
      },
    ],
    operations: [
      {
        idx: 1,
        operation: "Electrical assembly",
        workstation: "Panel Shop - CS",
        time_in_mins: 180,
        hourly_rate: 54,
        operating_cost: 162,
      },
      {
        idx: 2,
        operation: "Factory acceptance test",
        workstation: "FAT Bench - CS",
        time_in_mins: 120,
        hourly_rate: 72,
        operating_cost: 144,
      },
    ],
    owner: "engineering@casys.ai",
    creation: "2026-08-21 09:18:00",
    modified: "2026-08-24 16:42:00",
  },
  refreshRequest: {
    toolName: "erpnext_doc_get",
    arguments: {
      doctype: DEV_DOCUMENT_DOCTYPE,
      name: DEV_DOCUMENT_NAME,
    },
  },
};

interface CannedAttachment {
  name: string;
  file_name: string;
  file_url: string;
  file_size: number;
  is_private: boolean;
  attached_to_field: string | null;
  creation: string;
  modified: string;
  owner: string;
  mimeType: string;
  blob: string;
}

/** Small valid three-page PDF used to exercise native page thumbnails. */
function demoPdfBase64(): string {
  const pageText = (page: number) =>
    `BT /F1 24 Tf 72 700 Td (Control cabinet drawing - page ${page}) Tj ET\n`;
  const stream = (content: string) =>
    `<< /Length ${content.length} >>\nstream\n${content}endstream`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R /PageMode /UseThumbs >>",
    "<< /Type /Pages /Kids [3 0 R 5 0 R 7 0 R] /Count 3 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 9 0 R >> >> /Contents 4 0 R >>",
    stream(pageText(1)),
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 9 0 R >> >> /Contents 6 0 R >>",
    stream(pageText(2)),
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 9 0 R >> >> /Contents 8 0 R >>",
    stream(pageText(3)),
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n% Casys dev-host multipage fixture\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  pdf += offsets.slice(1).map((offset) =>
    `${String(offset).padStart(10, "0")} 00000 n \n`
  ).join("");
  pdf += `trailer\n<< /Size ${
    objects.length + 1
  } /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return btoa(pdf);
}

const DEMO_PDF_BLOB = demoPdfBase64();

const INITIAL_DOCUMENT_FILES: readonly CannedAttachment[] = [
  {
    name: "FILE-BOM-001",
    file_name: "control-cabinet-drawing.pdf",
    file_url: "/private/files/control-cabinet-drawing.pdf",
    file_size: approximateBase64Bytes(DEMO_PDF_BLOB),
    is_private: true,
    attached_to_field: null,
    creation: "2026-08-24 15:10:00",
    modified: "2026-08-24 15:10:00",
    owner: "engineering@casys.ai",
    mimeType: "application/pdf",
    blob: DEMO_PDF_BLOB,
  },
  {
    name: "FILE-BOM-002",
    file_name: "bill-of-materials.csv",
    file_url: "/files/bill-of-materials.csv",
    file_size: 27,
    is_private: false,
    attached_to_field: null,
    creation: "2026-08-23 11:20:00",
    modified: "2026-08-23 11:20:00",
    owner: "planner@casys.ai",
    mimeType: "text/csv",
    blob: "aXRlbV9jb2RlLHF0eQpQTEMtQ1BVLDEK",
  },
];

let documentFiles: CannedAttachment[] = [];
let uploadSequence = 0;

/** Reset mutable upload state whenever the dev-host remounts a viewer. */
export function resetCannedState(): void {
  documentFiles = INITIAL_DOCUMENT_FILES.map((file) => ({ ...file }));
  uploadSequence = 0;
}

resetCannedState();

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function approximateBase64Bytes(blob: string): number {
  const compact = blob.replace(/\s/g, "");
  if (!compact) return 0;
  const padding = compact.endsWith("==") ? 2 : compact.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor(compact.length * 3 / 4) - padding);
}

function mimeTypeForFileName(fileName: string): string {
  const extension = fileName.toLowerCase().split(".").pop();
  return {
    csv: "text/csv",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    json: "application/json",
    pdf: "application/pdf",
    png: "image/png",
    txt: "text/plain",
  }[extension ?? ""] ?? "application/octet-stream";
}

function fileListRow(file: CannedAttachment): Row {
  return {
    name: file.name,
    file_name: file.file_name,
    file_url: file.file_url,
    file_size: file.file_size,
    is_private: file.is_private,
    attached_to_field: file.attached_to_field,
    creation: file.creation,
    modified: file.modified,
    owner: file.owner,
  };
}

function attachmentTarget(
  viewer: ViewerKey,
  args: Record<string, unknown>,
): { doctype: string; name: string } | null {
  const target = viewer === "doc"
    ? { doctype: DEV_DOCUMENT_DOCTYPE, name: DEV_DOCUMENT_NAME }
    : viewer === "invoice"
    ? { doctype: DEV_INVOICE_DOCTYPE, name: DEV_INVOICE_NAME }
    : null;
  if (
    !target || args.attached_to_doctype !== target.doctype ||
    args.attached_to_name !== target.name
  ) return null;
  return target;
}

export interface CannedDownloadToolResult {
  [key: string]: unknown;
  content: [
    { type: "text"; text: string },
    {
      type: "resource";
      resource: { uri: string; mimeType: string; blob: string };
    },
  ];
}

/** Narrow guard used by the host to avoid JSON-wrapping binary tool results. */
export function isCannedDownloadToolResult(
  value: unknown,
): value is CannedDownloadToolResult {
  const result = record(value);
  if (
    !result || !Array.isArray(result.content) || result.content.length !== 2
  ) {
    return false;
  }
  const text = record(result.content[0]);
  const embedded = record(result.content[1]);
  const resource = record(embedded?.resource);
  return text?.type === "text" && typeof text.text === "string" &&
    embedded?.type === "resource" && typeof resource?.uri === "string" &&
    typeof resource.mimeType === "string" && typeof resource.blob === "string";
}

function fileNameFromUri(uri: string): string {
  try {
    const path = new URL(uri).pathname;
    const segment = path.slice(path.lastIndexOf("/") + 1);
    return decodeURIComponent(segment) || "download";
  } catch {
    return "download";
  }
}

export interface DownloadLogSummary {
  name: string;
  mimeType: string;
  approximateBytes: number;
}

/** Reduce a host download request to metadata; never retain or return its blob. */
export function summarizeDownloadContents(
  contents: readonly unknown[],
): DownloadLogSummary[] {
  return contents.flatMap((raw) => {
    const block = record(raw);
    const resource = record(block?.resource);
    if (
      block?.type !== "resource" || typeof resource?.uri !== "string" ||
      typeof resource.blob !== "string"
    ) return [];
    return [{
      name: fileNameFromUri(resource.uri),
      mimeType: typeof resource.mimeType === "string"
        ? resource.mimeType
        : "application/octet-stream",
      approximateBytes: approximateBase64Bytes(resource.blob),
    }];
  });
}

/** Preserve context metadata in the journal without retaining binary payloads. */
export function summarizeModelContextContents(contents: unknown): unknown {
  if (!Array.isArray(contents)) return contents;
  return contents.map((content) => {
    const item = record(content);
    const resource = item ? record(item.resource) : null;
    if (!resource || typeof resource.blob !== "string") return content;
    const blob = resource.blob;
    const { blob: _blob, ...metadata } = resource;
    return {
      ...item,
      resource: {
        ...metadata,
        approximateBytes: approximateBase64Bytes(blob),
      },
    };
  });
}

/** Keep uploaded bytes out of the visible journal as well. */
export function toolArgumentsForLog(
  args: Record<string, unknown>,
): Record<string, unknown> {
  if (typeof args.content_base64 !== "string") return args;
  return {
    ...args,
    content_base64: `[base64 omitted; approximately ${
      approximateBase64Bytes(args.content_base64)
    } bytes]`,
  };
}
/**
 * Une liste telle que le serveur la renvoie : avec le `_rowAction` qu'il
 * injecte sur toute liste (une ligne s'ouvre dans l'inspecteur du niveau).
 */
const list = (doctype: string, data: Row[]) => ({
  doctype,
  count: data.length,
  data,
  _rowAction: {
    toolName: "erpnext_doc_get",
    idField: "name",
    argName: "name",
    extraArgs: { doctype },
  },
});

const PAYMENTS: Row[] = [
  {
    name: "ACC-PAY-2026-00118",
    posting_date: "2026-08-04",
    paid_amount: 1200,
    mode_of_payment: "Virement",
    docstatus: 1,
  },
  {
    name: "ACC-PAY-2026-00131",
    posting_date: "2026-08-12",
    paid_amount: 600,
    mode_of_payment: "Carte",
    docstatus: 1,
  },
  {
    name: "ACC-PAY-2026-00140",
    posting_date: "2026-08-19",
    paid_amount: 360,
    mode_of_payment: "Virement",
    docstatus: 0,
  },
];
const SALES_INVOICES: Row[] = [
  {
    name: "ACC-SINV-2026-00042",
    posting_date: "2026-08-01",
    status: "Unpaid",
    grand_total: 2160,
  },
  {
    name: "ACC-SINV-2026-00037",
    posting_date: "2026-07-18",
    status: "Paid",
    grand_total: 4870.5,
  },
  {
    name: "ACC-SINV-2026-00029",
    posting_date: "2026-06-30",
    status: "Paid",
    grand_total: 1325,
  },
  {
    name: "ACC-SINV-2026-00011",
    posting_date: "2026-05-02",
    status: "Cancelled",
    grand_total: 980,
  },
];
const STOCK_ENTRIES: Row[] = [
  {
    name: "MAT-STE-2026-00210",
    stock_entry_type: "Material Receipt",
    posting_date: "2026-08-15",
    docstatus: 1,
  },
  {
    name: "MAT-STE-2026-00198",
    stock_entry_type: "Material Transfer",
    posting_date: "2026-08-09",
    docstatus: 1,
  },
  {
    name: "MAT-STE-2026-00171",
    stock_entry_type: "Material Issue",
    posting_date: "2026-07-28",
    docstatus: 1,
  },
];
const TIMESHEETS: Row[] = [
  {
    name: "TS-2026-00077",
    employee: "HR-EMP-00004",
    start_date: "2026-08-18",
    total_hours: 6.5,
    status: "Submitted",
  },
  {
    name: "TS-2026-00081",
    employee: "HR-EMP-00009",
    start_date: "2026-08-20",
    total_hours: 3,
    status: "Draft",
  },
];
const STOCK_BALANCE: Row[] = [
  {
    item_code: "ITEM-LAPTOP",
    warehouse: "Stores - CS",
    actual_qty: 14,
    reserved_qty: 2,
    projected_qty: 12,
  },
  {
    item_code: "ITEM-LAPTOP",
    warehouse: "Finished Goods - CS",
    actual_qty: 5,
    reserved_qty: 0,
    projected_qty: 5,
  },
];

/** Le résultat initial que l'hôte pousse à l'ouverture de chaque vue. */
const PAYMENT_ENTRY_FIELDS = [
  "name",
  "posting_date",
  "paid_amount",
  "mode_of_payment",
  "docstatus",
];

/** Copie de INVOICE_HINTS["Sales Invoice"] (src/tools/ui-refresh.ts). */
const INVOICE_HINTS = [
  {
    key: "payments",
    label: "Payments",
    message: "Show payment entries for invoice {id}",
    tool: "erpnext_doc_list",
    args: {
      doctype: "Payment Entry",
      fields: PAYMENT_ENTRY_FIELDS,
      filters: [["Payment Entry Reference", "reference_name", "=", "{id}"]],
      limit: 20,
    },
    kind: "list",
  },
  {
    key: "customer",
    label: "Customer",
    message: "Show customer {party}",
    tool: "erpnext_customer_get",
    args: { name: "{party}" },
    kind: "record",
  },
  {
    key: "item",
    label: "Item",
    message: "Show item {item}",
    tool: "erpnext_item_get",
    args: { name: "{item}" },
    kind: "record",
  },
  {
    key: "stock",
    label: "Stock",
    message: "Show stock balance for item {item}",
    tool: "erpnext_stock_balance",
    args: { item_code: "{item}", limit: 50 },
    kind: "list",
  },
];

/** Copie de STOCK_HINTS. */
const STOCK_HINTS = [
  {
    key: "item",
    label: "Item",
    message: "Show item {id}",
    tool: "erpnext_item_get",
    args: { name: "{id}" },
    kind: "record",
  },
  {
    key: "movements",
    label: "Stock entries",
    message: "Show stock entries for item {id}",
    tool: "erpnext_doc_list",
    args: {
      doctype: "Stock Entry",
      fields: ["name", "posting_date", "stock_entry_type", "docstatus"],
      filters: [["Stock Entry Detail", "item_code", "=", "{id}"]],
      limit: 20,
    },
    kind: "list",
  },
  {
    key: "warehouse",
    label: "Warehouse stock",
    message: "Show stock chart for warehouse {warehouse}",
    tool: "erpnext_stock_chart",
    args: { warehouse: "{warehouse}", limit: 10 },
    kind: "chart",
  },
];

/** Copie de DOCTYPE_SEND_MESSAGE_HINTS["Task"]. */
const TASK_HINTS = [{
  key: "timesheets",
  label: "Timesheets",
  message: "Show timesheets for task {id}",
  tool: "erpnext_doc_list",
  args: {
    doctype: "Timesheet",
    fields: ["name", "employee", "start_date", "total_hours", "status"],
    filters: [["Timesheet Detail", "task", "=", "{id}"]],
    limit: 20,
  },
  kind: "list",
}];

/** Copie de FUNNEL_STAGE_JUMPS. */
const STAGE_JUMPS = {
  Leads: {
    key: "leads",
    label: "Leads",
    tool: "erpnext_lead_list",
    args: { limit: 20 },
    kind: "list",
  },
  Opportunities: {
    key: "opportunities",
    label: "Opportunities",
    tool: "erpnext_opportunity_list",
    args: { limit: 20 },
    kind: "list",
  },
  Quotations: {
    key: "quotations",
    label: "Quotations",
    tool: "erpnext_quotation_list",
    args: { limit: 20 },
    kind: "list",
  },
  Orders: {
    key: "sales_orders",
    label: "Sales orders",
    tool: "erpnext_sales_order_list",
    args: { limit: 20 },
    kind: "list",
  },
};

/** Copie de KPI_JUMPS["erpnext_kpi_revenue"] pour août 2026. */
const KPI_JUMPS = {
  number: {
    key: "sales_orders_month",
    label: "Sales orders this month",
    tool: "erpnext_doc_list",
    args: {
      doctype: "Sales Order",
      fields: ["name", "customer", "transaction_date", "status", "grand_total"],
      filters: [
        ["transaction_date", ">=", "2026-08-01"],
        ["transaction_date", "<=", "2026-08-31"],
        ["docstatus", "<", 2],
      ],
      limit: 20,
    },
    kind: "list",
  },
  trend: {
    key: "revenue_trend",
    label: "Revenue trend",
    tool: "erpnext_revenue_trend",
    args: { months: 12 },
    kind: "chart",
  },
};

const LEADS: Row[] = [
  {
    name: "CRM-LEAD-2026-00031",
    lead_name: "Marie Dupont",
    company_name: "Acme Corp",
    status: "Open",
    source: "Website",
  },
  {
    name: "CRM-LEAD-2026-00034",
    lead_name: "Jonas Weber",
    company_name: "Globex",
    status: "Replied",
    source: "Campaign",
  },
  {
    name: "CRM-LEAD-2026-00038",
    lead_name: "Aïcha Benali",
    company_name: "Initech",
    status: "Opportunity",
    source: "Referral",
  },
];
const OPPORTUNITIES: Row[] = [
  {
    name: "CRM-OPP-2026-00012",
    party_name: "Acme Corp",
    status: "Open",
    opportunity_amount: 12_500,
    expected_closing: "2026-09-15",
  },
  {
    name: "CRM-OPP-2026-00015",
    party_name: "Initech",
    status: "Quotation",
    opportunity_amount: 7_200,
    expected_closing: "2026-09-30",
  },
];
const SALES_ORDERS: Row[] = [
  {
    name: "SAL-ORD-2026-00077",
    customer: "Acme Corp",
    transaction_date: "2026-08-05",
    status: "To Deliver and Bill",
    grand_total: 9_800,
  },
  {
    name: "SAL-ORD-2026-00081",
    customer: "Globex",
    transaction_date: "2026-08-12",
    status: "Completed",
    grand_total: 4_350,
  },
  {
    name: "SAL-ORD-2026-00084",
    customer: "Umbrella",
    transaction_date: "2026-08-19",
    status: "To Bill",
    grand_total: 7_503,
  },
];
const CUSTOMER: Row = {
  name: "Acme Corp",
  customer_name: "Acme Corp",
  customer_group: "Commercial",
  territory: "France",
  customer_type: "Company",
  default_currency: "EUR",
  email_id: "compta@acme.example",
  disabled: 0,
};
/** Libellés de mois comme le serveur les écrit (« Sep 25 » … « Aug 26 »). */
const MONTH_LABELS = [
  "Sep 25",
  "Oct 25",
  "Nov 25",
  "Dec 25",
  "Jan 26",
  "Feb 26",
  "Mar 26",
  "Apr 26",
  "May 26",
  "Jun 26",
  "Jul 26",
  "Aug 26",
];
const MONTH_RANGES: Record<string, [string, string]> = {
  "Sep 25": ["2025-09-01", "2025-09-30"],
  "Oct 25": ["2025-10-01", "2025-10-31"],
  "Nov 25": ["2025-11-01", "2025-11-30"],
  "Dec 25": ["2025-12-01", "2025-12-31"],
  "Jan 26": ["2026-01-01", "2026-01-31"],
  "Feb 26": ["2026-02-01", "2026-02-28"],
  "Mar 26": ["2026-03-01", "2026-03-31"],
  "Apr 26": ["2026-04-01", "2026-04-30"],
  "May 26": ["2026-05-01", "2026-05-31"],
  "Jun 26": ["2026-06-01", "2026-06-30"],
  "Jul 26": ["2026-07-01", "2026-07-31"],
  "Aug 26": ["2026-08-01", "2026-08-31"],
};
/** Copie de chartPointJumps("erpnext_revenue_trend") : un mois → ses commandes. */
const MONTH_POINT_JUMPS = Object.fromEntries(
  MONTH_LABELS.map((label) => [label, {
    label,
    tool: "erpnext_doc_list",
    args: {
      doctype: "Sales Order",
      fields: ["name", "customer", "transaction_date", "status", "grand_total"],
      filters: [
        ["transaction_date", ">=", MONTH_RANGES[label][0]],
        ["transaction_date", "<=", MONTH_RANGES[label][1]],
        ["docstatus", "<", 2],
      ],
      limit: 20,
    },
    kind: "list",
  }]),
);
const REVENUE_VALUES = [
  12_400,
  13_100,
  12_800,
  14_200,
  15_600,
  18_400,
  19_100,
  21_653,
  17_900,
  20_300,
  22_100,
  21_653,
];
const EXPENSE_VALUES = [
  8_900,
  9_700,
  9_100,
  10_300,
  11_200,
  12_800,
  13_600,
  14_900,
  12_400,
  13_800,
  14_500,
  15_200,
];
const chart = (
  title: string,
  labels: string[],
  values: number[],
  label = "Revenue",
) => ({ title, labels, datasets: [{ label, values }] });
/** Un graphique canned dont chaque libellé ouvre une liste (comme le serveur l'enrichit). */
const withPointJumps = (
  c: ReturnType<typeof chart>,
  make: (label: string) => { tool: string; args: Record<string, unknown> },
) => ({
  ...c,
  _pointJumps: Object.fromEntries(
    c.labels.map((label) => [label, { label, kind: "list", ...make(label) }]),
  ),
});
const CUSTOMERS = ["Acme Corp", "Globex", "Initech", "Umbrella"];
const byCustomer = (doctype: string, extra: unknown[]) => (label: string) => ({
  tool: "erpnext_doc_list",
  args: {
    doctype,
    fields: ["name", "customer", "transaction_date", "status", "grand_total"],
    filters: [["customer_name", "=", label], ...extra],
    limit: 20,
  },
});
/** Le résultat initial du chart-viewer : la tendance du CA, cliquable par mois. */
const CHART_FIXTURE = {
  type: "bar",
  title: "Revenue trend",
  subtitle: "12 months",
  labels: MONTH_LABELS,
  datasets: [{ label: "Revenue", values: REVENUE_VALUES }],
  _drillDown: "Show sales orders for month {label}",
  _pointJumps: MONTH_POINT_JUMPS,
};

export function initialResult(viewer: ViewerKey): unknown {
  switch (viewer) {
    case "invoice":
      return { ...INVOICE_FIXTURE, _sendMessageHints: INVOICE_HINTS };
    case "doclist":
      return {
        ...DOCLIST_FIXTURE,
        // Le hint tel que le serveur l'attache désormais : outil + arguments.
        _sendMessageHints: [{
          key: "payments",
          label: "Payments",
          message: "Show payment entries for invoice {id}",
          tool: "erpnext_doc_list",
          args: {
            doctype: "Payment Entry",
            fields: [
              "name",
              "posting_date",
              "paid_amount",
              "mode_of_payment",
              "docstatus",
            ],
            filters: [[
              "Payment Entry Reference",
              "reference_name",
              "=",
              "{id}",
            ]],
            limit: 20,
          },
        }],
      };
    case "doc":
      return DEV_DOCUMENT_FIXTURE;
    case "kanban":
      return {
        ...KANBAN_FIXTURE,
        doctype: "Task",
        _sendMessageHints: TASK_HINTS,
      };
    case "stock":
      return { ...STOCK_FIXTURE, _sendMessageHints: STOCK_HINTS };
    case "funnel":
      return { ...FUNNEL_FIXTURE, _stageJumps: STAGE_JUMPS };
    case "kpi":
      return { ...KPI_FIXTURE, _jumps: KPI_JUMPS };
    case "chart":
      return CHART_FIXTURE;
  }
}

/** L'outil dont le résultat initial « vient », pour répondre aux rafraîchissements. */
export const INITIAL_TOOL: Record<ViewerKey, string> = {
  invoice: "erpnext_sales_invoice_get",
  doclist: "erpnext_sales_invoice_list",
  doc: "erpnext_doc_get",
  kanban: "erpnext_kanban_get_board",
  stock: "erpnext_stock_balance",
  funnel: "erpnext_sales_funnel",
  kpi: "erpnext_kpi_revenue",
  chart: "erpnext_revenue_trend",
};

/** La réponse canned d'un `tools/call`, ou null si l'outil n'est pas simulé. */
export function cannedResult(
  viewer: ViewerKey,
  name: string,
  args: Record<string, unknown>,
): unknown | null {
  if (name === INITIAL_TOOL[viewer]) return initialResult(viewer);
  switch (name) {
    case "erpnext_file_list": {
      if (!attachmentTarget(viewer, args)) return null;
      const limit = typeof args.limit === "number" &&
          Number.isInteger(args.limit) && args.limit > 0
        ? args.limit
        : 50;
      const data = documentFiles.slice(0, limit).map(fileListRow);
      return { count: data.length, data };
    }
    case "erpnext_file_upload": {
      const target = attachmentTarget(viewer, args);
      if (!target) return null;
      const fileName = typeof args.file_name === "string"
        ? args.file_name.trim()
        : "";
      const blob = typeof args.content_base64 === "string"
        ? args.content_base64.trim()
        : "";
      if (!fileName || /[\\/\0]/.test(fileName) || !blob) return null;
      if (
        args.is_private !== undefined && typeof args.is_private !== "boolean"
      ) {
        return null;
      }
      if (
        args.attached_to_field !== undefined &&
        (typeof args.attached_to_field !== "string" ||
          !args.attached_to_field.trim())
      ) return null;

      uploadSequence += 1;
      const isPrivate = args.is_private !== false;
      const sequence = String(uploadSequence).padStart(3, "0");
      const timestamp = `2026-08-24 17:00:${
        String(uploadSequence).padStart(2, "0")
      }`;
      const file: CannedAttachment = {
        name: `FILE-UPLOAD-${sequence}`,
        file_name: fileName,
        file_url: `${isPrivate ? "/private" : ""}/files/${fileName}`,
        file_size: approximateBase64Bytes(blob),
        is_private: isPrivate,
        attached_to_field: typeof args.attached_to_field === "string"
          ? args.attached_to_field.trim()
          : null,
        creation: timestamp,
        modified: timestamp,
        owner: "dev-host@casys.ai",
        mimeType: mimeTypeForFileName(fileName),
        blob,
      };
      documentFiles.unshift(file);
      return {
        data: {
          ...fileListRow(file),
          is_private: file.is_private ? 1 : 0,
          attached_to_doctype: target.doctype,
          attached_to_name: target.name,
        },
        message: `${fileName} attached to ${target.doctype} ${target.name}`,
      };
    }
    case "erpnext_file_download": {
      if (!attachmentTarget(viewer, args)) return null;
      const file = documentFiles.find((candidate) =>
        candidate.name === args.file_id
      );
      if (!file) return null;
      return {
        content: [
          {
            type: "text",
            text:
              `Prepared ${file.file_name} for download (${file.file_size} bytes).`,
          },
          {
            type: "resource",
            resource: {
              uri: `file:///${encodeURIComponent(file.file_name)}`,
              mimeType: file.mimeType,
              blob: file.blob,
            },
          },
        ],
      } satisfies CannedDownloadToolResult;
    }
    case "erpnext_doc_list": {
      const doctype = String(args.doctype ?? "");
      if (doctype === "Payment Entry") return list(doctype, PAYMENTS);
      if (doctype === "Sales Order") return list(doctype, SALES_ORDERS);
      if (doctype === "Stock Entry") return list(doctype, STOCK_ENTRIES);
      if (doctype === "Timesheet") return list(doctype, TIMESHEETS);
      if (doctype === "Quotation") {
        return list(doctype, [{
          name: "SAL-QTN-2026-00015",
          party_name: "Acme Corp",
          transaction_date: "2026-08-10",
          status: "Open",
          grand_total: 7200,
        }]);
      }
      if (doctype === "Task") {
        return list(doctype, [{
          name: "TASK-2026-00088",
          subject: "Rappeler le client",
          status: "Open",
          priority: "High",
        }]);
      }
      return list(doctype, [{ name: `${doctype}-001`, status: "Open" }, {
        name: `${doctype}-002`,
        status: "Closed",
      }]);
    }
    case "erpnext_sales_invoice_list":
    case "erpnext_purchase_invoice_list":
      return list(
        name.includes("sales") ? "Sales Invoice" : "Purchase Invoice",
        SALES_INVOICES,
      );
    case "erpnext_stock_entry_list":
      return list("Stock Entry", STOCK_ENTRIES);
    case "erpnext_stock_balance":
      return { count: STOCK_BALANCE.length, data: STOCK_BALANCE };
    case "erpnext_item_get": {
      // La fixture de la facture est imbriquée ({ item, stock }) ; un vrai
      // `_get` renvoie le document plat.
      const fixture = ITEM_FIXTURES[String(args.name)] as
        | { item?: Record<string, unknown> }
        | undefined;
      return {
        data: fixture?.item ?? fixture ??
          {
            item_code: args.name,
            item_name: "Article inconnu",
            item_group: "—",
            stock_uom: "Nos",
            standard_rate: 0,
            is_stock_item: true,
          },
      };
    }
    case "erpnext_sales_invoice_get": {
      // Le détail d'une facture de la liste doclist (24 lignes) ou des
      // petites listes : la ligne, plus ce qu'un vrai `_get` ajoute.
      const rows = [...(DOCLIST_FIXTURE.data ?? []), ...SALES_INVOICES];
      const row = rows.find((r) => r.name === args.name);
      if (!row) return null;
      const { _detail, ...fields } = row as Row & { _detail?: Row };
      return {
        data: {
          doctype: "Sales Invoice",
          ...fields,
          ...(_detail ?? {}),
          currency: "EUR",
          items: [{ item_code: "SKU-001", qty: 2, rate: 450 }, {
            item_code: "SKU-002",
            qty: 1,
            rate: 300,
          }],
        },
      };
    }
    case "erpnext_lead_list":
      return list("Lead", LEADS);
    case "erpnext_opportunity_list":
      return list("Opportunity", OPPORTUNITIES);
    case "erpnext_quotation_list":
      return list("Quotation", [{
        name: "SAL-QTN-2026-00015",
        party_name: "Acme Corp",
        transaction_date: "2026-08-10",
        status: "Open",
        grand_total: 7200,
      }]);
    case "erpnext_sales_order_list":
      return list("Sales Order", SALES_ORDERS);
    case "erpnext_customer_get":
      return { data: { ...CUSTOMER, name: args.name ?? CUSTOMER.name } };
    case "erpnext_revenue_trend":
      return {
        ...chart("Revenue trend", MONTH_LABELS, REVENUE_VALUES),
        _pointJumps: MONTH_POINT_JUMPS,
      };
    case "erpnext_ar_aging":
      // Le vrai handler étiquette des clients, empilés par seau d'ancienneté.
      // Aucun saut typé : le handler réel peut classer sur posting_date quand
      // due_date manque, condition impossible à reproduire exactement dans
      // une simple liste filtrée. La sélection de contexte reste disponible.
      return {
        title: "Receivables aging",
        type: "stacked-bar",
        labels: CUSTOMERS,
        datasets: [
          { label: "0-30 days", values: [9_400, 5_100, 1_600, 700] },
          { label: "31-60 days", values: [4_800, 2_300, 900, 350] },
          { label: "61-90 days", values: [2_700, 1_200, 400, 150] },
          { label: "90+ days", values: [1_300, 800, 200, 50] },
        ],
        currency: "EUR",
        _drillDown: "Show outstanding sales invoices for customer {label}",
      };
    case "erpnext_order_breakdown":
      return withPointJumps(
        chart("Order breakdown", CUSTOMERS, [4, 9, 3, 12], "Orders"),
        byCustomer("Sales Order", [["docstatus", "<", 2]]),
      );
    case "erpnext_profit_loss":
      return {
        title: "Profit and loss",
        type: "composed",
        labels: MONTH_LABELS,
        datasets: [
          { label: "Income", values: REVENUE_VALUES, type: "bar" },
          {
            label: "Expenses",
            values: EXPENSE_VALUES,
            type: "bar",
          },
          {
            label: "Net Profit",
            values: REVENUE_VALUES.map((value, index) =>
              value - EXPENSE_VALUES[index]
            ),
            type: "line",
          },
        ],
        currency: "EUR",
        _drillDown:
          "Show submitted sales and purchase orders for month {label}",
        _seriesPointJumps: Object.fromEntries(
          MONTH_LABELS.map((label) => [label, {
            Income: {
              label: `${label} · Income`,
              tool: "erpnext_doc_list",
              args: {
                doctype: "Sales Order",
                fields: [
                  "name",
                  "customer",
                  "transaction_date",
                  "status",
                  "grand_total",
                ],
                filters: [
                  ["transaction_date", ">=", MONTH_RANGES[label][0]],
                  ["transaction_date", "<=", MONTH_RANGES[label][1]],
                  ["docstatus", "=", 1],
                ],
                limit: 20,
              },
              kind: "list",
            },
            Expenses: {
              label: `${label} · Expenses`,
              tool: "erpnext_doc_list",
              args: {
                doctype: "Purchase Order",
                fields: [
                  "name",
                  "supplier",
                  "transaction_date",
                  "status",
                  "grand_total",
                ],
                filters: [
                  ["transaction_date", ">=", MONTH_RANGES[label][0]],
                  ["transaction_date", "<=", MONTH_RANGES[label][1]],
                  ["docstatus", "=", 1],
                ],
                limit: 20,
              },
              kind: "list",
            },
          }]),
        ),
      };
    case "erpnext_gross_profit":
      return withPointJumps(
        chart("Gross profit by item", ["Laptop Pro 14", "Wireless Mouse"], [
          6_200,
          4_100,
        ], "Gross profit"),
        (label) => ({
          tool: "erpnext_doc_list",
          args: {
            doctype: "Sales Invoice",
            fields: [
              "name",
              "customer",
              "posting_date",
              "due_date",
              "status",
              "outstanding_amount",
            ],
            filters: [["Sales Invoice Item", "item_name", "=", label], [
              "docstatus",
              "=",
              1,
            ]],
            limit: 20,
          },
        }),
      );
    case "erpnext_stock_chart":
      return withPointJumps(
        chart(
          `Stock · ${args.warehouse ?? "all"}`,
          ["SKU-001", "SKU-002", "SKU-003", "SKU-004", "SKU-005"],
          [120, 85, 64, 30, 12],
          "Qty on Hand",
        ),
        (label) => ({
          tool: "erpnext_stock_balance",
          args: {
            item_code: label,
            ...(args.warehouse ? { warehouse: args.warehouse } : {}),
            limit: 50,
          },
        }),
      );
    case "erpnext_doc_submit":
    case "erpnext_doc_cancel":
      // Banc d'essai : l'écriture « réussit » sans rien changer, pour voir les
      // niveaux se marquer périmés et la ligne se barrer.
      return {
        name: args.name,
        doctype: args.doctype,
        docstatus: name.endsWith("cancel") ? 2 : 1,
        simulated: true,
      };
    case "erpnext_doc_get": {
      const detail = KANBAN_FIXTURE_DETAILS[String(args.name)];
      if (detail) return { data: detail };
      // Une ligne d'une liste simulée : la ligne, plus le doctype.
      const row = [
        ...PAYMENTS,
        ...STOCK_ENTRIES,
        ...TIMESHEETS,
        ...LEADS,
        ...OPPORTUNITIES,
        ...SALES_ORDERS,
      ].find((r) => r.name === args.name);
      return {
        data: { doctype: args.doctype, ...(row ?? { name: args.name }) },
      };
    }
    case "erpnext_user_list":
      return { count: KANBAN_FIXTURE_USERS.length, data: KANBAN_FIXTURE_USERS };
  }
  // Lectures de détail kanban : erpnext_task_get, erpnext_issue_get…
  if (/^erpnext_[a-z_]+_get$/.test(name) && typeof args.name === "string") {
    const detail = KANBAN_FIXTURE_DETAILS[args.name];
    if (detail) return { data: detail };
  }
  return null;
}
