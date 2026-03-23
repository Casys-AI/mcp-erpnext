# Tools Reference (120)

Full reference for all ERPNext MCP tools. See [README](../README.md) for overview.

## Setup (2)

| Tool | DocType | Operations |
|------|---------|-----------|
| `erpnext_company_list` | Company | List companies |
| `erpnext_company_create` | Company | Create (name, abbr, currency, country, domain) |

## Sales (17) → doclist-viewer / invoice-viewer

| Tool | DocType | Operations |
|------|---------|-----------|
| `erpnext_customer_list` | Customer | List + filters (group, territory, disabled) |
| `erpnext_customer_get` | Customer | Get by name |
| `erpnext_customer_create` | Customer | Create (name, group, territory, email, type) |
| `erpnext_customer_update` | Customer | Update fields |
| `erpnext_sales_order_list` | Sales Order | List + filters (customer, status, dates) |
| `erpnext_sales_order_get` | Sales Order | Get with line items |
| `erpnext_sales_order_create` | Sales Order | Create (customer + items + delivery_date) |
| `erpnext_sales_order_update` | Sales Order | Update (delivery_date, items) |
| `erpnext_sales_order_submit` | Sales Order | Submit (Draft → To Deliver and Bill) |
| `erpnext_sales_order_cancel` | Sales Order | Cancel |
| `erpnext_sales_invoice_list` | Sales Invoice | List + filters |
| `erpnext_sales_invoice_get` | Sales Invoice | Get with line items |
| `erpnext_sales_invoice_create` | Sales Invoice | Create (customer + items + dates) |
| `erpnext_sales_invoice_submit` | Sales Invoice | Submit (Draft → Unpaid) |
| `erpnext_quotation_list` | Quotation | List + filters (party, status) |
| `erpnext_quotation_get` | Quotation | Get with line items |
| `erpnext_quotation_create` | Quotation | Create (Customer/Lead + items) |

## Inventory (9) → doclist-viewer / stock-viewer

| Tool | DocType | Operations |
|------|---------|-----------|
| `erpnext_item_list` | Item | List + filters (group, stock flag, disabled) |
| `erpnext_item_get` | Item | Get by name/code |
| `erpnext_item_create` | Item | Create (code, name, group, uom, rate) |
| `erpnext_item_update` | Item | Update fields |
| `erpnext_stock_balance` | Bin | Stock balances by item/warehouse |
| `erpnext_warehouse_list` | Warehouse | List + filters (company, type) |
| `erpnext_stock_entry_list` | Stock Entry | List + filters (type, dates) |
| `erpnext_stock_entry_get` | Stock Entry | Get with item details |
| `erpnext_stock_entry_create` | Stock Entry | Create (type + items + warehouses) |

## Purchasing (11) → doclist-viewer / invoice-viewer

| Tool | DocType | Operations |
|------|---------|-----------|
| `erpnext_supplier_list` | Supplier | List + filters (group, type, disabled) |
| `erpnext_supplier_get` | Supplier | Get by name |
| `erpnext_supplier_create` | Supplier | Create (name, group, type, country, currency) |
| `erpnext_purchase_order_list` | Purchase Order | List + filters (supplier, status, dates) |
| `erpnext_purchase_order_get` | Purchase Order | Get with line items |
| `erpnext_purchase_order_create` | Purchase Order | Create (supplier + items + schedule_date) |
| `erpnext_purchase_invoice_list` | Purchase Invoice | List + filters |
| `erpnext_purchase_invoice_get` | Purchase Invoice | Get with line items |
| `erpnext_purchase_receipt_list` | Purchase Receipt | List + filters |
| `erpnext_purchase_receipt_get` | Purchase Receipt | Get with received items |
| `erpnext_supplier_quotation_list` | Supplier Quotation | List + filters |

## Accounting (6) → doclist-viewer

