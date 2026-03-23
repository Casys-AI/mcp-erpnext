# @casys/mcp-erpnext

MCP server for [ERPNext](https://erpnext.com) / Frappe ERP — **120 tools** across **14 categories**, with **7 interactive UI viewers**.

Connect any MCP-compatible AI agent (Claude Desktop, Claude Code, VS Code Copilot, custom) to your ERPNext instance via the [Model Context Protocol](https://modelcontextprotocol.io).

Works with **self-hosted** and **ERPNext Cloud** (frappe.cloud) instances.

## What's New in v2.1

- **Cross-viewer navigation** — click a row in any list to drill down, click a button to open related documents in another viewer via `sendMessage`
- **Inline detail panels** — expand any row in doclist/stock viewers to see full document details + action buttons (Submit, Cancel, Payments)
- **Interactive charts** — click bar/pie/line data points to drill into underlying documents
- **KPI drill-down** — click the big number or sparkline to explore exceptions or trends
- **Funnel redesign** — trapezoid stages with gradient fills, conversion badges, click-through navigation
- **Better error messages** — Frappe API errors are now surfaced with full detail instead of generic "Tool execution failed"
- **VS Code Copilot fix** — schema validation issue with `erpnext_doc_list` filters resolved (#2)

## Quick Start

### Prerequisites

Generate API credentials in ERPNext:
1. Login to ERPNext → top-right menu → **My Settings**
2. Section **API Access** → **Generate Keys**
3. Copy `API Key` and `API Secret`

### Claude Desktop / Claude Code (npm)

```json
{
  "mcpServers": {
    "erpnext": {
      "command": "npx",
      "args": ["-y", "@casys/mcp-erpnext"],
      "env": {
        "ERPNEXT_URL": "http://localhost:8000",
        "ERPNEXT_API_KEY": "your-api-key",
        "ERPNEXT_API_SECRET": "your-api-secret"
      }
    }
  }
}
```

> **Works with ERPNext Cloud** — set `ERPNEXT_URL` to your Frappe Cloud URL (e.g. `https://mycompany.erpnext.com` or `https://mysite.frappe.cloud`). API key authentication works the same way on self-hosted and cloud instances.

> Zero dependencies — single self-contained bundle. Requires Node >= 20.

### VS Code Copilot

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "erpnext": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@casys/mcp-erpnext"],
      "env": {
        "ERPNEXT_URL": "http://localhost:8000",
        "ERPNEXT_API_KEY": "your-api-key",
        "ERPNEXT_API_SECRET": "your-api-secret"
      }
    }
  }
}
```

### Deno (stdio)

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
npx -y @casys/mcp-erpnext --http --port=3012
```

### Category filtering

Load only the categories you need:

```bash
npx -y @casys/mcp-erpnext --categories=sales,inventory
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

## UI Viewers

Seven interactive [MCP Apps](https://github.com/modelcontextprotocol/ext-apps) viewers, registered as `ui://mcp-erpnext/{name}`:

| Viewer | Description | Interactive Features |
|--------|-------------|---------------------|
| `doclist-viewer` | Generic document table with sort, filter, pagination, CSV export | Row click → inline detail panel with Submit/Cancel + sendMessage navigation. Chip filters for status columns. Max 6 columns, rest in detail panel. |
| `invoice-viewer` | Sales/Purchase Invoice with parties, items, totals | Item click → stock balance + item info panel. Submit/Cancel/Payment actions. sendMessage to payment entries and customer invoices. |
| `stock-viewer` | Stock balance table with color-coded qty badges | Row click → item info + recent movements. sendMessage to stock chart, item details, stock entries. |
| `chart-viewer` | Universal chart renderer (12 types via Recharts) | Click bar/pie/line data points → sendMessage drill-down into underlying documents. |
| `kanban-viewer` | Read-write kanban for Task, Opportunity, Issue | Drag-and-drop moves, inline edit (priority, progress, dates), sendMessage to Timesheets/Quotations/Related docs. |
| `kpi-viewer` | Big number card with delta, sparkline, trend | Click number → sendMessage to exception list. Click sparkline → trend chart. |
| `funnel-viewer` | Trapezoid sales funnel with conversion rates | Click stage → sendMessage to document list at that stage. Stage action buttons. |

### Cross-viewer navigation

Viewers communicate via `app.sendMessage()` — clicking a button in one viewer injects a message into the conversation, which triggers the AI to call the right tool and open the appropriate viewer. This creates a seamless drill-down experience without leaving the chat.

The server auto-injects navigation metadata into tool results:
- `_rowAction` — which tool to call when a row is clicked
- `_sendMessageHints` — navigation buttons shown in detail panels (e.g. "Orders", "Invoices")
- `_drillDown` / `_trendDrillDown` — sendMessage templates for KPI and chart click-through

