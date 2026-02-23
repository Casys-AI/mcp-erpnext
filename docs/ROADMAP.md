# ERPNext MCP Viewers — Roadmap

## Current State (2026-02-20)

### Viewers
| Viewer | Description | Status |
|--------|------------|--------|
| doclist-viewer | Generic DocType table (sort, filter, pagination, CSV export) | Done |
| invoice-viewer | Sales/Purchase Invoice detail view | Done |
| stock-viewer | Stock balance table with color-coded qty badges | Done |
| chart-viewer | Universal chart renderer (12 types via Recharts) | Done |
| order-pipeline-viewer | Sales Order kanban by status | Done |
| kpi-viewer | Big number card, subtitle, delta vs previous period, sparkline | Done |
| funnel-viewer | Trapezoid stages with conversion rates | Done |

### Analytics Tools (-> chart-viewer)
| Tool | Chart Type | Status |
|------|-----------|--------|
| erpnext_stock_chart | bar / horizontal-bar | Done |
| erpnext_sales_chart | donut / horizontal-bar | Done |
| erpnext_revenue_trend | line / area / stacked-area | Done |
| erpnext_order_breakdown | stacked-bar / pie / donut | Done |
| erpnext_revenue_vs_orders | composed (bar + line, dual axis) | Done |
| erpnext_stock_treemap | treemap | Done |
| erpnext_product_radar | radar | Done |
| erpnext_price_vs_qty | scatter | Done |

### KPI Tools (-> kpi-viewer)
| Tool | Description | Status |
|------|------------|--------|
| erpnext_kpi_revenue | Revenue MTD/YTD with delta | Done |
| erpnext_kpi_outstanding | Total outstanding receivables | Done |
| erpnext_kpi_orders | Orders this month (count + value) | Done |
| erpnext_kpi_gross_margin | Gross margin % with trend | Done |
| erpnext_kpi_overdue | Number + value of overdue invoices | Done |

### Financial & Pipeline Tools
| Tool | Viewer | Status |
|------|--------|--------|
| erpnext_ar_aging | chart-viewer (stacked-bar, aging buckets) | Done |
| erpnext_gross_profit | chart-viewer (horizontal-bar with margin data) | Done |
| erpnext_profit_loss | chart-viewer (composed or stacked-bar) | Done |
| erpnext_purchase_pipeline | order-pipeline-viewer (Purchase Orders by status) | Done |
| erpnext_sales_funnel | funnel-viewer (Lead -> Opportunity -> Quotation -> Order) | Done |

---

## Roadmap

### TIER 1 — Interactive Tool Calls (Bidirectional UI)

**The next frontier.** Every viewer above is read-only. The next step is viewers that _write back_ to ERPNext — turning the MCP UI from a dashboard into a conversational, interactive ERP.

#### Enabling Technology: `app.callServerTool()`

The MCP Apps SDK (`@modelcontextprotocol/ext-apps`) provides `app.callServerTool()` — a method that lets a viewer (running inside a sandboxed iframe) call any tool on its originating MCP server, proxied through the host. This is the key primitive for bidirectional UI.

```typescript
// Example: Submit a Sales Order from inside order-pipeline-viewer
const result = await app.callServerTool({
  name: "erpnext_sales_order_submit",
  arguments: { name: "SO-2026-00042" },
});
if (result.isError) {
  showToast("Submit failed", result.content);
}
```

The SDK also provides `app.sendMessage()` to inject messages into the host conversation (e.g., "Show me the invoices for this customer"), enabling drill-down flows where a click in one viewer triggers a new tool call in the chat.

**Current status**: No viewer uses `callServerTool` yet. All data flows are unidirectional (server -> viewer via `ontoolresult`).

#### Planned Interactive Capabilities

