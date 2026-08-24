interface UiMetadata {
  ui?: {
    resourceUri?: string;
  };
}

interface UiRefreshRequest {
  toolName: string;
  arguments: Record<string, unknown>;
}

interface RowAction {
  toolName: string;
  idField: string;
  argName: string;
  extraArgs?: Record<string, unknown>;
}

/**
 * Un saut de navigation attaché à un résultat de liste.
 *
 * La vue affiche `label` (ou le libellé traduit `doclist.hint.<key>`). Quand
 * l'hôte relaie les outils, elle appelle `tool` avec `args` (`{id}` et
 * `{doctype}` remplis avec le document sélectionné) et empile le résultat
 * comme niveau `kind` (liste par défaut) ; sinon elle envoie `message` à la
 * conversation. Le test de contrat vérifie chaque outil et ses arguments.
 */
interface SendMessageHint {
  key: string;
  label: string;
  message: string;
  tool?: string;
  args?: Record<string, unknown>;
  kind?: LevelKind;
}

/** La forme du niveau qu'ouvre un saut : une liste, une fiche, des barres. */
export type LevelKind = "list" | "record" | "chart";

/** Un saut sans phrase : l'outil, ses arguments, la forme du niveau. */
export interface NavJump {
  /** Clé de libellé côté vue (`doclist.hint.<key>`), `label` en repli. */
  key?: string;
  label: string;
  tool: string;
  args: Record<string, unknown>;
  kind: LevelKind;
}

