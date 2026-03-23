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

interface SendMessageHint {
  label: string;
  message: string;
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
const DOCTYPE_SEND_MESSAGE_HINTS: Record<string, SendMessageHint[]> = {
  "Customer": [
    { label: "Orders", message: "Show sales orders for customer {id}" },
    { label: "Invoices", message: "Show sales invoices for customer {id}" },
  ],
  "Sales Order": [
    { label: "Invoice", message: "Show invoices linked to sales order {id}" },
    { label: "Delivery", message: "Show delivery notes for sales order {id}" },
  ],
  "Sales Invoice": [
    { label: "Payments", message: "Show payment entries for invoice {id}" },
  ],
  "Item": [
    { label: "Stock", message: "Show stock balance for item {id}" },
    { label: "Orders", message: "Show sales orders containing item {id}" },
  ],
  "Supplier": [
    { label: "PO", message: "Show purchase orders for supplier {id}" },
    { label: "Invoices", message: "Show purchase invoices for supplier {id}" },
  ],
  "Purchase Order": [
    { label: "Receipt", message: "Show purchase receipts for order {id}" },
    { label: "Invoice", message: "Show purchase invoices for order {id}" },
  ],
  "Employee": [
    { label: "Attendance", message: "Show attendance for employee {id}" },
    { label: "Leaves", message: "Show leave applications for employee {id}" },
  ],
  "Project": [
    { label: "Tasks", message: "Show tasks for project {id}" },
    { label: "Timesheets", message: "Show timesheets for project {id}" },
  ],
  "Task": [
    { label: "Timesheets", message: "Show timesheets for task {id}" },
  ],
  "Lead": [
    { label: "Opportunities", message: "Show opportunities for lead {id}" },
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