### Refresh model

All viewers carry a `refreshRequest` payload for safe revalidation via `app.callServerTool()`:
- `kanban-viewer` revalidates after mutations and on focus
- All other viewers support focus refresh + manual refresh button

### Building UI viewers

```bash
cd src/ui
npm install
node build-all.mjs
```

## Tools (120)

**14 categories** covering the full ERPNext surface. Each `_list` tool returns interactive results in the doclist-viewer with row click, inline detail, and cross-viewer navigation.

| Category | Tools | Viewer | Key capabilities |
|----------|-------|--------|-----------------|
| **Sales** | 17 | doclist / invoice | Customers, Sales Orders, Invoices, Quotations — CRUD + Submit/Cancel |
| **Purchasing** | 11 | doclist / invoice | Suppliers, Purchase Orders, Invoices, Receipts |
| **Inventory** | 9 | doclist / stock | Items, Stock Balance, Warehouses, Stock Entries |
| **Accounting** | 6 | doclist | Accounts, Journal Entries, Payment Entries |
| **HR** | 12 | doclist | Employees, Attendance, Leave, Salary, Expenses |
| **Project** | 9 | doclist | Projects, Tasks, Timesheets |
| **Delivery** | 5 | doclist | Delivery Notes, Shipments |
| **Manufacturing** | 7 | doclist | BOMs, Work Orders, Job Cards |
| **CRM** | 8 | doclist | Leads, Opportunities, Contacts, Campaigns |
| **Assets** | 8 | doclist | Assets, Movements, Maintenance, Categories |
| **Operations** | 7 | doclist | Generic CRUD for **any** DocType (`erpnext_doc_*`) |
| **Kanban** | 2 | kanban | Task/Opportunity/Issue boards with drag-and-drop |
| **Analytics** | 17 | chart / kpi / funnel | 12 chart types, 5 KPIs, sales funnel |
| **Setup** | 2 | — | Company creation |

> Full tool reference with all parameters: [`docs/tools.md`](docs/tools.md)

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ERPNEXT_URL` | Yes | ERPNext base URL — self-hosted (e.g. `http://localhost:8000`) or cloud (e.g. `https://mycompany.erpnext.com`) |
| `ERPNEXT_API_KEY` | Yes | API Key from User Settings |
| `ERPNEXT_API_SECRET` | Yes | API Secret from User Settings |

## Architecture

```
server.ts           # MCP server (stdio + HTTP + inspector)
mod.ts              # Public API
deno.json           # Package config
src/
  api/
    frappe-client.ts  # Frappe REST HTTP client (zero-dependency)
    types.ts          # Frappe type definitions
  kanban/
    adapters/         # Per-DocType kanban adapters (task, opportunity, issue)
    definitions.ts    # Board registry
    types.ts          # Shared kanban contracts
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
    kanban.ts         # 2 read-write kanban tools
    analytics.ts      # 17 analytics tools (charts, KPIs, funnel)
    ui-refresh.ts     # Auto-inject _rowAction, _sendMessageHints, _drillDown
    mod.ts            # Tool registry
    types.ts          # Tool interface
  client.ts           # ErpNextToolsClient
  runtime.ts          # Deno runtime adapter
  runtime.node.ts     # Node.js runtime adapter
  ui/
    shared/           # ActionButton, InfoField, theme, branding, refresh
    doclist-viewer/   # Generic document list (inline detail, chip filters)
    invoice-viewer/   # Invoice display (item drill-down, actions)
    stock-viewer/     # Stock balance (detail panel, sendMessage)
    chart-viewer/     # Universal chart renderer (12 types, click drill-down)
    kanban-viewer/    # Read-write kanban (drag, edit, sendMessage)
    kpi-viewer/       # KPI card (clickable number + sparkline)
    funnel-viewer/    # Sales funnel (trapezoid stages, click-through)
    viewers.ts        # Viewer registry
tests/
  tools/              # Tool + ui-refresh + client tests
  kanban/             # Kanban adapter tests
  ui/                 # UI state + refresh tests
docs/
  ROADMAP.md          # Feature roadmap
  coverage.md         # Test coverage matrix
```

## npm Package

The npm package (`@casys/mcp-erpnext`) is a single self-contained bundle with zero runtime dependencies. UI viewers are embedded.

## Development

```bash
# Run tests (147 tests)
deno test --allow-all tests/

# Type check
deno check mod.ts server.ts

# Start HTTP server (dev)
deno task serve

# Launch MCP Inspector
deno task inspect

# Build UI viewers
deno task ui:build

# Dev a specific viewer with HMR
cd src/ui && npm run dev:kanban
```

## License

MIT
