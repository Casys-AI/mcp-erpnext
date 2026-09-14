import type { t as Translate } from "../../shared/i18n.ts";
type TFunction = typeof Translate;

const STATUS_KEYS: Record<string, string> = {
  "Submitted": "doclist.detail.action.submit_ok",
  "Completed": "kanban.status.completed",
  "Paid": "invoice.status.paid",
  "Unpaid": "invoice.status.unpaid",
  "Return": "stable.invoice.status.return",
  "Open": "kanban.status.open",
  "Cancelled": "kanban.status.cancelled",
  "Overdue": "kanban.status.overdue",
  "Closed": "kanban.status.closed",
  "Active": "stable.doclist.status.active",
  "Enabled": "stable.doclist.status.enabled",
  "To Deliver and Bill": "stable.doclist.status.to_deliver_and_bill",
  "To Bill": "stable.doclist.status.to_bill",
  "To Deliver": "stable.doclist.status.to_deliver",
  "Draft": "stable.doclist.status.draft",
  "Pending": "stable.doclist.status.pending",
  "Partly Paid": "stable.doclist.status.partly_paid",
  "Partly Delivered": "stable.doclist.status.partly_delivered",
  "Disabled": "stable.doclist.status.disabled",
  "Working": "kanban.status.working",
  "Pending Review": "kanban.status.pending_review",
  "Replied": "kanban.status.replied",
  "Quotation": "kanban.status.quotation",
  "Converted": "kanban.status.converted",
  "Lost": "kanban.status.lost",
  "On Hold": "kanban.status.on_hold",
  "Resolved": "kanban.status.resolved",
};

const FIELD_KEYS: Record<string, string> = {
  "name": "stable.doclist.column.name",
  "status": "kanban.field.status",
  "priority": "kanban.field.priority",
  "project": "kanban.field.project",
  "subject": "kanban.field.subject",
  "description": "kanban.field.description",
  "currency": "kanban.field.currency",
  "company": "kanban.field.company",
  "type": "stable.doclist.column.type",
  "customer": "kanban.field.customer",
  "grand_total": "invoice.totals.grand_total",
  "amount": "invoice.table.col.amount",
  "total": "common.total",
  "item_code": "stable.doclist.column.item_code",
  "item_name": "stable.doclist.column.item_name",
  "customer_name": "stable.doclist.column.customer_name",
  "supplier": "stable.doclist.column.supplier",
  "supplier_name": "stable.doclist.column.supplier_name",
  "employee_name": "stable.doclist.column.employee_name",
  "outstanding_amount": "stable.doclist.column.outstanding_amount",
  "posting_date": "stable.doclist.column.posting_date",
  "transaction_date": "stable.doclist.column.transaction_date",
  "delivery_date": "stable.doclist.column.delivery_date",
  "workflow_state": "stable.doclist.column.workflow_state",
  "docstatus": "stable.doclist.column.docstatus",
  "territory": "stable.doclist.column.territory",
  "customer_group": "stable.doclist.column.customer_group",
  "item_group": "stable.doclist.column.item_group",
  "supplier_group": "stable.doclist.column.supplier_group",
  "qty": "invoice.table.col.qty",
  "rate": "invoice.table.col.rate",
  "warehouse": "stable.doclist.column.warehouse",
  "stock_uom": "invoice.item.label.uom",
  "uom": "invoice.item.label.uom",
};

const HINT_KEYS: Record<string, string> = {
  "Orders": "doclist.hint.orders",
  "Invoices": "doclist.hint.invoices",
  "Invoice": "doclist.hint.invoice",
  "Delivery": "doclist.hint.delivery",
  "Payments": "doclist.hint.payments",
  "Stock": "doclist.hint.stock",
  "PO": "doclist.hint.po",
  "Receipt": "doclist.hint.receipt",
  "Attendance": "doclist.hint.attendance",
  "Leaves": "doclist.hint.leaves",
  "Tasks": "doclist.hint.tasks",
  "Timesheets": "doclist.hint.timesheets",
  "Opportunities": "doclist.hint.opportunities",
};

export function statusLabel(value: string, t: TFunction): string {
  const key = Object.hasOwn(STATUS_KEYS, value)
    ? STATUS_KEYS[value]
    : undefined;
  return key ? t(key) : value;
}

export function fieldLabel(field: string, t: TFunction): string {
  return field.split(".").map((part) => {
    const key = Object.hasOwn(FIELD_KEYS, part) ? FIELD_KEYS[part] : undefined;
    return key ? t(key) : part.replace(/_/g, " ");
  }).join(" > ");
}

export function hintLabel(label: string, t: TFunction): string {
  const key = Object.hasOwn(HINT_KEYS, label) ? HINT_KEYS[label] : undefined;
  return key ? t(key) : label;
}

const HINT_MESSAGE_KEYS: Record<string, string> = {
  "Show sales orders for customer {id}":
    "stable.doclist.hint.orders_customer.message",
  "Show sales invoices for customer {id}":
    "stable.doclist.hint.invoices_customer.message",
  "Show invoices linked to sales order {id}":
    "stable.doclist.hint.invoices_order.message",
  "Show delivery notes for sales order {id}":
    "stable.doclist.hint.delivery_order.message",
  "Show payment entries for invoice {id}":
    "stable.doclist.hint.payments_invoice.message",
  "Show stock balance for item {id}": "stable.doclist.hint.stock_item.message",
  "Show sales orders containing item {id}":
    "stable.doclist.hint.orders_item.message",
  "Show purchase orders for supplier {id}":
    "stable.doclist.hint.orders_supplier.message",
  "Show purchase invoices for supplier {id}":
    "stable.doclist.hint.invoices_supplier.message",
  "Show purchase receipts for order {id}":
    "stable.doclist.hint.receipts_order.message",
  "Show purchase invoices for order {id}":
    "stable.doclist.hint.invoices_purchase_order.message",
  "Show attendance for employee {id}":
    "stable.doclist.hint.attendance_employee.message",
  "Show leave applications for employee {id}":
    "stable.doclist.hint.leaves_employee.message",
  "Show tasks for project {id}": "stable.doclist.hint.tasks_project.message",
  "Show timesheets for project {id}":
    "stable.doclist.hint.timesheets_project.message",
  "Show timesheets for task {id}":
    "stable.doclist.hint.timesheets_task.message",
  "Show opportunities for lead {id}":
    "stable.doclist.hint.opportunities_lead.message",
};

export function hintMessage(
  message: string,
  id: string,
  doctype: string,
  t: TFunction,
): string {
  const key = Object.hasOwn(HINT_MESSAGE_KEYS, message)
    ? HINT_MESSAGE_KEYS[message]
    : undefined;
  return key
    ? t(key, { id, doctype })
    : message.replace(/\{id\}/g, id).replace(/\{doctype\}/g, doctype);
}

const PRIORITY_KEYS: Record<string, string> = {
  Low: "kanban.select.priority.Low",
  Medium: "kanban.select.priority.Medium",
  High: "kanban.select.priority.High",
  Urgent: "kanban.select.priority.Urgent",
};

export function priorityLabel(priority: string, t: TFunction): string {
  const key = Object.hasOwn(PRIORITY_KEYS, priority)
    ? PRIORITY_KEYS[priority]
    : undefined;
  return key ? t(key) : priority;
}