| Tool | DocType | Operations |
|------|---------|-----------|
| `erpnext_account_list` | Account | Chart of accounts + filters (root_type, is_group) |
| `erpnext_journal_entry_list` | Journal Entry | List + filters (voucher_type, dates) |
| `erpnext_journal_entry_get` | Journal Entry | Get with accounts |
| `erpnext_journal_entry_create` | Journal Entry | Create (voucher_type + balanced accounts) |
| `erpnext_payment_entry_list` | Payment Entry | List + filters (type, party, dates) |
| `erpnext_payment_entry_get` | Payment Entry | Get with references |

## HR (12) → doclist-viewer

| Tool | DocType | Operations |
|------|---------|-----------|
| `erpnext_employee_list` | Employee | List + filters (department, status, company) |
| `erpnext_employee_get` | Employee | Get by ID |
| `erpnext_attendance_list` | Attendance | List + filters (employee, status, dates) |
| `erpnext_leave_application_list` | Leave Application | List + filters |
| `erpnext_leave_application_get` | Leave Application | Get by name |
| `erpnext_leave_application_create` | Leave Application | Create (employee, type, dates, reason) |
| `erpnext_salary_slip_list` | Salary Slip | List + filters (employee, status, dates) |
| `erpnext_salary_slip_get` | Salary Slip | Get with earnings/deductions |
| `erpnext_payroll_entry_list` | Payroll Entry | List + filters (company, status) |
| `erpnext_expense_claim_list` | Expense Claim | List + filters |
| `erpnext_expense_claim_create` | Expense Claim | Create (employee + expenses[]) |
| `erpnext_leave_balance` | Leave Allocation | Get allocations by employee |

## Project (9) → doclist-viewer

| Tool | DocType | Operations |
|------|---------|-----------|
| `erpnext_project_list` | Project | List + filters (status, company) |
| `erpnext_project_get` | Project | Get by name |
| `erpnext_project_create` | Project | Create (name, status, dates, budget, company) |
| `erpnext_task_list` | Task | List + filters (project, status, priority) |
| `erpnext_task_get` | Task | Get with dependencies |
| `erpnext_task_create` | Task | Create (project, subject, status, priority, dates) |
| `erpnext_task_update` | Task | Update (status, priority, progress, dates) |
| `erpnext_timesheet_list` | Timesheet | List + filters (employee, project, status) |
| `erpnext_timesheet_get` | Timesheet | Get with time log details |

## Delivery (5) → doclist-viewer

| Tool | DocType | Operations |
|------|---------|-----------|
| `erpnext_delivery_note_list` | Delivery Note | List + filters (customer, status, dates) |
| `erpnext_delivery_note_get` | Delivery Note | Get with delivered items |
| `erpnext_delivery_note_create` | Delivery Note | Create (customer + items + against_sales_order) |
| `erpnext_shipment_list` | Shipment | List + filters (status, carrier, dates) |
| `erpnext_shipment_get` | Shipment | Get with parcels |

## Manufacturing (7) → doclist-viewer

| Tool | DocType | Operations |
|------|---------|-----------|
| `erpnext_bom_list` | BOM | List + filters (item, is_active, is_default) |
| `erpnext_bom_get` | BOM | Get with raw materials + operations |
| `erpnext_work_order_list` | Work Order | List + filters (production_item, status, dates) |
| `erpnext_work_order_get` | Work Order | Get with operations + materials |
| `erpnext_work_order_create` | Work Order | Create (production_item, bom_no, qty, dates) |
| `erpnext_job_card_list` | Job Card | List + filters (work_order, status, operation) |
| `erpnext_job_card_get` | Job Card | Get with time logs + material transfers |

## CRM (8) → doclist-viewer

