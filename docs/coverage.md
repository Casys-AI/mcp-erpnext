# ERPNext MCP Library - Coverage

## Covered (100 tools, 12 categories)

### Sales (17 tools)

| Tool | DocType | Operations | UI Viewer |
|------|---------|-----------|-----------|
| `erpnext_customer_list` | Customer | List + filters (group, territory, disabled) | doclist-viewer |
| `erpnext_customer_get` | Customer | Get by name | - |
| `erpnext_customer_create` | Customer | Create (name, group, territory, email, type) | - |
| `erpnext_customer_update` | Customer | Update (name, group, territory, email, disabled) | - |
| `erpnext_sales_order_list` | Sales Order | List + filters (customer, status, dates) | doclist-viewer |
| `erpnext_sales_order_get` | Sales Order | Get by name (with line items) | - |
| `erpnext_sales_order_create` | Sales Order | Create (customer + items + delivery_date) | - |
| `erpnext_sales_order_update` | Sales Order | Update (delivery_date, items) | - |
| `erpnext_sales_order_submit` | Sales Order | Submit (Draft → To Deliver and Bill) | - |
| `erpnext_sales_order_cancel` | Sales Order | Cancel (submitted → Cancelled) | - |
| `erpnext_sales_invoice_list` | Sales Invoice | List + filters (customer, status, dates) | doclist-viewer |
| `erpnext_sales_invoice_get` | Sales Invoice | Get by name (with line items) | invoice-viewer |
| `erpnext_sales_invoice_create` | Sales Invoice | Create (customer + items + dates) | - |
| `erpnext_sales_invoice_submit` | Sales Invoice | Submit (Draft → Unpaid) | - |
| `erpnext_quotation_list` | Quotation | List + filters (party, status) | doclist-viewer |
| `erpnext_quotation_get` | Quotation | Get by name (with line items) | - |
| `erpnext_quotation_create` | Quotation | Create (Customer/Lead + items + dates) | - |

### Inventory (9 tools)

| Tool | DocType | Operations | UI Viewer |
|------|---------|-----------|-----------|
| `erpnext_item_list` | Item | List + filters (group, stock flag, disabled) | doclist-viewer |
| `erpnext_item_get` | Item | Get by name/code | - |
| `erpnext_item_create` | Item | Create (code, name, group, uom, rate) | - |
| `erpnext_item_update` | Item | Update (name, group, rate, description, disabled) | - |
| `erpnext_stock_balance` | Bin | List stock balances (item, warehouse) | stock-viewer |
| `erpnext_warehouse_list` | Warehouse | List + filters (company, type) | doclist-viewer |
| `erpnext_stock_entry_list` | Stock Entry | List + filters (type, dates) | doclist-viewer |
| `erpnext_stock_entry_get` | Stock Entry | Get by name (with item details) | - |
| `erpnext_stock_entry_create` | Stock Entry | Create (type + items + warehouses) | - |

### Accounting (6 tools)

| Tool | DocType | Operations | UI Viewer |
|------|---------|-----------|-----------|
| `erpnext_account_list` | Account | List chart of accounts + filters (root_type, is_group) | doclist-viewer |
| `erpnext_journal_entry_list` | Journal Entry | List + filters (voucher_type, dates) | doclist-viewer |
| `erpnext_journal_entry_get` | Journal Entry | Get by name (with accounts) | - |
| `erpnext_journal_entry_create` | Journal Entry | Create (voucher_type + balanced accounts) | - |
| `erpnext_payment_entry_list` | Payment Entry | List + filters (type, party, dates) | doclist-viewer |
| `erpnext_payment_entry_get` | Payment Entry | Get by name (with references) | - |

### HR (12 tools)

| Tool | DocType | Operations | UI Viewer |
|------|---------|-----------|-----------|
| `erpnext_employee_list` | Employee | List + filters (department, status, company) | doclist-viewer |
| `erpnext_employee_get` | Employee | Get by ID | - |
| `erpnext_attendance_list` | Attendance | List + filters (employee, status, dates) | doclist-viewer |
| `erpnext_leave_application_list` | Leave Application | List + filters (employee, status, type) | doclist-viewer |
| `erpnext_leave_application_get` | Leave Application | Get by name | - |
| `erpnext_leave_application_create` | Leave Application | Create (employee, type, dates, reason) | - |
| `erpnext_salary_slip_list` | Salary Slip | List + filters (employee, status, dates) | doclist-viewer |
| `erpnext_salary_slip_get` | Salary Slip | Get by name (with earnings/deductions) | - |
| `erpnext_payroll_entry_list` | Payroll Entry | List + filters (company, status) | doclist-viewer |
| `erpnext_expense_claim_list` | Expense Claim | List + filters (employee, status, approval_status) | doclist-viewer |
| `erpnext_expense_claim_create` | Expense Claim | Create (employee + expenses[] child table) | - |
| `erpnext_leave_balance` | Leave Allocation | Get allocations by employee (docstatus=1) | doclist-viewer |

