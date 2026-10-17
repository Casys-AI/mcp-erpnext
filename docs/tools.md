# Tools Reference

Full reference for all ERPNext MCP tools. See [README](../README.md) for
overview.

## Categories and tool filtering

The 15 category names accepted by `--categories`, `--exclude-categories` (and
`ERPNEXT_CATEGORIES`, `ERPNEXT_EXCLUDE_CATEGORIES`) are: `sales`, `inventory`,
`accounting`, `hr`, `project`, `purchasing`, `delivery`, `manufacturing`, `crm`,
`assets`, `operations`, `setup`, `analytics`, `kanban`, `buy`. Sections below
map to them (Generic Operations is `operations`, Buy is `buy`, Setup holds the
user and company tools). Any tool name in the tables can be passed to
`--exclude-tools` / `ERPNEXT_EXCLUDE_TOOLS`, for example `erpnext_buy_capture`
(category `buy`) or the attachment tools `erpnext_file_list`,
`erpnext_file_upload` and `erpnext_file_download` (category `operations`). Full
rules: [environment variables](environment-variables.md#tool-selection).

## Setup

| Tool                     | DocType | Operations                                     |
| ------------------------ | ------- | ---------------------------------------------- |
| `erpnext_user_list`      | User    | List assignable users (enabled System Users)   |
| `erpnext_company_list`   | Company | List companies                                 |
| `erpnext_company_create` | Company | Create (name, abbr, currency, country, domain) |

## Sales → doclist-viewer / doc-viewer / invoice-viewer

| Tool                           | DocType       | Operations                                   |
| ------------------------------ | ------------- | -------------------------------------------- |
| `erpnext_customer_list`        | Customer      | List + filters (group, territory, disabled)  |
| `erpnext_customer_get`         | Customer      | Get by name                                  |
| `erpnext_customer_create`      | Customer      | Create (name, group, territory, email, type) |
| `erpnext_customer_update`      | Customer      | Update fields                                |
| `erpnext_sales_order_list`     | Sales Order   | List + filters (customer, status, dates)     |
| `erpnext_sales_order_get`      | Sales Order   | Get with line items                          |
| `erpnext_sales_order_create`   | Sales Order   | Create (customer + items + delivery_date)    |
| `erpnext_sales_order_update`   | Sales Order   | Update (delivery_date, items)                |
| `erpnext_sales_order_submit`   | Sales Order   | Submit (Draft → To Deliver and Bill)         |
| `erpnext_sales_order_cancel`   | Sales Order   | Cancel                                       |
| `erpnext_sales_invoice_list`   | Sales Invoice | List + filters                               |
| `erpnext_sales_invoice_get`    | Sales Invoice | Get with line items                          |
| `erpnext_sales_invoice_create` | Sales Invoice | Create (customer + items + dates)            |
| `erpnext_sales_invoice_submit` | Sales Invoice | Submit (Draft → Unpaid)                      |
| `erpnext_quotation_list`       | Quotation     | List + filters (party, status)               |
| `erpnext_quotation_get`        | Quotation     | Get with line items                          |
| `erpnext_quotation_create`     | Quotation     | Create (Customer/Lead + items)               |

## Inventory → doclist-viewer / doc-viewer / stock-viewer

| Tool                         | DocType     | Operations                                   |
| ---------------------------- | ----------- | -------------------------------------------- |
| `erpnext_item_list`          | Item        | List + filters (group, stock flag, disabled) |
| `erpnext_item_get`           | Item        | Get by name/code                             |
| `erpnext_item_create`        | Item        | Create (code, name, group, uom, rate)        |
| `erpnext_item_update`        | Item        | Update fields                                |
| `erpnext_stock_balance`      | Bin         | Stock balances by item/warehouse             |
| `erpnext_warehouse_list`     | Warehouse   | List + filters (company, type)               |
| `erpnext_stock_entry_list`   | Stock Entry | List + filters (item, type, dates)           |
| `erpnext_stock_entry_get`    | Stock Entry | Get with item details                        |
| `erpnext_stock_entry_create` | Stock Entry | Create (type + items + warehouses)           |

### `erpnext_stock_entry_list`

Optional `item_code` keeps the Stock Entries that have a line with exactly that
item. It filters on the `Stock Entry Detail` child table, so it follows the
[child-table filter rules](#erpnext_doc_list) of `erpnext_doc_list`: the order
is `` `tabStock Entry`.modified desc `` and the result is grouped by Stock
Entry, so an entry holding the item on several lines is listed once and counts
once against `limit`. (3.0.x accepted `item_code` but ignored it.) Without
`item_code` the query is unchanged.

## Purchasing → doclist-viewer / doc-viewer

| Tool                              | DocType            | Operations                                    |
| --------------------------------- | ------------------ | --------------------------------------------- |
| `erpnext_supplier_list`           | Supplier           | List + filters (group, type, disabled)        |
| `erpnext_supplier_get`            | Supplier           | Get by name                                   |
| `erpnext_supplier_create`         | Supplier           | Create (name, group, type, country, currency) |
| `erpnext_purchase_order_list`     | Purchase Order     | List + filters (supplier, status, dates)      |
| `erpnext_purchase_order_get`      | Purchase Order     | Get with line items                           |
| `erpnext_purchase_order_create`   | Purchase Order     | Create (supplier + items + schedule_date)     |
| `erpnext_purchase_invoice_list`   | Purchase Invoice   | List + filters                                |
| `erpnext_purchase_invoice_get`    | Purchase Invoice   | Get with line items                           |
| `erpnext_purchase_receipt_list`   | Purchase Receipt   | List + filters                                |
| `erpnext_purchase_receipt_get`    | Purchase Receipt   | Get with received items                       |
| `erpnext_supplier_quotation_list` | Supplier Quotation | List + filters                                |

## Accounting → doclist-viewer / doc-viewer

| Tool                           | DocType       | Operations                                        |
| ------------------------------ | ------------- | ------------------------------------------------- |
| `erpnext_account_list`         | Account       | Chart of accounts + filters (root_type, is_group) |
| `erpnext_journal_entry_list`   | Journal Entry | List + filters (voucher_type, dates)              |
| `erpnext_journal_entry_get`    | Journal Entry | Get with accounts                                 |
| `erpnext_journal_entry_create` | Journal Entry | Create (voucher_type + balanced accounts)         |
| `erpnext_payment_entry_list`   | Payment Entry | List + filters (type, party, dates)               |
| `erpnext_payment_entry_get`    | Payment Entry | Get with references                               |

### `erpnext_payment_entry_list`

`paid_amount` is expressed in `paid_from_account_currency`; the legacy
`currency` field is an alias of that currency. The result also exposes
`received_amount` and `paid_to_account_currency` so both sides of a payment
remain explicit. For `Receive`, the party is on the source side; for `Pay`, the
party is on the destination side. Do not combine the amounts without checking
their currencies.

## HR → doclist-viewer / doc-viewer

| Tool                               | DocType           | Operations                                   |
| ---------------------------------- | ----------------- | -------------------------------------------- |
| `erpnext_employee_list`            | Employee          | List + filters (department, status, company) |
| `erpnext_employee_get`             | Employee          | Get by ID                                    |
| `erpnext_attendance_list`          | Attendance        | List + filters (employee, status, dates)     |
| `erpnext_leave_application_list`   | Leave Application | List + filters                               |
| `erpnext_leave_application_get`    | Leave Application | Get by name                                  |
| `erpnext_leave_application_create` | Leave Application | Create (employee, type, dates, reason)       |
| `erpnext_salary_slip_list`         | Salary Slip       | List + filters (employee, status, dates)     |
| `erpnext_salary_slip_get`          | Salary Slip       | Get with earnings/deductions                 |
| `erpnext_payroll_entry_list`       | Payroll Entry     | List + filters (company, status)             |
| `erpnext_expense_claim_list`       | Expense Claim     | List + filters                               |
| `erpnext_expense_claim_create`     | Expense Claim     | Create (employee + expenses[])               |
| `erpnext_leave_balance`            | Leave Allocation  | Get allocations by employee                  |

## Project → doclist-viewer / doc-viewer

| Tool                     | DocType   | Operations                                           |
| ------------------------ | --------- | ---------------------------------------------------- |
| `erpnext_project_list`   | Project   | List + filters (status, company)                     |
| `erpnext_project_get`    | Project   | Get by name                                          |
| `erpnext_project_create` | Project   | Create (name, status, dates, budget, company)        |
| `erpnext_task_list`      | Task      | List + filters (project, status, priority)           |
| `erpnext_task_get`       | Task      | Get with dependencies                                |
| `erpnext_task_create`    | Task      | Create + native assignment (assignees, ToDo details) |
| `erpnext_task_update`    | Task      | Update + native assignment (assignees, ToDo details) |
| `erpnext_timesheet_list` | Timesheet | List + filters (employee, project, status)           |
| `erpnext_timesheet_get`  | Timesheet | Get with time log details                            |

## Delivery → doclist-viewer / doc-viewer

| Tool                           | DocType       | Operations                                      |
| ------------------------------ | ------------- | ----------------------------------------------- |
| `erpnext_delivery_note_list`   | Delivery Note | List + filters (customer, status, dates)        |
| `erpnext_delivery_note_get`    | Delivery Note | Get with delivered items                        |
| `erpnext_delivery_note_create` | Delivery Note | Create (customer + items + against_sales_order) |
| `erpnext_shipment_list`        | Shipment      | List + filters (status, carrier, dates)         |
| `erpnext_shipment_get`         | Shipment      | Get with parcels                                |

### `erpnext_shipment_list`

`date_from` and `date_to` bound `pickup_date`. Shipment has no standard
`delivery_date` column, so the list does not request or manufacture one. Use the
native `status` values, including `Completed`, rather than a delivery status
from a different DocType.

## Manufacturing → doclist-viewer / doc-viewer

| Tool                        | DocType    | Operations                                      |
| --------------------------- | ---------- | ----------------------------------------------- |
| `erpnext_bom_list`          | BOM        | List + filters (item, is_active, is_default)    |
| `erpnext_bom_get`           | BOM        | Get with raw materials + operations             |
| `erpnext_work_order_list`   | Work Order | List + filters (production_item, status, dates) |
| `erpnext_work_order_get`    | Work Order | Get with operations + materials                 |
| `erpnext_work_order_create` | Work Order | Create (production_item, bom_no, qty, dates)    |
| `erpnext_job_card_list`     | Job Card   | List + filters (work_order, status, operation)  |
| `erpnext_job_card_get`      | Job Card   | Get with time logs + material transfers         |

## CRM → doclist-viewer / doc-viewer

| Tool                       | DocType     | Operations                                   |
| -------------------------- | ----------- | -------------------------------------------- |
| `erpnext_lead_list`        | Lead        | List + filters (status, lead_owner, source)  |
| `erpnext_lead_get`         | Lead        | Get by name                                  |
| `erpnext_lead_create`      | Lead        | Create (name, company, email, phone, source) |
| `erpnext_opportunity_list` | Opportunity | List + filters (status, owner, party)        |
| `erpnext_opportunity_get`  | Opportunity | Get with items + competitors                 |
| `erpnext_contact_list`     | Contact     | List + filters (company, status)             |
| `erpnext_contact_get`      | Contact     | Get by name                                  |
| `erpnext_campaign_list`    | Campaign    | List + filters (campaign_type)               |

## Assets → doclist-viewer / doc-viewer

| Tool                             | DocType           | Operations                                            |
| -------------------------------- | ----------------- | ----------------------------------------------------- |
| `erpnext_asset_list`             | Asset             | List + filters (status, category, location)           |
| `erpnext_asset_get`              | Asset             | Get with depreciation + maintenance                   |
| `erpnext_asset_create`           | Asset             | Create (name, category, company, purchase_date, cost) |
| `erpnext_asset_movement_list`    | Asset Movement    | List + filters (purpose, dates)                       |
| `erpnext_asset_movement_get`     | Asset Movement    | Get with assets moved                                 |
| `erpnext_asset_maintenance_list` | Asset Maintenance | List + filters                                        |
| `erpnext_asset_maintenance_get`  | Asset Maintenance | Get with maintenance tasks                            |
| `erpnext_asset_category_list`    | Asset Category    | List all categories                                   |

### `erpnext_asset_list`

The list exposes `net_purchase_amount` and `value_after_depreciation`, with
legacy aliases `gross_purchase_amount` and `current_value`. The older
`gross_purchase_amount` field on ERPNext v15 is labelled **Net Purchase
Amount**; its v16 replacement is `net_purchase_amount`. `current_value`
represents the book value after depreciation, not a market valuation. The
handler reads the version's available columns and returns only the fixed list
projection.

### `erpnext_asset_create`

The public `gross_purchase_amount` parameter supplies Net Purchase Amount before
depreciation. The handler writes the versioned v15/v16 field names, and Frappe
persists the name declared by its Asset DocType. Supply a fixed asset
`item_code` and `location` as required by ERPNext; the tool does not create
those prerequisites.

## Generic Operations → doc-viewer / doclist-viewer

| Tool                    | Operation | Notes                                                                    |
| ----------------------- | --------- | ------------------------------------------------------------------------ |
| `erpnext_doc_create`    | Create    | Any DocType — essential for master data setup                            |
| `erpnext_doc_get`       | Get       | Any document by DocType + name                                           |
| `erpnext_doc_list`      | List      | Any DocType with fields, filters, limit, order_by                        |
| `erpnext_doc_update`    | Update    | Partial patch — pass only fields to change                               |
| `erpnext_doc_delete`    | Delete    | Draft documents only                                                     |
| `erpnext_doc_submit`    | Submit    | Any submittable document                                                 |
| `erpnext_doc_cancel`    | Cancel    | Any submitted document                                                   |
| `erpnext_doc_assign`    | Assign    | Native assignment (ToDo + notification) to users                         |
| `erpnext_doc_unassign`  | Unassign  | Remove one user's native assignment                                      |
| `erpnext_file_list`     | List      | Read attachments and native File metadata                                |
| `erpnext_file_upload`   | Upload    | Attach base64 data as a native File                                      |
| `erpnext_file_download` | Download  | Hidden, MCP Apps clients only, authenticated and bounded download        |
| `erpnext_method_call`   | Call      | Escape hatch for whitelisted Frappe methods (deny-by-default, see below) |

`erpnext_file_list` requires `attached_to_doctype` and `attached_to_name`. Its
optional `limit` is an integer from 1 to 500 and defaults to 50.

Purchase Invoice rounding is configured in ERPNext. The existing generic tools
can set `data.disable_rounded_total: 1` on a draft to disable final rounding, or
update the Currency configuration with appropriate permissions. No extra tool
parameters are required. The invoice viewer explains any applied rounding next
to its invoice total; opening the explanation does not write to ERPNext. See
[Purchase Invoice setup and rounding](./fresh-instance-setup.md#purchase-invoices).

`erpnext_method_call` calls `/api/method/{method}` directly for behaviour that
is not a plain document write — custom-app `@frappe.whitelist` methods,
`validate` hooks that reject a direct field update, or GET-only endpoints. It
takes `method` (dotted path), optional `args`, optional `http_method`
(`GET`/`POST`, default `POST`), and optional `invalidate: { doctype, name }` to
drop a document from the read cache after a mutating call. The method must match
an entry in `ERPNEXT_METHOD_ALLOWLIST` — an exact path or a `prefix.*` wildcard
— or the call is rejected before it reaches ERPNext; the variable is unset by
default, so no method is callable until configured. See
[environment-variables.md](./environment-variables.md).

`erpnext_file_upload` requires `file_name`, `content_base64`,
`attached_to_doctype`, and `attached_to_name`; `attached_to_field` is optional.
Files are private by default (`is_private: false` makes them public), accept no
local path or URL, are capped at 10 MiB decoded by default (override with
positive-integer-byte `ERPNEXT_MAX_UPLOAD_BYTES`), require write permission on
the DocType, and return native `File` metadata.

`erpnext_file_download` is hidden from model tool lists (`visibility: ["app"]`)
and is reserved for MCP Apps hosts. It accepts the native `File.name` plus the
expected parent DocType and document name, re-fetches that File row without
cache, verifies its exact attachment and private/public path, and downloads it
through Frappe's authenticated handler. It never follows redirects or accepts an
arbitrary URL. The response contains one inline MCP resource for the host's
`downloadFile` channel. Downloads are capped at 10 MiB by default; override the
positive byte limit with `ERPNEXT_MAX_DOWNLOAD_BYTES`.

Attachment content is intended for the host preview/download channel. The server
guarantees the following:

- `visibility: ["app"]` only removes the tool from `tools/list`. MCP
  `tools/call` carries no marker telling an App from a model, so the tool is not
  "callable only by an App" at the protocol level.
- The server therefore refuses the call **before any Frappe request** unless the
  MCP client announced the MCP Apps extension at initialize: extension
  `io.modelcontextprotocol/ui` with `mimeTypes` containing
  `text/html;profile=mcp-app`. This applies to stdio and to HTTP stateless (the
  capability is read from each request's client capabilities). Identifier
  validation still runs first.
- A refused call returns an error result (no resource, no base64, no file
  metadata) rendered as
  `[erpnext_file_download] APP_CONTEXT_REQUIRED: <message>. Recovery: <recovery>`.
  The recovery points to an MCP Apps viewer for the download and to
  `erpnext_file_list` for attachment metadata (name, size, `file_url`).
- `ErpNextToolsClient.execute("erpnext_file_download", ...)` (library use) has
  no client capabilities and is always refused with a `FileDownloadError` whose
  `code` is `APP_CONTEXT_REQUIRED`.
- A host that does not announce the extension but renders Apps cannot use
  downloads or previews; this is deliberate (fail closed).

Residual risk: the gate is a capability check, not proof of origin. A host that
announces MCP Apps **and** lets the model call a tool hidden from `tools/list`
would still receive the base64 blob in the tool result. The name of the tool
also appears in `_availableTools` of viewer results. Avoid hosts that forward
hidden tools to the model when attachment content is sensitive.

### `erpnext_doc_list`

Lists any DocType through Frappe's `get_list`. Arguments:

| Argument     | Type              | Default               | Notes                                                       |
| ------------ | ----------------- | --------------------- | ----------------------------------------------------------- |
| `doctype`    | string (required) |                       | DocType name, e.g. `Lead`.                                  |
| `fields`     | array of strings  | `["name","modified"]` | `["*"]` for every column.                                   |
| `filters`    | array of tuples   | none                  | See below.                                                  |
| `limit`      | integer, `>= 0`   | `20`                  | No server-side cap. `0` = every row (Frappe semantics).     |
| `offset`     | integer, `>= 0`   | none                  | Rows to skip; use with a positive `limit`.                  |
| `skip_cache` | boolean           | `false`               | Bypass the short-lived list cache for a fresh ERPNext read. |
| `order_by`   | string            | `modified desc`       | SQL order clause; see the child-table note below.           |

**Filters.** Each entry is `[fieldname, operator, value]` or, to filter on a
child table, `[child doctype, fieldname, operator, value]` (for example
`["Sales Invoice Item", "item_code", "=", "SKU-1"]`). A value is a string, a
number, a boolean or `null`; `in` / `not in` take an array of strings or
numbers. The advertised schema is deliberately loose (an array of arrays of
those values) because a tuple-precise schema (`prefixItems`, `oneOf`) makes some
hosts, VS Code Copilot among them, refuse the whole tool list. The handler
enforces the shape. It follows Frappe: 3 and 4 elements are accepted, and so are
longer 3.0.x string tuples (Frappe keeps the first 4 elements; recent versions
may refuse 6 or more, in which case Frappe's own error is returned). Fewer than
3 elements, a non-array entry or a wrongly typed position fail with
`INVALID_FILTER` before any request is made.

**Pagination.** `limit` and `offset` are passed to Frappe unchanged, without a
ceiling. `limit: 0` returns every row and can be very large, so prefer `limit`
plus `offset`. `limit: 0` together with `offset > 0` is refused with
`INVALID_PAGINATION`: Frappe v14 and v15 ignore the offset when the limit is 0
and would silently return the first rows again. v16 does respect the offset, but
the refusal stays uniform so the behaviour is identical on every version.
`limit: 0` is meant for agent calls, not for viewers: viewers replay their
arguments on every refresh (every 15 s), so a UI caller must keep a positive
`limit`. A non-integer or negative value (for example `limit: 20.5`) is rejected
by the input schema before the handler runs, so hosts show their
schema-validation message instead of an `INVALID_PAGINATION` error.

**Child-table filters.** A filter on a child table makes Frappe join it, which
has two side effects the tool absorbs:

- A bare `modified desc` (the default order) is ambiguous on Frappe v14/v15
  (MariaDB error 1052, HTTP 500). The tool sends
  `` `tab<Doctype>`.modified desc `` instead, and qualifies a simple `order_by`
  (`name asc`, `modified desc, name`) the same way. An order that is already
  qualified or contains a function call is sent as written. Without a
  child-table filter, `order_by` is sent exactly as before.
- A document with several matching child rows would come back once per row, each
  copy counting against `limit`. The tool adds `group_by=`
  `` `tab<Doctype>`.name `` so each document appears once. It skips this when
  `fields` names a child column or an expression, or when `order_by` targets
  one: the caller then wants the joined rows.

**Errors.** Input errors read
`[erpnext_doc_list] <CODE>: <message>. Recovery: <recovery>`. Codes:
`INVALID_INPUT` (missing `doctype`, wrong type for `fields` or `skip_cache`),
`INVALID_FILTER`, `INVALID_PAGINATION`. The shared helper is `ToolInputError` in
`src/tools/errors.ts`; the message is parseable with `parseToolInputError`.

## Buy → buy-evidence-viewer

| Tool                  | DocType                                                                                 | Operations                                         |
| --------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `erpnext_buy_capture` | Item, BOM, Item Price, Supplier Quotation, Supplier, Price List, UOM, Currency Exchange | Read-only bounded capture of exact named documents |

`erpnext_buy_capture` is a closed, read-only capture. It is not a purchase
capability: it does not create a BOM, RFQ, or purchase order, does not store
CAS, and does not compute a commercial total or qualify a live ERP.

Pass only exact `{doctype, name}` references (optional `expectedModified`). The
caller cannot supply `sourceInstance`, URL, credentials, `capturedAt`, or a
digest. Two `skipCache` reads must agree on `modified` and the closed projection
fingerprint. The return is ephemeral canonical JSON, SHA-256, and byte count.

The recorded App `io.casys.mcp-erpnext.buy-evidence` applies a viewer session
only (`viewer.session.apply`). Complete, partial, unresolved, and unavailable
projections stay labelled. Recorded result `/2.0` additionally displays bounded
unpriced/excluded configuration-line metadata without inventing a price or
recalculating a total. See
[README — Buy evidence capture](../README.md#buy-evidence-capture).

## Kanban → kanban-viewer

| Tool                       | Description                                                         |
| -------------------------- | ------------------------------------------------------------------- |
| `erpnext_kanban_get_board` | Get a normalized kanban board for `Task`, `Opportunity`, or `Issue` |
| `erpnext_kanban_move_card` | Execute a validated card move with business error handling          |

## Analytics → chart-viewer / kpi-viewer / funnel-viewer

| Tool                        | Viewer | Description                                           |
| --------------------------- | ------ | ----------------------------------------------------- |
| `erpnext_stock_chart`       | chart  | Bar chart of stock levels by item/warehouse           |
| `erpnext_sales_chart`       | chart  | Revenue by customer, item, or status (bar/donut)      |
| `erpnext_revenue_trend`     | chart  | Monthly revenue trend (line/area, per customer)       |
| `erpnext_order_breakdown`   | chart  | Orders by customer/status (stacked-bar/pie/donut)     |
| `erpnext_revenue_vs_orders` | chart  | Revenue bars + order count line (dual axis)           |
| `erpnext_stock_treemap`     | chart  | Stock value treemap by item or warehouse              |
| `erpnext_product_radar`     | chart  | Radar comparing items (stock, value, orders, revenue) |
| `erpnext_price_vs_qty`      | chart  | Scatter: selling price vs quantity ordered            |
| `erpnext_ar_aging`          | chart  | AR aging buckets (0-30, 31-60, 61-90, 90+ days)       |
| `erpnext_gross_profit`      | chart  | Revenue bars + margin % line by item/customer         |
| `erpnext_profit_loss`       | chart  | P&L: income vs expenses per month + net profit        |
| `erpnext_kpi_revenue`       | kpi    | Revenue MTD with delta vs previous month + sparkline  |
| `erpnext_kpi_outstanding`   | kpi    | Outstanding receivables (count + total)               |
| `erpnext_kpi_orders`        | kpi    | Orders this month with delta vs last month            |
| `erpnext_kpi_gross_margin`  | kpi    | Gross margin % based on valuation rates               |
| `erpnext_kpi_overdue`       | kpi    | Overdue invoices count + value                        |
| `erpnext_sales_funnel`      | funnel | Lead → Opportunity → Quotation → Order funnel         |

The revenue, outstanding, overdue, and order-count KPIs accept optional
`company` and `currency` filters and use complete fresh reads. Revenue and
orders filter the Sales Order document currency; outstanding and overdue filter
the Sales Invoice party account currency. The three monetary KPIs refuse mixed
or missing currencies and perform no conversion. Their document-list links
retain the selected scope. Monthly KPIs count dates through today in the local
calendar. Delta values are percentage points: `2.8` displays as `2.8%`.

Other monetary analytics retain legacy currency assumptions and record limits;
the three corrected financial KPIs do not link to those charts.