| Tool | DocType | Operations |
|------|---------|-----------|
| `erpnext_lead_list` | Lead | List + filters (status, lead_owner, source) |
| `erpnext_lead_get` | Lead | Get by name |
| `erpnext_lead_create` | Lead | Create (name, company, email, phone, source) |
| `erpnext_opportunity_list` | Opportunity | List + filters (status, owner, party) |
| `erpnext_opportunity_get` | Opportunity | Get with items + competitors |
| `erpnext_contact_list` | Contact | List + filters (company, status) |
| `erpnext_contact_get` | Contact | Get by name |
| `erpnext_campaign_list` | Campaign | List + filters (campaign_type) |

## Assets (8) → doclist-viewer

| Tool | DocType | Operations |
|------|---------|-----------|
| `erpnext_asset_list` | Asset | List + filters (status, category, location) |
| `erpnext_asset_get` | Asset | Get with depreciation + maintenance |
| `erpnext_asset_create` | Asset | Create (name, category, company, purchase_date, cost) |
| `erpnext_asset_movement_list` | Asset Movement | List + filters (purpose, dates) |
| `erpnext_asset_movement_get` | Asset Movement | Get with assets moved |
| `erpnext_asset_maintenance_list` | Asset Maintenance | List + filters |
| `erpnext_asset_maintenance_get` | Asset Maintenance | Get with maintenance tasks |
| `erpnext_asset_category_list` | Asset Category | List all categories |

## Generic Operations (7) → doclist-viewer

| Tool | Operation | Notes |
|------|-----------|-------|
| `erpnext_doc_create` | Create | Any DocType — essential for master data setup |
| `erpnext_doc_get` | Get | Any document by DocType + name |
| `erpnext_doc_list` | List | Any DocType with fields, filters, limit, order_by |
| `erpnext_doc_update` | Update | Partial patch — pass only fields to change |
| `erpnext_doc_delete` | Delete | Draft documents only |
| `erpnext_doc_submit` | Submit | Any submittable document |
| `erpnext_doc_cancel` | Cancel | Any submitted document |

## Kanban (2) → kanban-viewer

| Tool | Description |
|------|-------------|
| `erpnext_kanban_get_board` | Get a normalized kanban board for `Task`, `Opportunity`, or `Issue` |
| `erpnext_kanban_move_card` | Execute a validated card move with business error handling |

## Analytics (17) → chart-viewer / kpi-viewer / funnel-viewer

| Tool | Viewer | Description |
|------|--------|-------------|
| `erpnext_stock_chart` | chart | Bar chart of stock levels by item/warehouse |
| `erpnext_sales_chart` | chart | Revenue by customer, item, or status (bar/donut) |
| `erpnext_revenue_trend` | chart | Monthly revenue trend (line/area, per customer) |
| `erpnext_order_breakdown` | chart | Orders by customer/status (stacked-bar/pie/donut) |
| `erpnext_revenue_vs_orders` | chart | Revenue bars + order count line (dual axis) |
| `erpnext_stock_treemap` | chart | Stock value treemap by item or warehouse |
| `erpnext_product_radar` | chart | Radar comparing items (stock, value, orders, revenue) |
| `erpnext_price_vs_qty` | chart | Scatter: selling price vs quantity ordered |
| `erpnext_ar_aging` | chart | AR aging buckets (0-30, 31-60, 61-90, 90+ days) |
| `erpnext_gross_profit` | chart | Revenue bars + margin % line by item/customer |
| `erpnext_profit_loss` | chart | P&L: income vs expenses per month + net profit |
| `erpnext_kpi_revenue` | kpi | Revenue MTD with delta vs previous month + sparkline |
| `erpnext_kpi_outstanding` | kpi | Outstanding receivables (count + total) |
| `erpnext_kpi_orders` | kpi | Orders this month with delta vs last month |
| `erpnext_kpi_gross_margin` | kpi | Gross margin % based on valuation rates |
| `erpnext_kpi_overdue` | kpi | Overdue invoices count + value |
| `erpnext_sales_funnel` | funnel | Lead → Opportunity → Quotation → Order funnel |