### Project (9 tools)

| Tool | DocType | Operations | UI Viewer |
|------|---------|-----------|-----------|
| `erpnext_project_list` | Project | List + filters (status, company) | doclist-viewer |
| `erpnext_project_get` | Project | Get by name | - |
| `erpnext_project_create` | Project | Create (name, status, dates, budget, company) | - |
| `erpnext_task_list` | Task | List + filters (project, status, priority) | doclist-viewer |
| `erpnext_task_get` | Task | Get by name (with dependencies) | - |
| `erpnext_task_create` | Task | Create (project, subject, status, priority, dates) | - |
| `erpnext_task_update` | Task | Update (status, priority, progress, dates, description) | - |
| `erpnext_timesheet_list` | Timesheet | List + filters (employee, project, status) | doclist-viewer |
| `erpnext_timesheet_get` | Timesheet | Get by name (with time log details) | - |

### Setup (2 tools)

| Tool | DocType | Operations | UI Viewer |
|------|---------|-----------|-----------|
| `erpnext_company_list` | Company | List companies (name, abbr, currency, country) | doclist-viewer |
| `erpnext_company_create` | Company | Create company (name, abbr, currency, country, domain) | - |

### Generic Operations (7 tools)

| Tool | DocType | Operations | UI Viewer |
|------|---------|-----------|-----------|
| `erpnext_doc_create` | Any | Create any document (doctype + data object) | - |
| `erpnext_doc_update` | Any | Update any document (partial patch) | - |
| `erpnext_doc_delete` | Any | Delete any document (Draft only) | - |
| `erpnext_doc_submit` | Any | Submit any submittable document | - |
| `erpnext_doc_cancel` | Any | Cancel any submitted document | - |
| `erpnext_doc_get` | Any | Get any document by DocType + name | - |
| `erpnext_doc_list` | Any | List any DocType with field/filter/limit control | doclist-viewer |

### Purchasing (11 tools)

| Tool | DocType | Operations | UI Viewer |
|------|---------|-----------|-----------|
| `erpnext_supplier_list` | Supplier | List + filters (group, type, disabled) | doclist-viewer |
| `erpnext_supplier_get` | Supplier | Get by name | - |
| `erpnext_supplier_create` | Supplier | Create (name, group, type, country, currency) | - |
| `erpnext_purchase_order_list` | Purchase Order | List + filters (supplier, status, dates) | doclist-viewer |
| `erpnext_purchase_order_get` | Purchase Order | Get by name (with line items) | - |
| `erpnext_purchase_order_create` | Purchase Order | Create (supplier + items + schedule_date) | - |
| `erpnext_purchase_invoice_list` | Purchase Invoice | List + filters (supplier, status, dates) | doclist-viewer |
| `erpnext_purchase_invoice_get` | Purchase Invoice | Get by name (with line items) | - |
| `erpnext_purchase_receipt_list` | Purchase Receipt | List + filters (supplier, status, dates) | doclist-viewer |
| `erpnext_purchase_receipt_get` | Purchase Receipt | Get by name (with received items) | - |
| `erpnext_supplier_quotation_list` | Supplier Quotation | List + filters (supplier, status) | doclist-viewer |

### Delivery (5 tools)

| Tool | DocType | Operations | UI Viewer |
|------|---------|-----------|-----------|
| `erpnext_delivery_note_list` | Delivery Note | List + filters (customer, status, dates) | doclist-viewer |
| `erpnext_delivery_note_get` | Delivery Note | Get by name (with delivered items) | - |
| `erpnext_delivery_note_create` | Delivery Note | Create (customer + items + against_sales_order) | - |
| `erpnext_shipment_list` | Shipment | List + filters (status, carrier, dates) | doclist-viewer |
| `erpnext_shipment_get` | Shipment | Get by name (with parcels) | - |