| Interaction | Viewer | Tool Called | Description |
|-------------|--------|------------|-------------|
| **Kanban drag-and-drop** | order-pipeline-viewer | `erpnext_doc_update` | Drag a SO card from "Draft" to "To Deliver" = status update. Drag to "Submitted" column = calls `erpnext_sales_order_submit`. |
| **KPI drill-down** | kpi-viewer | `erpnext_sales_invoice_list` (via `sendMessage`) | Click "Outstanding Receivables" KPI card -> injects a message that triggers doclist-viewer filtered on `outstanding_amount > 0`. |
| **Inline cell edit** | doclist-viewer | `erpnext_doc_update` | Double-click a cell -> inline edit -> save = PATCH to ERPNext via `erpnext_doc_update({ doctype, name, fields })`. |
| **Funnel click-through** | funnel-viewer | `erpnext_doc_list` (via `sendMessage`) | Click "Quotations" stage -> lists all quotations at that stage in a new doclist-viewer. |
| **Quick actions** | doclist-viewer, invoice-viewer | `erpnext_sales_order_submit`, `erpnext_sales_invoice_create` | Contextual action buttons: Submit, Cancel, Create Invoice from SO, Mark as Paid. |
| **Chart segment drill** | chart-viewer | `erpnext_doc_list` (via `sendMessage`) | Click a bar/slice/segment -> drill into the underlying documents. |

#### Implementation Notes

- **Optimistic UI**: Update the viewer immediately on user action, then confirm with the server response. Roll back on error.
- **Confirmation dialogs**: Destructive actions (Submit, Cancel) must show a confirmation step before calling the tool.
- **Error surfaces**: `callServerTool` errors (permissions, validation) must be shown inline, not silently swallowed.
- **Host capability check**: Before enabling interactive features, check `app.getHostCapabilities()?.serverTools` — not all hosts support proxied tool calls.

### TIER 2 — New Viewers & Infrastructure (P1)

| Item | Type | Description |
|------|------|-------------|
| **HTTP Auth (OAuth/JWT)** | Infrastructure | `@casys/mcp-server` has a full auth pipeline (Bearer/JWT/JWKS, presets for Auth0/Google/GitHub, per-tool scope enforcement, RFC 9728). Needs validation with mcp-erpnext: wire auth config, test scope-per-tool (e.g. `erpnext:read` vs `erpnext:write`), document setup. Prerequisite for multi-user deployment. |
| BOM Cost Breakdown | chart-viewer (treemap) | Bill of Materials cost hierarchy |
| Bank Reconciliation Status | New viewer | Match bank transactions to GL entries |
| HR Overview | kpi-viewer + chart-viewer | Headcount, attendance, leave balance |
| Stock Ledger Timeline | chart-viewer (line) + doclist-viewer | Stock movements over time with drill-down |
| Gantt Viewer | New viewer | Project / task timeline (horizontal bars) |

### TIER 3 — Ideas / Nice-to-have (P2)

- Manufacturing dashboard (Work Order status, machine utilization)
- Multi-currency reconciliation viewer
- Customer 360 viewer (all docs for one customer in one view)
- Approval queue viewer (pending approvals across doctypes)
- Webhook event log viewer

---

## Architecture Notes

- Each KPI is a **separate tool call** — NO aggregated dashboard tool
- PML Feed composes multiple viewer iframes -> user gets a dashboard
- New viewers follow the pattern: `lib/erpnext/src/ui/{name}/src/{Name}.tsx`
- Shared: `~/shared/theme.ts` (colors, fonts, styles), `~/shared/ErpNextBrand.tsx`
- MCP App protocol: `new App()`, `app.ontoolresult`, parse JSON from `content[0].text`
- `animationDuration={0}` on all Recharts components (no fade-in)
- Register viewer name in `lib/erpnext/server.ts` UI_VIEWERS array
- Interactive tool calls use `app.callServerTool()` from `@modelcontextprotocol/ext-apps`
- Cross-viewer navigation uses `app.sendMessage()` to inject follow-up queries

## Sources
- [MCP Apps SDK](https://github.com/modelcontextprotocol/ext-apps) — `@modelcontextprotocol/ext-apps`
- [MCP Apps Specification (2026-01-26)](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx)
- [Frappe Forum — Dashboard Options](https://discuss.frappe.io/t/dashboard-options-for-erpnext/70454)
- [Frappe Forum — KPI Dashboard](https://discuss.frappe.io/t/how-i-created-this-sales-kpi-dashboard/33252)
- [GitHub — AR Aging Issues](https://github.com/frappe/erpnext/issues/45830)
- [Mint — Better Bank Reconciliation](https://github.com/The-Commit-Company/mint)
- [ERPNext Procurement Tracker](https://techfordai.com/procurement-tracker-in-erpnext/)