interface UiRefreshableResult {
  _meta?: UiMetadata;
  refreshRequest?: UiRefreshRequest;
  _rowAction?: RowAction;
  _sendMessageHints?: SendMessageHint[];
  _drillDown?: string;
  _trendDrillDown?: string;
  /** KPI : le nombre ouvre une liste, la courbe un graphique. */
  _jumps?: { number?: NavJump; trend?: NavJump };
  /** Funnel : chaque étape ouvre la liste de ses documents. */
  _stageJumps?: Record<string, NavJump>;
  /** Graphique : chaque libellé (point, barre, part) ouvre la liste de ses pièces. */
  _pointJumps?: Record<string, NavJump>;
  /** Graphique multi-séries : le segment exact prime sur le saut du libellé. */
  _seriesPointJumps?: Record<string, Record<string, NavJump>>;
  /** Outils précis que ce viewer peut appeler dans ce déploiement. */
  _availableTools?: string[];
  labels?: unknown;
  moveToolName?: unknown;
  doctype?: string;
  data?: unknown;
  [key: string]: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasUiResource(result: Record<string, unknown>): boolean {
  const meta = result._meta;
  if (!isRecord(meta)) return false;
  const ui = meta.ui;
  if (!isRecord(ui)) return false;
  return typeof ui.resourceUri === "string" && ui.resourceUri.length > 0;
}

/**
 * Mapping from DocType to the "get" tool that fetches a single document.
 * Used to auto-inject _rowAction into doclist results so the viewer
 * can fetch detail on row click via callServerTool.
 */
const DOCTYPE_GET_TOOLS: Record<string, string> = {
  "Customer": "erpnext_customer_get",
  "Sales Order": "erpnext_sales_order_get",
  "Sales Invoice": "erpnext_sales_invoice_get",
  "Quotation": "erpnext_quotation_get",
  "Item": "erpnext_item_get",
  "Supplier": "erpnext_supplier_get",
  "Purchase Order": "erpnext_purchase_order_get",
  "Purchase Invoice": "erpnext_purchase_invoice_get",
  "Purchase Receipt": "erpnext_purchase_receipt_get",
  "Journal Entry": "erpnext_journal_entry_get",
  "Payment Entry": "erpnext_payment_entry_get",
  "Employee": "erpnext_employee_get",
  "Leave Application": "erpnext_leave_application_get",
  "Salary Slip": "erpnext_salary_slip_get",
  "Project": "erpnext_project_get",
  "Task": "erpnext_task_get",
  "Timesheet": "erpnext_timesheet_get",
  "Delivery Note": "erpnext_delivery_note_get",
  "Shipment": "erpnext_shipment_get",
  "BOM": "erpnext_bom_get",
  "Work Order": "erpnext_work_order_get",
  "Job Card": "erpnext_job_card_get",
  "Lead": "erpnext_lead_get",
  "Opportunity": "erpnext_opportunity_get",
  "Contact": "erpnext_contact_get",
  "Asset": "erpnext_asset_get",
  "Asset Movement": "erpnext_asset_movement_get",
  "Asset Maintenance": "erpnext_asset_maintenance_get",
  "Stock Entry": "erpnext_stock_entry_get",
};

/**
 * Cross-viewer navigation hints by DocType.
 * Shown as buttons in the InlineDetailPanel via sendMessage.
 */
export const DOCTYPE_SEND_MESSAGE_HINTS: Record<string, SendMessageHint[]> = {
  "Customer": [
    {
      key: "orders",
      label: "Orders",
      message: "Show sales orders for customer {id}",
      tool: "erpnext_sales_order_list",
      args: { customer: "{id}", limit: 20 },
    },
    {
      key: "invoices",
      label: "Invoices",
      message: "Show sales invoices for customer {id}",
      tool: "erpnext_sales_invoice_list",
      args: { customer: "{id}", limit: 20 },
    },
  ],
  "Sales Order": [
    {
      key: "invoice",
      label: "Invoice",
      message: "Show invoices linked to sales order {id}",
      tool: "erpnext_doc_list",
      args: {
        doctype: "Sales Invoice",
        fields: ["name", "customer", "posting_date", "status", "grand_total"],
        filters: [["Sales Invoice Item", "sales_order", "=", "{id}"]],
        limit: 20,
      },
    },
    {
      key: "delivery",
      label: "Delivery",
      message: "Show delivery notes for sales order {id}",
      tool: "erpnext_doc_list",
      args: {
        doctype: "Delivery Note",
        fields: ["name", "customer", "posting_date", "status"],
        filters: [["Delivery Note Item", "against_sales_order", "=", "{id}"]],
        limit: 20,
      },
    },
  ],
  "Sales Invoice": [
    {
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
        filters: [["Payment Entry Reference", "reference_name", "=", "{id}"]],
        limit: 20,
      },
    },
  ],
  "Item": [
    {
      key: "stock",
      label: "Stock",
      message: "Show stock balance for item {id}",
      tool: "erpnext_stock_balance",
      args: { item_code: "{id}" },
    },
    {
      key: "orders",
      label: "Orders",
      message: "Show sales orders containing item {id}",
      tool: "erpnext_doc_list",
      args: {
        doctype: "Sales Order",
        fields: ["name", "customer", "transaction_date", "status"],
        filters: [["Sales Order Item", "item_code", "=", "{id}"]],
        limit: 20,
      },
    },
  ],
  "Supplier": [
    {
      key: "po",
      label: "PO",
      message: "Show purchase orders for supplier {id}",
      tool: "erpnext_purchase_order_list",
      args: { supplier: "{id}", limit: 20 },
    },
    {
      key: "invoices",
      label: "Invoices",
      message: "Show purchase invoices for supplier {id}",
      tool: "erpnext_purchase_invoice_list",
      args: { supplier: "{id}", limit: 20 },
    },
  ],
  "Purchase Order": [
    {
      key: "receipt",
      label: "Receipt",
      message: "Show purchase receipts for order {id}",
      tool: "erpnext_doc_list",
      args: {
        doctype: "Purchase Receipt",
        fields: ["name", "supplier", "posting_date", "status"],
        filters: [["Purchase Receipt Item", "purchase_order", "=", "{id}"]],
        limit: 20,
      },
    },
    {
      key: "invoice",
      label: "Invoice",
      message: "Show purchase invoices for order {id}",
      tool: "erpnext_doc_list",
      args: {
        doctype: "Purchase Invoice",
        fields: ["name", "supplier", "posting_date", "status", "grand_total"],
        filters: [["Purchase Invoice Item", "purchase_order", "=", "{id}"]],
        limit: 20,
      },
    },
  ],
  "Employee": [
    {
      key: "attendance",
      label: "Attendance",
      message: "Show attendance for employee {id}",
      tool: "erpnext_attendance_list",
      args: { employee: "{id}", limit: 20 },
    },
    {
      key: "leaves",
      label: "Leaves",
      message: "Show leave applications for employee {id}",
      tool: "erpnext_leave_application_list",
      args: { employee: "{id}", limit: 20 },
    },
  ],
  "Project": [
    {
      key: "tasks",
      label: "Tasks",
      message: "Show tasks for project {id}",
      tool: "erpnext_task_list",
      args: { project: "{id}", limit: 20 },
    },
    {
      key: "timesheets",
      label: "Timesheets",
      message: "Show timesheets for project {id}",
      tool: "erpnext_timesheet_list",
      args: { project: "{id}", limit: 20 },
    },
  ],
  "Task": [
    {
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
    },
  ],
  "Lead": [
    {
      key: "opportunities",
      label: "Opportunities",
      message: "Show opportunities for lead {id}",
      tool: "erpnext_opportunity_list",
      // Le handler exige opportunity_from avec party_name.
      args: { opportunity_from: "Lead", party_name: "{id}", limit: 20 },
    },
  ],
};

/**
 * KPI drill-down hints by tool name.
 * _drillDown: sendMessage when clicking the big number (exceptions list)
 * _trendDrillDown: sendMessage when clicking the sparkline (trend chart)
 */
const KPI_DRILL_DOWN: Record<
  string,
  { _drillDown?: string; _trendDrillDown?: string }
> = {
  "erpnext_kpi_revenue": {
    _drillDown: "Show all sales orders for this month",
    _trendDrillDown: "Show revenue trend chart for the last 12 months",
  },
  "erpnext_kpi_outstanding": {
    _drillDown: "Show all unpaid sales invoices with outstanding amounts",
    _trendDrillDown: "Show accounts receivable aging chart",
  },
  "erpnext_kpi_orders": {
    _drillDown: "Show all sales orders created this month",
    _trendDrillDown: "Show order breakdown chart for the last 6 months",
  },
  "erpnext_kpi_gross_margin": {
    _drillDown:
      "Show the non-cancelled Sales Order Items and Bin valuation rates used to estimate this gross margin",
    _trendDrillDown: "Show profit and loss chart for the last 12 months",
  },
  "erpnext_kpi_overdue": {
    _drillDown: "Show all overdue sales invoices",
    _trendDrillDown: "Show accounts receivable aging chart",
  },
};