### Manufacturing (7 tools)

| Tool | DocType | Operations | UI Viewer |
|------|---------|-----------|-----------|
| `erpnext_bom_list` | BOM | List + filters (item, is_active, is_default) | doclist-viewer |
| `erpnext_bom_get` | BOM | Get by name (with raw materials + operations) | - |
| `erpnext_work_order_list` | Work Order | List + filters (production_item, status, dates) | doclist-viewer |
| `erpnext_work_order_get` | Work Order | Get by name (with operations + materials) | - |
| `erpnext_work_order_create` | Work Order | Create (production_item, bom_no, qty, dates, warehouses) | - |
| `erpnext_job_card_list` | Job Card | List + filters (work_order, status, operation) | doclist-viewer |
| `erpnext_job_card_get` | Job Card | Get by name (with time logs + material transfers) | - |

### CRM (8 tools)

| Tool | DocType | Operations | UI Viewer |
|------|---------|-----------|-----------|
| `erpnext_lead_list` | Lead | List + filters (status, lead_owner, source) | doclist-viewer |
| `erpnext_lead_get` | Lead | Get by name | - |
| `erpnext_lead_create` | Lead | Create (name, company, email, phone, source, owner) | - |
| `erpnext_opportunity_list` | Opportunity | List + filters (status, owner, party) | doclist-viewer |
| `erpnext_opportunity_get` | Opportunity | Get by name (with items + competitors) | - |
| `erpnext_contact_list` | Contact | List + filters (company, status) | doclist-viewer |
| `erpnext_contact_get` | Contact | Get by name | - |
| `erpnext_campaign_list` | Campaign | List + filters (campaign_type) | doclist-viewer |

### Assets (8 tools)

| Tool | DocType | Operations | UI Viewer |
|------|---------|-----------|-----------|
| `erpnext_asset_list` | Asset | List + filters (status, category, location, custodian) | doclist-viewer |
| `erpnext_asset_get` | Asset | Get by name (with depreciation + maintenance) | - |
| `erpnext_asset_create` | Asset | Create (name, category, company, purchase_date, cost) | - |
| `erpnext_asset_movement_list` | Asset Movement | List + filters (purpose, dates) | doclist-viewer |
| `erpnext_asset_movement_get` | Asset Movement | Get by name (with assets moved) | - |
| `erpnext_asset_maintenance_list` | Asset Maintenance | List + filters (asset_name, maintenance_status) | doclist-viewer |
| `erpnext_asset_maintenance_get` | Asset Maintenance | Get by name (with maintenance tasks) | - |
| `erpnext_asset_category_list` | Asset Category | List all asset categories | doclist-viewer |

---

## Available Operations (Generic)

The `operations.ts` tools provide generic CRUD for any ERPNext DocType:

| Operation | Tool | Notes |
|-----------|------|-------|
| **Update** | `erpnext_doc_update` | Partial patch — pass only fields to change |
| **Delete** | `erpnext_doc_delete` | Draft documents only; submitted must be cancelled first |
| **Submit** | `erpnext_doc_submit` | Calls `frappe.client.submit` |
| **Cancel** | `erpnext_doc_cancel` | Calls `frappe.client.cancel` |
| **Get** | `erpnext_doc_get` | For DocTypes without a dedicated `_get` tool |
| **List** | `erpnext_doc_list` | Full control: fields, filters, limit, order_by |

Specific DocTypes also have dedicated submit/cancel tools: `erpnext_sales_order_submit/cancel`, `erpnext_sales_invoice_submit`.

> **Note**: All submit handlers fetch the doc first (`GET`) to pass `modified` for optimistic locking. See `docs/known-issues.md` for details.

---

## UI Viewers (3 active)

| Viewer | URI | Usage |
|--------|-----|-------|
| `doclist-viewer` | `ui://mcp-erpnext/doclist-viewer` | Generic table with sort, filter, pagination, CSV export |
| `invoice-viewer` | `ui://mcp-erpnext/invoice-viewer` | Single invoice display (header, items, totals, payment status) |
| `stock-viewer` | `ui://mcp-erpnext/stock-viewer` | Stock balance table with color-coded qty badges |

> `dashboard-viewer` was removed — not wired to any tool. Use `erpnext_doc_list` + a future aggregate tool instead.

