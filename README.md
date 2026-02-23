# @casys/mcp-erpnext

MCP server for [ERPNext](https://erpnext.com) / Frappe ERP — **119 tools** across **13 categories**, with **7 interactive UI viewers**.

Connect any MCP-compatible AI agent (Claude Desktop, PML, custom) to your ERPNext instance via the standard [Model Context Protocol](https://modelcontextprotocol.io).

## Quick Start

### Prerequisites

Generate API credentials in ERPNext:
1. Login to ERPNext → top-right menu → **My Settings**
2. Section **API Access** → **Generate Keys**
3. Copy `API Key` and `API Secret`

### stdio mode (Claude Desktop / PML)

Add to your MCP config (e.g. `.pml.json` or `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "erpnext": {
      "command": "deno",
      "args": ["run", "--allow-all", "server.ts"],
      "env": {
        "ERPNEXT_URL": "http://localhost:8000",
        "ERPNEXT_API_KEY": "your-api-key",
        "ERPNEXT_API_SECRET": "your-api-secret"
      }
    }
  }
}
```

### HTTP mode

```bash
ERPNEXT_URL=http://localhost:8000 \
ERPNEXT_API_KEY=xxx \
ERPNEXT_API_SECRET=xxx \
deno run --allow-all server.ts --http --port=3012
```

### Category filtering

Load only the categories you need:

```bash
deno run --allow-all server.ts --categories=sales,inventory
```

## Fresh Instance Setup

On a fresh ERPNext instance (no setup wizard), you need to create master data before using business tools. Use `erpnext_doc_create` for prerequisites:

```
1. Warehouse Types: Transit, Default
2. UOMs: Nos, Kg, Unit, Set, Meter
3. Item Groups: All Item Groups (is_group=1), then Products, Raw Material (parent=All Item Groups)
4. Territories: All Territories (is_group=1), then France, etc.
5. Customer Groups: All Customer Groups (is_group=1), then Commercial, etc.
6. Supplier Groups: All Supplier Groups (is_group=1), then Hardware, etc.
7. Company: requires Warehouse Types to exist first
```

## Tools (119)

### Setup (2)

| Tool | DocType | Operations |
|------|---------|-----------|
| `erpnext_company_list` | Company | List companies |
| `erpnext_company_create` | Company | Create (name, abbr, currency, country, domain) |

### Sales (17)

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

### Inventory (9)

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

### Purchasing (11)

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

### Accounting (6)

| Tool | DocType | Operations |
|------|---------|-----------|
| `erpnext_account_list` | Account | Chart of accounts + filters (root_type, is_group) |
| `erpnext_journal_entry_list` | Journal Entry | List + filters (voucher_type, dates) |
| `erpnext_journal_entry_get` | Journal Entry | Get with accounts |
| `erpnext_journal_entry_create` | Journal Entry | Create (voucher_type + balanced accounts) |
| `erpnext_payment_entry_list` | Payment Entry | List + filters (type, party, dates) |
| `erpnext_payment_entry_get` | Payment Entry | Get with references |

### HR (12)

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

### Project (9)

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

### Delivery (5)

| Tool | DocType | Operations |
|------|---------|-----------|
| `erpnext_delivery_note_list` | Delivery Note | List + filters (customer, status, dates) |
| `erpnext_delivery_note_get` | Delivery Note | Get with delivered items |
| `erpnext_delivery_note_create` | Delivery Note | Create (customer + items + against_sales_order) |
| `erpnext_shipment_list` | Shipment | List + filters (status, carrier, dates) |
| `erpnext_shipment_get` | Shipment | Get with parcels |

### Manufacturing (7)

| Tool | DocType | Operations |
|------|---------|-----------|
| `erpnext_bom_list` | BOM | List + filters (item, is_active, is_default) |
| `erpnext_bom_get` | BOM | Get with raw materials + operations |
| `erpnext_work_order_list` | Work Order | List + filters (production_item, status, dates) |
| `erpnext_work_order_get` | Work Order | Get with operations + materials |
| `erpnext_work_order_create` | Work Order | Create (production_item, bom_no, qty, dates) |
| `erpnext_job_card_list` | Job Card | List + filters (work_order, status, operation) |
| `erpnext_job_card_get` | Job Card | Get with time logs + material transfers |

### CRM (8)

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

### Assets (8)

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

### Generic Operations (7)

These tools work with **any** ERPNext DocType:

| Tool | Operation | Notes |
|------|-----------|-------|
| `erpnext_doc_create` | Create | Any DocType — essential for master data setup |
| `erpnext_doc_get` | Get | Any document by DocType + name |
| `erpnext_doc_list` | List | Any DocType with fields, filters, limit, order_by |
| `erpnext_doc_update` | Update | Partial patch — pass only fields to change |
| `erpnext_doc_delete` | Delete | Draft documents only |
| `erpnext_doc_submit` | Submit | Any submittable document |
| `erpnext_doc_cancel` | Cancel | Any submitted document |

### Analytics (19)

Tools that return shaped data for chart, pipeline, KPI, and funnel viewers.

| Tool | Viewer | Description |
|------|--------|-------------|
| `erpnext_order_pipeline` | order-pipeline-viewer | Sales orders kanban by status |
| `erpnext_purchase_pipeline` | order-pipeline-viewer | Purchase orders kanban by status |
| `erpnext_stock_chart` | chart-viewer | Bar chart of stock levels by item/warehouse |
| `erpnext_sales_chart` | chart-viewer | Revenue by customer, item, or status (bar/donut) |
| `erpnext_revenue_trend` | chart-viewer | Monthly revenue trend (line/area, per customer) |
| `erpnext_order_breakdown` | chart-viewer | Orders by customer/status (stacked-bar/pie/donut) |
| `erpnext_revenue_vs_orders` | chart-viewer | Revenue bars + order count line (dual axis) |
| `erpnext_stock_treemap` | chart-viewer | Stock value treemap by item or warehouse |
| `erpnext_product_radar` | chart-viewer | Radar comparing items (stock, value, orders, revenue) |
| `erpnext_price_vs_qty` | chart-viewer | Scatter: selling price vs quantity ordered |
| `erpnext_ar_aging` | chart-viewer | AR aging buckets (0-30, 31-60, 61-90, 90+ days) |
| `erpnext_gross_profit` | chart-viewer | Revenue bars + margin % line by item/customer |
| `erpnext_profit_loss` | chart-viewer | P&L: income vs expenses per month + net profit |
| `erpnext_kpi_revenue` | kpi-viewer | Revenue MTD with delta vs previous month + sparkline |
| `erpnext_kpi_outstanding` | kpi-viewer | Outstanding receivables (count + total) |
| `erpnext_kpi_orders` | kpi-viewer | Orders this month with delta vs last month |
| `erpnext_kpi_gross_margin` | kpi-viewer | Gross margin % based on valuation rates |
| `erpnext_kpi_overdue` | kpi-viewer | Overdue invoices count + value |
| `erpnext_sales_funnel` | funnel-viewer | Lead → Opportunity → Quotation → Order funnel |

## UI Viewers

Seven interactive [MCP Apps](https://github.com/anthropics/mcp-apps-sdk) viewers, registered as `ui://mcp-erpnext/{name}`:

| Viewer | Description |
|--------|-------------|
| `doclist-viewer` | Generic document table with sort, filter, pagination, CSV export |
| `invoice-viewer` | Single invoice display (header, items, totals, payment status) |
| `stock-viewer` | Stock balance table with color-coded qty badges |
| `chart-viewer` | Universal chart renderer (12 chart types via Recharts) |
| `order-pipeline-viewer` | Sales/Purchase Order kanban by status |
| `kpi-viewer` | Single metric card with delta, sparkline, trend indicator |
| `funnel-viewer` | Trapezoid sales funnel with conversion rates between stages |

### Building UI viewers

```bash
cd src/ui
npm install
node build-all.mjs
```

## Node.js Compatibility

The server runs natively on Deno. For Node.js environments, use the build script:

```bash
cd lib/erpnext
./scripts/build-node.sh
```

This produces a `dist-node/` directory with:
- `runtime.ts` replaced by `runtime.node.ts` (uses `node:fs` instead of `Deno.*`)
- Relative imports rewritten `.ts` → `.js` for Node ESM
- Generated `package.json` with `tsx` as runner

```bash
cd dist-node
npm install
# stdio mode (Claude Desktop / PML config)
tsx server.ts
# HTTP mode (with auth via @casys/mcp-server)
tsx server.ts --http --port=3012
```

> **Note**: `@casys/mcp-server` must be published to npm before installing `@casys/mcp-erpnext` dependencies.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ERPNEXT_URL` | Yes | ERPNext base URL (e.g. `http://localhost:8000`) |
| `ERPNEXT_API_KEY` | Yes | API Key from User Settings |
| `ERPNEXT_API_SECRET` | Yes | API Secret from User Settings |

## Architecture

```
mod.ts              # Public API
server.ts           # MCP server (stdio + HTTP)
deno.json           # Package config
scripts/
  build-node.sh     # Node.js distribution builder
src/
  api/
    frappe-client.ts  # Frappe REST HTTP client
    types.ts          # Type definitions
  tools/
    sales.ts          # 17 sales tools
    inventory.ts      # 9 inventory tools
    purchasing.ts     # 11 purchasing tools
    accounting.ts     # 6 accounting tools
    hr.ts             # 12 HR tools
    project.ts        # 9 project tools
    delivery.ts       # 5 delivery tools
    manufacturing.ts  # 7 manufacturing tools
    crm.ts            # 8 CRM tools
    assets.ts         # 8 asset tools
    operations.ts     # 7 generic CRUD tools
    setup.ts          # 2 company/setup tools
    analytics.ts      # 19 analytics tools (charts, KPIs, pipelines, funnel)
    mod.ts            # Registry
    types.ts          # Tool interface
  client.ts           # ErpNextToolsClient
  runtime.ts          # Deno runtime shim
  runtime.node.ts     # Node.js runtime shim
  ui/
    doclist-viewer/   # Generic document list
    invoice-viewer/   # Invoice display
    stock-viewer/     # Stock balance display
    chart-viewer/     # Universal chart renderer (Recharts)
    order-pipeline-viewer/  # Kanban pipeline
    kpi-viewer/       # Single metric card
    funnel-viewer/    # Sales funnel
    shared/           # Shared theme + branding
tests/
docs/
  coverage.md         # Full coverage matrix
  ROADMAP.md          # Viewer & analytics roadmap
```

## Development

```bash
# Run tests
deno test --allow-all tests/

# Type check
deno check mod.ts server.ts

# Start HTTP server (dev)
deno task serve
```

## License

MIT
