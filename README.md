# @casys/mcp-erpnext

[![JSR](https://jsr.io/badges/@casys/mcp-erpnext)](https://jsr.io/@casys/mcp-erpnext)
[![npm](https://img.shields.io/npm/v/@casys/mcp-erpnext?logo=npm&color=cb3837)](https://www.npmjs.com/package/@casys/mcp-erpnext)
[![CI](https://github.com/Casys-AI/mcp-erpnext/actions/workflows/test.yml/badge.svg)](https://github.com/Casys-AI/mcp-erpnext/actions/workflows/test.yml)
[![MCP](https://img.shields.io/badge/MCP-server-1f6feb?logo=modelcontextprotocol&logoColor=white)](https://modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

MCP server for [ERPNext](https://erpnext.com) / Frappe ERP — **122 tools**
across **14 categories**, with **7 interactive UI viewers**.

Connect any MCP-compatible AI agent (Claude Desktop, Claude Code, VS Code
Copilot, custom) to your ERPNext instance via the
[Model Context Protocol](https://modelcontextprotocol.io).

Works with **self-hosted** and **ERPNext Cloud** (frappe.cloud) instances.

## Screenshots

Interactive viewers rendered inside an MCP host, driven entirely by tool
results.

<table>
  <tr>
    <td width="50%" align="center">
      <img src="docs/assets/doclist-viewer.png" alt="Document list viewer with chip filters and inline detail" width="100%"><br>
      <sub><b>doclist-viewer</b> — any DocType as a sortable table with chip filters and an inline detail panel</sub>
    </td>
    <td width="50%" align="center">
      <img src="docs/assets/invoice-viewer.png" alt="Invoice viewer with line items and actions" width="100%"><br>
      <sub><b>invoice-viewer</b> — invoice with parties, line items, item drill-down and Submit/Cancel/Payments</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <img src="docs/assets/funnel-viewer.png" alt="Sales funnel viewer" width="100%"><br>
      <sub><b>funnel-viewer</b> — Lead → Opportunity → Quotation → Order with conversion rates</sub>
    </td>
    <td width="50%" align="center">
      <img src="docs/assets/kpi-viewer.png" alt="KPI viewer with sparkline" width="100%"><br>
      <sub><b>kpi-viewer</b> — big-number KPI with delta vs last period and a sparkline</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <img src="docs/assets/chart-viewer.png" alt="Chart viewer" width="100%"><br>
      <sub><b>chart-viewer</b> — universal Recharts renderer (here: stock levels)</sub>
    </td>
    <td width="50%" align="center">
      <img src="docs/assets/stock-viewer.png" alt="Stock balance viewer" width="100%"><br>
      <sub><b>stock-viewer</b> — stock balance with color-coded quantity badges</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <img src="docs/assets/kanban-viewer.png" alt="Read-write kanban board" width="100%"><br>
      <sub><b>kanban-viewer</b> — read-write board (Task / Opportunity / Issue) with inline edit</sub>
    </td>
    <td width="50%" align="center">
      <img src="docs/assets/profit-loss.png" alt="Profit and loss composed chart" width="100%"><br>
      <sub><b>chart-viewer</b> — composed dual-axis chart (here: profit &amp; loss)</sub>
    </td>
  </tr>
</table>

## What's New

See the [CHANGELOG](CHANGELOG.md) for the full release history, or the
[latest release](https://github.com/Casys-AI/mcp-erpnext/releases/latest) for
the current version's highlights.

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

> **Works with ERPNext Cloud** — set `ERPNEXT_URL` to your Frappe Cloud URL
> (e.g. `https://mycompany.erpnext.com` or `https://mysite.frappe.cloud`). API
> key authentication works the same way on self-hosted and cloud instances.

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

On a fresh ERPNext instance (no setup wizard), you need to create master data
before using business tools. Use `erpnext_doc_create` for prerequisites:

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

Seven interactive [MCP Apps](https://github.com/modelcontextprotocol/ext-apps)
viewers, registered as `ui://mcp-erpnext/{name}`:

| Viewer           | Description                                                      | Interactive Features                                                                                                                               |
| ---------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `doclist-viewer` | Generic document table with sort, filter, pagination, CSV export | Row click → inline detail panel with Submit/Cancel + sendMessage navigation. Chip filters for status columns. Max 6 columns, rest in detail panel. |
| `invoice-viewer` | Sales/Purchase Invoice with parties, items, totals               | Item click → stock balance + item info panel. Submit/Cancel/Payment actions. sendMessage to payment entries and customer invoices.                 |
| `stock-viewer`   | Stock balance table with color-coded qty badges                  | Row click → item info + recent movements. sendMessage to stock chart, item details, stock entries.                                                 |
| `chart-viewer`   | Universal chart renderer (12 types via Recharts)                 | Click bar/pie/line data points → sendMessage drill-down into underlying documents.                                                                 |
| `kanban-viewer`  | Read-write kanban for Task, Opportunity, Issue                   | Drag-and-drop moves, inline edit (priority, progress, dates), sendMessage to Timesheets/Quotations/Related docs.                                   |
| `kpi-viewer`     | Big number card with delta, sparkline, trend                     | Click number → sendMessage to exception list. Click sparkline → trend chart.                                                                       |
| `funnel-viewer`  | Trapezoid sales funnel with conversion rates                     | Click stage → sendMessage to document list at that stage. Stage action buttons.                                                                    |

### Cross-viewer navigation

Viewers communicate via `app.sendMessage()` — clicking a button in one viewer
injects a message into the conversation, which triggers the AI to call the right
tool and open the appropriate viewer. This creates a seamless drill-down
experience without leaving the chat.

The server auto-injects navigation metadata into tool results:

- `_rowAction` — which tool to call when a row is clicked
- `_sendMessageHints` — navigation buttons shown in detail panels (e.g.
  "Orders", "Invoices")
- `_drillDown` / `_trendDrillDown` — sendMessage templates for KPI and chart
  click-through

### Refresh model

All viewers carry a `refreshRequest` payload for safe revalidation via
`app.callServerTool()`:

- `kanban-viewer` revalidates after mutations and on focus
- All other viewers support focus refresh + manual refresh button

### Building UI viewers

```bash
cd src/ui
npm install
node build-all.mjs
```

## Tools (122)

**14 categories** covering the full ERPNext surface. Each `_list` tool returns
interactive results in the doclist-viewer with row click, inline detail, and
cross-viewer navigation.

| Category          | Tools | Viewer               | Key capabilities                                                       |
| ----------------- | ----- | -------------------- | ---------------------------------------------------------------------- |
| **Sales**         | 17    | doclist / invoice    | Customers, Sales Orders, Invoices, Quotations — CRUD + Submit/Cancel   |
| **Purchasing**    | 11    | doclist / invoice    | Suppliers, Purchase Orders, Invoices, Receipts                         |
| **Inventory**     | 9     | doclist / stock      | Items, Stock Balance, Warehouses, Stock Entries                        |
| **Accounting**    | 6     | doclist              | Accounts, Journal Entries, Payment Entries                             |
| **HR**            | 12    | doclist              | Employees, Attendance, Leave, Salary, Expenses                         |
| **Project**       | 9     | doclist              | Projects, Tasks, Timesheets                                            |
| **Delivery**      | 5     | doclist              | Delivery Notes, Shipments                                              |
| **Manufacturing** | 7     | doclist              | BOMs, Work Orders, Job Cards                                           |
| **CRM**           | 8     | doclist              | Leads, Opportunities, Contacts, Campaigns                              |
| **Assets**        | 8     | doclist              | Assets, Movements, Maintenance, Categories                             |
| **Operations**    | 8     | doclist              | Generic CRUD + native assignment for **any** DocType (`erpnext_doc_*`) |
| **Kanban**        | 2     | kanban               | Task/Opportunity/Issue boards with drag-and-drop                       |
| **Analytics**     | 17    | chart / kpi / funnel | 12 chart types, 5 KPIs, sales funnel                                   |
| **Setup**         | 3     | —                    | Company creation, assignable user listing                              |

> Full tool reference with all parameters: [`docs/tools.md`](docs/tools.md)

## Environment Variables

| Variable             | Required | Description                                                                                                   |
| -------------------- | -------- | ------------------------------------------------------------------------------------------------------------- |
| `ERPNEXT_URL`        | Yes      | ERPNext base URL — self-hosted (e.g. `http://localhost:8000`) or cloud (e.g. `https://mycompany.erpnext.com`) |
| `ERPNEXT_API_KEY`    | Yes      | API Key from User Settings                                                                                    |
| `ERPNEXT_API_SECRET` | Yes      | API Secret from User Settings                                                                                 |

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
  *_test.ts           # Tests are colocated with source files
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
docs/
  ROADMAP.md          # Feature roadmap
  coverage.md         # Test coverage matrix
```

## npm Package

The npm package (`@casys/mcp-erpnext`) is a single self-contained bundle with
zero runtime dependencies. UI viewers are embedded.

## Development

```bash
# Run tests
deno test --allow-all src/

# Type check
deno task check

# Start HTTP server (dev)
deno task serve

# Launch MCP Inspector
deno task inspect

# Build UI viewers
deno task ui:build

# Full local release preflight (no publish)
deno task release:check

# Dev a specific viewer with HMR
cd src/ui && npm run dev:kanban
```

## Release Flow

Releases are manual and explicit:

1. Update `deno.json`, `server.ts`, and `CHANGELOG.md`.
2. Run `deno task release:check` locally.
3. Commit and push the release commit to `main`.
4. Create the GitHub release/tag, for example `v2.3.0`.
5. Run the `Publish` workflow manually to publish the same version to JSR and
   npm.

The package name stays `@casys/mcp-erpnext`; releases only bump the package
version.

## License

MIT
