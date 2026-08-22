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
 * Un bouton de navigation attaché à un résultat de liste.
 *
 * La vue affiche `label` (ou le libellé traduit `doclist.hint.<key>`) et
 * envoie `message` à la conversation, `{id}` et `{doctype}` remplis avec le
 * document sélectionné. `tool` + `args` décrivent l'outil qui répondrait à
 * la même question : aucune vue ne les appelle aujourd'hui — c'est un
 * contrat réservé aux hôtes et agents, vérifié par le test de contrat.
 */
interface SendMessageHint {
  key: string;
  label: string;
  message: string;
  tool?: string;
  args?: Record<string, unknown>;
}

interface UiRefreshableResult {
  _meta?: UiMetadata;
  refreshRequest?: UiRefreshRequest;
  _rowAction?: RowAction;
  _sendMessageHints?: SendMessageHint[];
  _drillDown?: string;
  _trendDrillDown?: string;
  doctype?: string;
  data?: unknown[];
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
    _drillDown: "Show all sales invoices for this month",
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
    _drillDown: "Show gross profit breakdown by item",
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
  "erpnext_revenue_trend": "Show sales invoices for month {label}",
  "erpnext_order_breakdown": "Show sales orders for {label}",
  "erpnext_ar_aging": "Show overdue sales invoices in the {label} aging bucket",
  "erpnext_gross_profit": "Show gross profit details for {label}",
  "erpnext_profit_loss": "Show accounting details for month {label}",
};

function isChartViewer(result: UiRefreshableResult): boolean {
  const uri = result._meta?.ui?.resourceUri;
  return uri === "ui://mcp-erpnext/chart-viewer";
}

function isKpiViewer(result: UiRefreshableResult): boolean {
  const uri = result._meta?.ui?.resourceUri;
  return uri === "ui://mcp-erpnext/kpi-viewer";
}

function isDoclistResult(result: UiRefreshableResult): boolean {
  return typeof result.doctype === "string" && Array.isArray(result.data);
}

function isDoclistViewer(result: UiRefreshableResult): boolean {
  const uri = result._meta?.ui?.resourceUri;
  return uri === "ui://mcp-erpnext/doclist-viewer";
}

export function withUiRefreshRequest(
  result: unknown,
  toolName: string,
  args: Record<string, unknown>,
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

  return enriched;
}
