# Repository layout

Where things live. Tool counts are per file and sum to 124.

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
    operations.ts     # 10 generic operations tools
    setup.ts          # 3 company/setup tools
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
  coverage.md         # DocType and operation coverage matrix
```