---

## NOT Covered

### Missing Operations / DocTypes

**Sales**
- Sales Partner, Sales Person
- Email Campaign

**Purchase**
- Purchase Invoice create (only list/get)
- Supplier Quotation get/create (only list exists)
- Material Request

**Inventory**
- Stock Reconciliation
- Item Price, Pricing Rule
- Batch, Serial No
- Quality Inspection
- Item Variant

**Accounting**
- General Ledger report (`frappe.client.get_report_result`)
- Trial Balance, Balance Sheet, Profit & Loss reports
- Payment Entry create
- Bank Reconciliation
- Cost Center, Budget
- Tax Templates

**HR / Payroll**
- Salary Structure, Salary Component
- Shift Assignment, Shift Type
- Training Event, Training Result

**Manufacturing**
- BOM create (only list/get)
- Job Card create/update (only list/get)
- Workstation, Operation (only accessible via `erpnext_doc_list`)

**Project**
- Timesheet create (only list/get)
- Activity Type

**Website / E-Commerce**
- Website Item, Shopping Cart
- Blog Post, Web Page

### Missing Features

- **Search / Full-text**: No `or_filters` or `like` operator exposed
- **Linked document chains**: No tool to follow Sales Order → Delivery Note → Sales Invoice automatically
- **Print format**: No tool to get printable HTML/PDF
- **File attachments**: No upload/download support
- **Custom fields**: Work via Frappe REST but not documented/tested
- **Amend**: Frappe amend workflow not implemented
- **Get Report**: `callMethod()` exists but no report-specific tool

---

## Design Decisions

1. **Purchase tools in `purchasing` category** — PO/PI tools live in `purchasing.ts` alongside suppliers, receipts, and quotations. `accounting.ts` focuses on accounts, journal entries, and payment entries.

2. **`erpnext_doc_*` as escape hatch** — The 6 generic operations tools cover any DocType not yet wrapped. They are the recommended approach for one-off operations rather than adding more typed tools.

3. **`_get` tools have no `_meta.ui`** — Only `sales_invoice_get` uses `invoice-viewer`. Other `_get` tools return raw JSON. Typed viewers for individual documents (customer detail, asset detail, etc.) remain a future improvement.

4. **Expense Claim child table pattern** — `erpnext_expense_claim_create` demonstrates the pattern for child tables via `expenses[]` array, reusable for BOM items, timesheet logs, etc.

5. **Leave balance via Leave Allocation** — `erpnext_leave_balance` reads `Leave Allocation` (docstatus=1) directly, which is simpler than calling the `get_leave_balance_on` method but may not reflect leave taken within the allocation period.

---

## Production Hardening (TODO avant usage réel)

> Voir aussi `docs/known-issues.md` pour les bugs connus et fixes appliqués.

La lib fonctionne pour du prototypage/dev. Avant de brancher sur un vrai ERPNext :

| Priorité | Quoi | Pourquoi | Effort |
|----------|------|----------|--------|
| **P0** | Créer un user ERPNext dédié avec rôles restreints | Un seul API key/secret = un seul contexte user. Si c'est admin, le LLM peut tout lire/modifier/supprimer | Config ERPNext |
| **P0** | Env var `ERPNEXT_COMPANY` injectée dans tous les creates | ERPNext est multi-company. Sans ça, les creates utilisent la company par défaut du user API — implicite et non contrôlé | ~1h |
| **P1** | Flag `ERPNEXT_READONLY=true` qui désactive les tools d'écriture | Empêche les create/update/delete/submit/cancel quand on veut juste de la lecture | ~30min |
| **P1** | `_meta.requiresApproval: true` sur les tools destructifs | Le host MCP peut demander confirmation avant delete/submit/cancel | ~2h |
| **P2** | Header `X-MCP-Agent` pour tracer la source des modifications | ERPNext logge tout sous le user API — impossible de distinguer humain vs IA | Dépend de Frappe |

### Risques connus

- **Pas de multi-utilisateur** — Tous les clients MCP partagent le même user ERPNext
- **`erpnext_doc_delete` / `erpnext_doc_update` sans garde-fou** — Seules les permissions ERPNext du user API protègent
- **Pas de scoping Company** — Certains tools ont un filtre `company`, la plupart non
- **Pas de traçabilité MCP** — Les modifications sont attribuées au user API, pas à l'agent qui les a faites
