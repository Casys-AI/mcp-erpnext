English | [繁體中文](README.zh-TW.md)

# @casys/mcp-erpnext

[![JSR](https://jsr.io/badges/@casys/mcp-erpnext)](https://jsr.io/@casys/mcp-erpnext)
[![npm](https://img.shields.io/npm/v/@casys/mcp-erpnext?logo=npm&color=cb3837)](https://www.npmjs.com/package/@casys/mcp-erpnext)
[![CI](https://github.com/Casys-AI/mcp-erpnext/actions/workflows/test.yml/badge.svg)](https://github.com/Casys-AI/mcp-erpnext/actions/workflows/test.yml)
[![MCP](https://img.shields.io/badge/MCP-server-1f6feb?logo=modelcontextprotocol&logoColor=white)](https://modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Let any MCP-compatible AI agent operate your [ERPNext](https://erpnext.com) /
Frappe instance — documents, workflows, and interactive viewers inside the host
(Claude Desktop, Claude Code, VS Code Copilot, or custom).

Works with **self-hosted** and **ERPNext Cloud** (frappe.cloud) instances.

> Built on **[@casys/mcp-server](https://github.com/Casys-AI/mcp-server)** — the
> MCP server framework (concurrency, auth, MCP Apps, observability) that powers
> this project.

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

## Documentation

Organised by what you are doing, following [Diátaxis](https://diataxis.fr):

|                                       |                                                                                                                                                                                                                       |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Learning** — never used this before | [Your first tool call](docs/tutorial-first-tool-call.md) — from nothing to a working response in four steps                                                                                                           |
| **Doing** — you have a specific goal  | [Seed a blank ERPNext instance](docs/fresh-instance-setup.md) · [Run the HTTP server](docs/http-deployment.md) · [Set up OAuth](docs/oauth-setup.md) · [Migrate to 2026-07-28](docs/migration-mcp-spec-2026-07-28.md) |
| **Looking something up**              | [Tools](docs/tools.md) · [Environment variables](docs/environment-variables.md) · [DocType coverage](docs/coverage.md)                                                                                                |
| **Understanding why**                 | [Concepts](docs/concepts.md) — link resolution, transports, MRTR, and which cache does what · [ERPNext quirks](docs/erpnext-quirks.md)                                                                                |

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

For a shared, always-on server rather than one process per client:
[how to run the HTTP server](docs/http-deployment.md). Note it is breaking for
pre-2026 HTTP clients in 3.0.0.

### Category filtering

Load only the categories you need:

```bash
npx -y @casys/mcp-erpnext --categories=sales,inventory
```

## Fresh Instance Setup

A blank ERPNext instance has no master data, so business tools fail validation
until it exists. See
[Seed a blank ERPNext instance](docs/fresh-instance-setup.md).

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
tool and open the appropriate viewer.

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

## Tools

Each `_list` tool returns interactive results via the doclist-viewer with row
click, inline detail, and cross-viewer navigation.

- **Sales** — Customers, Sales Orders, Invoices, and Quotations with full CRUD,
  Submit, and Cancel.
- **Purchasing** — Suppliers, Purchase Orders, Purchase Invoices, Receipts, and
  Supplier Quotations.
- **Inventory** — Items, Stock Balance, Warehouses, and Stock Entries.
- **Accounting** — Chart of Accounts, Journal Entries, and Payment Entries.
- **HR** — Employees, Attendance, Leave Applications, Salary Slips, Payroll
  Entries, and Expense Claims.
- **Project** — Projects, Tasks (with native assignment), and Timesheets.
- **Delivery** — Delivery Notes and Shipments.
- **Manufacturing** — BOMs, Work Orders, and Job Cards.
- **CRM** — Leads, Opportunities, Contacts, and Campaigns.
- **Assets** — Assets, Movements, Maintenance records, and Categories.
- **Operations** — Generic CRUD, native assignment, and file upload for any
  DocType (`erpnext_doc_*`, `erpnext_file_upload`).
- **Kanban** — Read-write boards for Task, Opportunity, and Issue with
  drag-and-drop.
- **Analytics** — Charts (bar, area, treemap, radar, scatter, P&L…), KPIs with
  sparklines, and a sales funnel.
- **Setup** — Company creation and assignable user listing.

Full per-tool reference with parameters: [`docs/tools.md`](docs/tools.md).

## Environment Variables

| Variable                   | Required | Description                                                                                                                      |
| -------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `ERPNEXT_URL`              | Yes      | ERPNext base URL — self-hosted (e.g. `http://localhost:8000`) or cloud (e.g. `https://mycompany.erpnext.com`)                    |
| `ERPNEXT_API_KEY`          | Yes      | API Key from User Settings                                                                                                       |
| `ERPNEXT_API_SECRET`       | Yes      | API Secret from User Settings                                                                                                    |
| `ERPNEXT_MAX_UPLOAD_BYTES` | No       | Maximum decoded file-upload size in bytes (positive integer; default: 10 MiB)                                                    |
| `MCP_MRTR_SIGNING_KEY`     | No       | Exactly 64 lowercase hex characters; enables signed ambiguous-link elicitation. **Single-instance deployments only** — see below |

MRTR is opt-in. Without this key, or when the client does not advertise
elicitation, ambiguous links keep returning the existing actionable ambiguity
error instead of prompting for a selection.

> **Do not run MRTR behind a load balancer with this configuration.** The
> signing key proves a retry token is authentic; it does not make it single-use.
> That is the job of a replay store, and the default one is process-local. Share
> the key across two instances and the same signed retry validates on both —
> creating the purchase order, leave application or expense claim **twice**,
> irreversibly once submitted.
>
> A multi-instance deployment must pass a shared atomic `mrtr.replayStore` to
> `McpApp` (Redis satisfies the contract with `SET key 1 NX EXAT`). The
> framework logs a warning at startup whenever MRTR is enabled without one —
> that warning is not noise, it is this paragraph.

## Architecture

Tools are grouped by business domain under `src/tools/`, the Frappe REST client
is dependency-free, and each UI viewer is a separate build under `src/ui/`. Full
layout: [repository layout](docs/architecture.md).

## npm Package

The npm package (`@casys/mcp-erpnext`) is a single self-contained bundle with
zero runtime dependencies. UI viewers are embedded. Requires Node >= 20.

## Contributing

Contributions are welcome — see **[CONTRIBUTING.md](CONTRIBUTING.md)** to get
started, and [AGENTS.md](AGENTS.md) for the full architecture and conventions.

## License

MIT