/**
 * Chart drill-down templates by tool name.
 * {label} is replaced with the clicked data point's label (e.g. customer name, item code, month).
 */
const CHART_DRILL_DOWN: Record<string, string> = {
  "erpnext_sales_chart": "Show sales invoices for {label}",
  "erpnext_stock_chart": "Show stock balance for item {label}",
  "erpnext_revenue_trend": "Show sales orders for month {label}",
  "erpnext_order_breakdown": "Show sales orders for {label}",
  "erpnext_ar_aging": "Show outstanding sales invoices for customer {label}",
  "erpnext_gross_profit": "Show gross profit details for {label}",
  "erpnext_profit_loss":
    "Show submitted sales and purchase orders for month {label}",
};

/**
 * Les sauts d'une pièce ouverte dans la vue facture : ses paiements (liste),
 * son tiers (fiche). `{id}` est la pièce, `{party}` le client ou fournisseur.
 */
/** Les sauts d'une ligne d'article de la facture : sa fiche, son stock. `{item}` est l'article. */
export const INVOICE_ITEM_HINTS: SendMessageHint[] = [
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

export const INVOICE_HINTS: Record<string, SendMessageHint[]> = {
  "Sales Invoice": [
    {
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
    ...INVOICE_ITEM_HINTS,
  ],
  "Purchase Invoice": [
    {
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
        filters: [["Payment Entry Reference", "reference_name", "=", "{id}"]],
        limit: 20,
      },
      kind: "list",
    },
    {
      key: "supplier",
      label: "Supplier",
      message: "Show supplier {party}",
      tool: "erpnext_supplier_get",
      args: { name: "{party}" },
      kind: "record",
    },
    ...INVOICE_ITEM_HINTS,
  ],
};

/**
 * Les sauts d'une ligne de stock (Bin) : l'article (fiche), ses mouvements
 * (liste), l'entrepôt (graphique). `{id}` est l'article, `{warehouse}` l'entrepôt.
 */
export const STOCK_HINTS: SendMessageHint[] = [
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

/**
 * Le mois civil de `now` en heure locale — la même horloge que les KPI, qui
 * rangent leurs pièces par `getMonth()` — plus le jour, pour « en retard ».
 */
export interface MonthRange {
  from: string;
  to: string;
  today: string;
}

export function monthRange(now: Date): MonthRange {
  const y = now.getFullYear();
  const m = now.getMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  const last = new Date(y, m + 1, 0).getDate();
  return {
    from: `${y}-${pad(m + 1)}-01`,
    to: `${y}-${pad(m + 1)}-${pad(last)}`,
    today: `${y}-${pad(m + 1)}-${pad(now.getDate())}`,
  };
}

const INVOICE_LIST_FIELDS = [
  "name",
  "customer",
  "posting_date",
  "due_date",
  "status",
  "outstanding_amount",
];

/**
 * Les sauts d'un KPI, par outil : le nombre ouvre les pièces qui le
 * composent (une liste, ou des barres pour la marge), la courbe ouvre le
 * graphique qui le prolonge. Les filtres sont ceux du calcul du KPI, pas
 * une approximation ; `range` est le mois courant au moment de la réponse.
 */
export const KPI_JUMPS: Record<
  string,
  (range: MonthRange) => { number?: NavJump; trend: NavJump }
> = {
  "erpnext_kpi_revenue": (r) => ({
    number: {
      key: "sales_orders_month",
      label: "Sales orders this month",
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
          ["transaction_date", ">=", r.from],
          ["transaction_date", "<=", r.to],
          // comme le KPI : les commandes annulées ne comptent pas
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
  }),
  "erpnext_kpi_outstanding": () => ({
    number: {
      key: "unpaid_invoices",
      label: "Unpaid invoices",
      tool: "erpnext_doc_list",
      args: {
        doctype: "Sales Invoice",
        fields: INVOICE_LIST_FIELDS,
        filters: [["outstanding_amount", ">", 0], ["docstatus", "=", 1]],
        limit: 20,
      },
      kind: "list",
    },
    trend: {
      key: "receivables_aging",
      label: "Receivables aging",
      tool: "erpnext_ar_aging",
      args: {},
      kind: "chart",
    },
  }),
  "erpnext_kpi_orders": (r) => ({
    number: {
      key: "sales_orders_month",
      label: "Sales orders this month",
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
          ["transaction_date", ">=", r.from],
          ["transaction_date", "<=", r.to],
          // comme le KPI : les commandes annulées ne comptent pas
          ["docstatus", "<", 2],
        ],
        limit: 20,
      },
      kind: "list",
    },
    trend: {
      key: "order_breakdown",
      label: "Order breakdown",
      tool: "erpnext_order_breakdown",
      args: {},
      kind: "chart",
    },
  }),
  "erpnext_kpi_gross_margin": () => ({
    trend: {
      key: "profit_loss",
      label: "Profit and loss",
      tool: "erpnext_profit_loss",
      args: { months: 12 },
      kind: "chart",
    },
  }),
  "erpnext_kpi_overdue": (r) => ({
    number: {
      key: "overdue_invoices",
      label: "Overdue invoices",
      tool: "erpnext_doc_list",
      args: {
        doctype: "Sales Invoice",
        fields: INVOICE_LIST_FIELDS,
        filters: [
          ["due_date", "<", r.today],
          ["outstanding_amount", ">", 0],
          ["docstatus", "=", 1],
        ],
        limit: 20,
      },
      kind: "list",
    },
    trend: {
      key: "receivables_aging",
      label: "Receivables aging",
      tool: "erpnext_ar_aging",
      args: {},
      kind: "chart",
    },
  }),
};

const FUNNEL_LIST_FIELDS: Record<string, string[]> = {
  "Leads": [
    "name",
    "lead_name",
    "company_name",
    "status",
    "lead_owner",
    "creation",
  ],
  "Opportunities": [
    "name",
    "opportunity_from",
    "party_name",
    "status",
    "opportunity_amount",
    "currency",
    "probability",
    "opportunity_owner",
    "transaction_date",
  ],
  "Quotations": [
    "name",
    "party_name",
    "transaction_date",
    "status",
    "grand_total",
  ],
  "Orders": [
    "name",
    "customer",
    "transaction_date",
    "status",
    "grand_total",
  ],
};

/** Les sauts du funnel, par libellé d'étape : la liste des documents de l'étape. */
export const FUNNEL_STAGE_JUMPS: Record<string, NavJump> = {
  "Leads": {
    key: "leads",
    label: "Leads",
    tool: "erpnext_lead_list",
    args: { limit: 20 },
    kind: "list",
  },
  "Opportunities": {
    key: "opportunities",
    label: "Opportunities",
    tool: "erpnext_opportunity_list",
    args: { limit: 20 },
    kind: "list",
  },
  "Quotations": {
    key: "quotations",
    label: "Quotations",
    tool: "erpnext_doc_list",
    args: {
      doctype: "Quotation",
      fields: FUNNEL_LIST_FIELDS.Quotations,
      filters: [["docstatus", "!=", 2]],
      limit: 20,
    },
    kind: "list",
  },
  "Orders": {
    key: "sales_orders",
    label: "Sales orders",
    tool: "erpnext_doc_list",
    args: {
      doctype: "Sales Order",
      fields: FUNNEL_LIST_FIELDS.Orders,
      filters: [["docstatus", "!=", 2]],
      limit: 20,
    },
    kind: "list",
  },
};

function funnelPeriodStart(
  period: unknown,
  now: Date,
): string | undefined {
  const year = now.getFullYear();
  const pad = (value: number) => String(value).padStart(2, "0");
  if (period === "this_month") {
    return `${year}-${pad(now.getMonth() + 1)}-01`;
  }
  if (period === "this_quarter") {
    const firstMonth = Math.floor(now.getMonth() / 3) * 3 + 1;
    return `${year}-${pad(firstMonth)}-01`;
  }
  if (period === "this_year") return `${year}-01-01`;
  return undefined;
}

/**
 * Les listes d'un funnel reprennent la borne basse utilisée par son calcul.
 * Lead est daté par `creation`, les trois autres étapes par `transaction_date`.
 */
export function funnelStageJumps(
  args: Record<string, unknown>,
  now: Date,
): Record<string, NavJump> {
  const since = funnelPeriodStart(args.period, now);
  if (!since) return FUNNEL_STAGE_JUMPS;

  const scopedJump = (
    stage: string,
    doctype: string,
    dateField: "creation" | "transaction_date",
  ): NavJump => {
    const base = FUNNEL_STAGE_JUMPS[stage];
    const baseFilters = Array.isArray(base.args.filters)
      ? base.args.filters
      : [];
    return {
      ...base,
      tool: "erpnext_doc_list",
      args: {
        doctype,
        fields: FUNNEL_LIST_FIELDS[stage],
        filters: [[dateField, ">=", since], ...baseFilters],
        limit: 20,
      },
    };
  };

  return {
    "Leads": scopedJump("Leads", "Lead", "creation"),
    "Opportunities": scopedJump(
      "Opportunities",
      "Opportunity",
      "transaction_date",
    ),
    "Quotations": scopedJump(
      "Quotations",
      "Quotation",
      "transaction_date",
    ),
    "Orders": scopedJump("Orders", "Sales Order", "transaction_date"),
  };
}

const SALES_ORDER_LIST_FIELDS = [
  "name",
  "customer",
  "transaction_date",
  "status",
  "grand_total",
];

const PURCHASE_ORDER_LIST_FIELDS = [
  "name",
  "supplier",
  "transaction_date",
  "status",
  "grand_total",
];

/** Le libellé de mois tel que les graphiques l'écrivent : « Aug 26 ». */
function monthLabel(d: Date): string {
  return `${d.toLocaleString("en", { month: "short" })} ${
    d.getFullYear().toString().slice(2)
  }`;
}

/** Les mois d'un graphique mensuel, dans l'ordre du handler, avec leurs bornes. */
function monthBuckets(
  monthsBack: number,
  now: Date,
): { label: string; range: MonthRange }[] {
  const buckets: { label: string; range: MonthRange }[] = [];
  for (let m = 0; m < monthsBack; m++) {
    const d = new Date(
      now.getFullYear(),
      now.getMonth() - monthsBack + 1 + m,
      1,
    );
    buckets.push({ label: monthLabel(d), range: monthRange(d) });
  }
  return buckets;
}

const docList = (
  label: string,
  doctype: string,
  fields: string[],
  filters: unknown[],
): NavJump => ({
  label,
  tool: "erpnext_doc_list",
  args: { doctype, fields, filters, limit: 20 },
  kind: "list",
});

/**
 * Les sauts d'un graphique, par libellé : le point, la barre ou la part
 * cliquée ouvre la liste des pièces qui la composent. Même logique que le
 * handler du graphique (mêmes bornes, mêmes états) ; les libellés qui ne
 * correspondent à aucune pièce (radar, nuage, treemap) n'en reçoivent pas.
 */
export function chartPointJumps(
  toolName: string,
  args: Record<string, unknown>,
  labels: string[],
  now: Date,
): Record<string, NavJump> | undefined {
  const jumps: Record<string, NavJump> = {};
  // « Unknown » est le libellé que les handlers posent quand le nom manque :
  // aucune pièce ne porte ce nom, donc pas de saut.
  const byLabel = (make: (label: string) => NavJump) => {
    for (const label of labels) {
      if (label === "Unknown") continue;
      jumps[label] = make(label);
    }
  };
  switch (toolName) {
    case "erpnext_revenue_trend": {
      const months = Number(args.months ?? 6);
      for (const { label, range } of monthBuckets(months, now)) {
        if (!labels.includes(label)) continue;
        jumps[label] = docList(label, "Sales Order", SALES_ORDER_LIST_FIELDS, [
          ["transaction_date", ">=", range.from],
          ["transaction_date", "<=", range.to],
          ["docstatus", "<", 2],
        ]);
      }
      break;
    }
    case "erpnext_sales_chart": {
      const groupBy = String(args.group_by ?? "customer");
      byLabel((label) => {
        const filters: unknown[] = [
          groupBy === "item"
            ? ["Sales Invoice Item", "item_name", "=", label]
            : groupBy === "status"
            ? ["status", "=", label]
            : ["customer_name", "=", label],
        ];
        if (groupBy === "status") {
          filters.push(["docstatus", "!=", 2]);
        } else if (groupBy === "item" || args.include_drafts !== true) {
          filters.push(["docstatus", "=", 1]);
        }
        return docList(label, "Sales Invoice", INVOICE_LIST_FIELDS, filters);
      });
      break;
    }
    case "erpnext_order_breakdown":
    case "erpnext_revenue_vs_orders":
      byLabel((label) =>
        docList(label, "Sales Order", SALES_ORDER_LIST_FIELDS, [
          ["customer_name", "=", label],
          ["docstatus", "<", 2],
        ])
      );
      break;
    case "erpnext_ar_aging":
    case "erpnext_profit_loss":
      // AR Aging classe sur due_date avec repli sur posting_date : une liste
      // Frappe ne peut pas exprimer exactement cette condition. P&L, lui,
      // exige la série cliquée ; ses sauts sont construits ci-dessous.
      return undefined;
    case "erpnext_gross_profit": {
      const groupBy = String(args.group_by ?? "item");
      byLabel((label) =>
        docList(label, "Sales Invoice", INVOICE_LIST_FIELDS, [
          groupBy === "customer"
            ? ["customer_name", "=", label]
            : ["Sales Invoice Item", "item_name", "=", label],
          ["docstatus", "=", 1],
        ])
      );
      break;
    }
    case "erpnext_stock_chart":
      byLabel((label) => ({
        label,
        tool: "erpnext_stock_balance",
        args: {
          item_code: label,
          ...(typeof args.warehouse === "string"
            ? { warehouse: args.warehouse }
            : {}),
          limit: 50,
        },
        kind: "list",
      }));
      break;
    default:
      return undefined;
  }
  return Object.keys(jumps).length > 0 ? jumps : undefined;
}

/**
 * Sauts d'un graphique multi-séries, par libellé puis série. P&L sépare les
 * commandes soumises qui composent Income et Expenses ; Net Profit est dérivé
 * et reste donc une sélection de contexte, sans navigation trompeuse.
 */
export function chartSeriesPointJumps(
  toolName: string,
  args: Record<string, unknown>,
  labels: string[],
  now: Date,
): Record<string, Record<string, NavJump>> | undefined {
  if (toolName !== "erpnext_profit_loss") return undefined;

  const jumps: Record<string, Record<string, NavJump>> = {};
  const months = Number(args.months ?? 6);
  for (const { label, range } of monthBuckets(months, now)) {
    if (!labels.includes(label)) continue;
    const filters = [
      ["transaction_date", ">=", range.from],
      ["transaction_date", "<=", range.to],
      ["docstatus", "=", 1],
    ];
    jumps[label] = {
      "Income": docList(
        `${label} · Income`,
        "Sales Order",
        SALES_ORDER_LIST_FIELDS,
        filters,
      ),
      "Expenses": docList(
        `${label} · Expenses`,
        "Purchase Order",
        PURCHASE_ORDER_LIST_FIELDS,
        filters,
      ),
    };
  }
  return Object.keys(jumps).length > 0 ? jumps : undefined;
}

function isChartViewer(result: UiRefreshableResult): boolean {
  const uri = result._meta?.ui?.resourceUri;
  return uri === "ui://mcp-erpnext/chart-viewer";
}

function isKpiViewer(result: UiRefreshableResult): boolean {
  const uri = result._meta?.ui?.resourceUri;
  return uri === "ui://mcp-erpnext/kpi-viewer";
}

function isFunnelViewer(result: UiRefreshableResult): boolean {
  const uri = result._meta?.ui?.resourceUri;
  return uri === "ui://mcp-erpnext/funnel-viewer";
}

/** Le doctype d'un résultat : au premier niveau (liste) ou sur `data` (un `_get`). */
function resultDoctype(result: UiRefreshableResult): string | undefined {
  if (typeof result.doctype === "string") return result.doctype;
  const data = result.data;
  if (isRecord(data) && typeof data.doctype === "string") return data.doctype;
  return undefined;
}

function isInvoiceViewer(result: UiRefreshableResult): boolean {
  const uri = result._meta?.ui?.resourceUri;
  return uri === "ui://mcp-erpnext/invoice-viewer";
}

function isStockViewer(result: UiRefreshableResult): boolean {
  const uri = result._meta?.ui?.resourceUri;
  return uri === "ui://mcp-erpnext/stock-viewer";
}

function isKanbanViewer(result: UiRefreshableResult): boolean {
  const uri = result._meta?.ui?.resourceUri;
  return uri === "ui://mcp-erpnext/kanban-viewer";
}

function isDoclistResult(result: UiRefreshableResult): boolean {
  return typeof result.doctype === "string" && Array.isArray(result.data);
}

function isDoclistViewer(result: UiRefreshableResult): boolean {
  const uri = result._meta?.ui?.resourceUri;
  return uri === "ui://mcp-erpnext/doclist-viewer";
}

/**
 * Appels codés dans les viewers, donc invisibles dans les hints dynamiques.
 * La liste envoyée reste bornée à la surface du viewer courant : elle ne
 * recopie jamais l'intégralité de `tools/list` dans le résultat métier.
 */
const VIEWER_TOOL_CANDIDATES: Record<string, readonly string[]> = {
  "ui://mcp-erpnext/invoice-viewer": [
    "erpnext_item_get",
    "erpnext_stock_balance",
  ],
  "ui://mcp-erpnext/doclist-viewer": [],
  "ui://mcp-erpnext/kanban-viewer": [
    "erpnext_doc_get",
    "erpnext_doc_update",
    "erpnext_user_list",
    "erpnext_doc_assign",
    "erpnext_doc_unassign",
  ],
  "ui://mcp-erpnext/stock-viewer": [
    "erpnext_item_get",
    "erpnext_stock_entry_list",
  ],
};

/**
 * DocTypes connus comme soumis/annulables dans les surfaces ERPNext couvertes.
 * Une absence est volontairement un refus : les outils génériques ne doivent
 * jamais transformer une fiche maître simplement parce qu'ils sont chargés.
 */
const SUBMITTABLE_VIEWER_DOCTYPES = new Set([
  "Quotation",
  "Sales Order",
  "Delivery Note",
  "Sales Invoice",
  "Purchase Order",
  "Purchase Receipt",
  "Purchase Invoice",
  "Stock Entry",
  "Journal Entry",
  "Payment Entry",
  "Timesheet",
  "Leave Application",
  "Salary Slip",
  "BOM",
  "Work Order",
  "Job Card",
  "Asset",
  "Asset Movement",
  "Shipment",
]);

const INVOICE_DEDICATED_MUTATION_TOOLS: Record<
  string,
  readonly string[]
> = {
  "Sales Order": [
    "erpnext_sales_order_submit",
    "erpnext_sales_order_cancel",
  ],
  "Sales Invoice": ["erpnext_sales_invoice_submit"],
};

function addDoctypeMutationCandidates(
  target: Set<string>,
  uri: string | undefined,
  doctype: string | undefined,
): void {
  if (!doctype || !SUBMITTABLE_VIEWER_DOCTYPES.has(doctype)) return;
  if (
    uri === "ui://mcp-erpnext/invoice-viewer" ||
    uri === "ui://mcp-erpnext/doclist-viewer"
  ) {
    target.add("erpnext_doc_submit");
    target.add("erpnext_doc_cancel");
  }
  if (uri === "ui://mcp-erpnext/invoice-viewer") {
    for (const tool of INVOICE_DEDICATED_MUTATION_TOOLS[doctype] ?? []) {
      target.add(tool);
    }
  }
}

function addJumpTools(
  target: Set<string>,
  jumps: Record<string, NavJump> | undefined,
): void {
  if (!jumps) return;
  for (const jump of Object.values(jumps)) target.add(jump.tool);
}

function addSeriesJumpTools(
  target: Set<string>,
  jumps: Record<string, Record<string, NavJump>> | undefined,
): void {
  if (!jumps) return;
  for (const seriesJumps of Object.values(jumps)) {
    addJumpTools(target, seriesJumps);
  }
}

/** Outils référencés par le payload et appels codés du viewer, filtrés au serveur. */
export function availableViewerToolNames(
  result: UiRefreshableResult,
  availableToolNames: ReadonlySet<string>,
): string[] {
  const candidates = new Set<string>();
  const uri = result._meta?.ui?.resourceUri;
  for (const name of uri ? VIEWER_TOOL_CANDIDATES[uri] ?? [] : []) {
    candidates.add(name);
  }
  addDoctypeMutationCandidates(candidates, uri, resultDoctype(result));
  if (result.refreshRequest) candidates.add(result.refreshRequest.toolName);
  if (result._rowAction) candidates.add(result._rowAction.toolName);
  for (const hint of result._sendMessageHints ?? []) {
    if (hint.tool) candidates.add(hint.tool);
  }
  addJumpTools(
    candidates,
    result._jumps
      ? Object.fromEntries(
        Object.entries(result._jumps).filter(
          (entry): entry is [string, NavJump] => entry[1] !== undefined,
        ),
      )
      : undefined,
  );
  addJumpTools(candidates, result._stageJumps);
  addJumpTools(candidates, result._pointJumps);
  addSeriesJumpTools(candidates, result._seriesPointJumps);
  if (typeof result.moveToolName === "string") {
    candidates.add(result.moveToolName);
  }
  return [...candidates].filter((name) => availableToolNames.has(name)).sort();
}

function filterJumpMap(
  jumps: Record<string, NavJump>,
  availableToolNames: ReadonlySet<string>,
): Record<string, NavJump> | undefined {
  const available = Object.fromEntries(
    Object.entries(jumps).filter(([, jump]) =>
      availableToolNames.has(jump.tool)
    ),
  );
  return Object.keys(available).length > 0 ? available : undefined;
}

function filterSeriesJumpMap(
  jumps: Record<string, Record<string, NavJump>>,
  availableToolNames: ReadonlySet<string>,
): Record<string, Record<string, NavJump>> | undefined {
  const available: Record<string, Record<string, NavJump>> = {};
  for (const [label, seriesJumps] of Object.entries(jumps)) {
    const filtered = filterJumpMap(seriesJumps, availableToolNames);
    if (filtered) available[label] = filtered;
  }
  return Object.keys(available).length > 0 ? available : undefined;
}

/** Retire les sauts que l'hôte ne peut pas exécuter, sans muter le résultat. */
export function filterNavJumpsByAvailableTools(
  result: UiRefreshableResult,
  availableToolNames?: ReadonlySet<string>,
): UiRefreshableResult {
  if (!availableToolNames) return result;

  const filtered: UiRefreshableResult = { ...result };
  if (result._jumps) {
    const jumps = filterJumpMap(
      Object.fromEntries(
        Object.entries(result._jumps).filter(
          (entry): entry is [string, NavJump] => entry[1] !== undefined,
        ),
      ),
      availableToolNames,
    );
    if (jumps) filtered._jumps = jumps;
    else delete filtered._jumps;
  }
  if (result._stageJumps) {
    const jumps = filterJumpMap(result._stageJumps, availableToolNames);
    if (jumps) filtered._stageJumps = jumps;
    else delete filtered._stageJumps;
  }
  if (result._pointJumps) {
    const jumps = filterJumpMap(result._pointJumps, availableToolNames);
    if (jumps) filtered._pointJumps = jumps;
    else delete filtered._pointJumps;
  }
  if (result._seriesPointJumps) {
    const jumps = filterSeriesJumpMap(
      result._seriesPointJumps,
      availableToolNames,
    );
    if (jumps) filtered._seriesPointJumps = jumps;
    else delete filtered._seriesPointJumps;
  }

  if (
    result._rowAction &&
    !availableToolNames.has(result._rowAction.toolName)
  ) {
    const doctype = resultDoctype(result);
    if (doctype && availableToolNames.has("erpnext_doc_get")) {
      filtered._rowAction = {
        toolName: "erpnext_doc_get",
        idField: "name",
        argName: "name",
        extraArgs: { doctype },
      };
    } else {
      delete filtered._rowAction;
    }
  }

  if (result._sendMessageHints) {
    filtered._sendMessageHints = result._sendMessageHints.map((hint) => {
      if (!hint.tool || availableToolNames.has(hint.tool)) return hint;
      // La question reste utilisable sur un hôte conversationnel, mais le
      // viewer ne doit jamais tenter un outil absent de ce déploiement.
      return { key: hint.key, label: hint.label, message: hint.message };
    });
  }
  // Écrase toute valeur fournie par un handler : seul le registre réellement
  // chargé au démarrage fait autorité pour les appels initiés par le viewer.
  filtered._availableTools = availableViewerToolNames(
    filtered,
    availableToolNames,
  );
  return filtered;
}

/**
 * Applique le contrat de capacités sans synthétiser de refresh. Utile pour
 * les résultats mutateurs : ils ne doivent ni rejouer leur propre outil, ni
 * laisser passer une liste `_availableTools` forgée par un handler.
 */
export function withViewerToolCapabilities(
  result: unknown,
  availableToolNames: ReadonlySet<string>,
): unknown {
  if (!isRecord(result) || !hasUiResource(result)) return result;
  return filterNavJumpsByAvailableTools(result, availableToolNames);
}

export function withUiRefreshRequest(
  result: unknown,
  toolName: string,
  args: Record<string, unknown>,
  now: Date = new Date(),
  availableToolNames?: ReadonlySet<string>,
): unknown {
  if (!isRecord(result) || !hasUiResource(result)) {
    return result;
  }

  const refreshable = result as UiRefreshableResult;
  const enriched: UiRefreshableResult = { ...refreshable };

  // Inject refreshRequest if not already present
  if (!enriched.refreshRequest) {
    enriched.refreshRequest = {
      toolName,
      arguments: { ...args },
    };
  }

  // Inject _rowAction for doclist results that point to the doclist-viewer
  if (
    isDoclistResult(enriched) && isDoclistViewer(enriched) &&
    !enriched._rowAction
  ) {
    const dedicatedTool = DOCTYPE_GET_TOOLS[enriched.doctype!];
    if (dedicatedTool) {
      enriched._rowAction = {
        toolName: dedicatedTool,
        idField: "name",
        argName: "name",
      };
    } else {
      // Fallback: use generic erpnext_doc_get with doctype as extraArg
      enriched._rowAction = {
        toolName: "erpnext_doc_get",
        idField: "name",
        argName: "name",
        extraArgs: { doctype: enriched.doctype! },
      };
    }
  }

  // Inject sendMessage hints for known DocTypes
  if (
    isDoclistResult(enriched) && isDoclistViewer(enriched) &&
    !enriched._sendMessageHints
  ) {
    const hints = DOCTYPE_SEND_MESSAGE_HINTS[enriched.doctype!];
    if (hints) {
      enriched._sendMessageHints = hints;
    }
  }

  // Inject chart drill-down template
  if (isChartViewer(enriched) && !enriched._drillDown) {
    const template = CHART_DRILL_DOWN[toolName];
    if (template) enriched._drillDown = template;
  }

  // Inject KPI drill-down hints
  if (isKpiViewer(enriched)) {
    const kpiHints = KPI_DRILL_DOWN[toolName];
    if (kpiHints) {
      if (kpiHints._drillDown && !enriched._drillDown) {
        enriched._drillDown = kpiHints._drillDown;
      }
      if (kpiHints._trendDrillDown && !enriched._trendDrillDown) {
        enriched._trendDrillDown = kpiHints._trendDrillDown;
      }
    }
  }

  // Les sauts typés : KPI (nombre → liste, courbe → graphique), funnel (étape → liste)
  if (isKpiViewer(enriched) && !enriched._jumps) {
    const jumps = KPI_JUMPS[toolName];
    if (jumps) enriched._jumps = jumps(monthRange(now));
  }
  if (isFunnelViewer(enriched) && !enriched._stageJumps) {
    enriched._stageJumps = funnelStageJumps(args, now);
  }
  if (isChartViewer(enriched) && Array.isArray(enriched.labels)) {
    const labels = enriched.labels.map(String);
    if (!enriched._pointJumps) {
      const jumps = chartPointJumps(toolName, args, labels, now);
      if (jumps) enriched._pointJumps = jumps;
    }
    if (!enriched._seriesPointJumps) {
      const jumps = chartSeriesPointJumps(toolName, args, labels, now);
      if (jumps) enriched._seriesPointJumps = jumps;
    }
  }
  // Facture, stock, kanban : les hints typés de la pièce ou du tableau.
  // Un `_get` renvoie `{ data: doc }` : le doctype est sur le document.
  if (!enriched._sendMessageHints) {
    const doctype = resultDoctype(enriched);
    if (isInvoiceViewer(enriched) && doctype) {
      const hints = INVOICE_HINTS[doctype];
      if (hints) enriched._sendMessageHints = hints;
    } else if (isStockViewer(enriched)) {
      enriched._sendMessageHints = STOCK_HINTS;
    } else if (isKanbanViewer(enriched) && doctype) {
      const hints = DOCTYPE_SEND_MESSAGE_HINTS[doctype];
      if (hints) enriched._sendMessageHints = hints;
    }
  }

  return filterNavJumpsByAvailableTools(enriched, availableToolNames);
}
