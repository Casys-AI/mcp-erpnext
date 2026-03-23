# ERPNext MCP Viewers — Roadmap

## Current State (2026-03-23)

### Viewers
| Viewer | Description | Status |
|--------|------------|--------|
| doclist-viewer | Generic DocType table — sort, filter, pagination, CSV, inline detail, row actions, sendMessage cross-viewer, chip filters | Done (v2) |
| invoice-viewer | Sales/Purchase Invoice detail view | Done |
| stock-viewer | Stock balance table with color-coded qty badges | Done |
| chart-viewer | Universal chart renderer (12 types via Recharts) | Done |
| kanban-viewer | Canonical read-write kanban board for Task, Opportunity, and Issue | Done |
| kpi-viewer | Big number card, subtitle, delta vs previous period, sparkline | Done |
| funnel-viewer | Trapezoid stages with conversion rates | Done |

### Kanban Tools (-> kanban-viewer)
| Tool | Scope | Status |
|------|-------|--------|
| erpnext_kanban_get_board | Normalized kanban board, pagination, transitions, move metadata for Task, Opportunity, and Issue | Done |
| erpnext_kanban_move_card | Read-write card move with business validation and reconciliation | Done |

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

### Financial Tools
| Tool | Viewer | Status |
|------|--------|--------|
| erpnext_ar_aging | chart-viewer (stacked-bar, aging buckets) | Done |
| erpnext_gross_profit | chart-viewer (horizontal-bar with margin data) | Done |
| erpnext_profit_loss | chart-viewer (composed or stacked-bar) | Done |
| erpnext_sales_funnel | funnel-viewer (Lead -> Opportunity -> Quotation -> Order) | Done |

---

## Roadmap

### TIER 1 — Interactive Tool Calls (Bidirectional UI)

**The next frontier is open.** `kanban-viewer` is now the first read-write MCP App viewer in `lib/erpnext`. The next step is extending the same pattern to more viewers and more DocTypes without sending the user back to the ERPNext web UI.

#### Enabling Technology: `app.callServerTool()`

The MCP Apps SDK (`@modelcontextprotocol/ext-apps`) provides `app.callServerTool()` — a method that lets a viewer (running inside a sandboxed iframe) call any tool on its originating MCP server, proxied through the host. This is the key primitive for bidirectional UI.

```typescript
// Example: Move a Task card from inside kanban-viewer
const result = await app.callServerTool({
  name: "erpnext_kanban_move_card",
  arguments: {
    doctype: "Task",
    card_id: "TASK-00042",
    from_column: "open",
    to_column: "working",
  },
});
if (result.isError) {
  showToast("Move failed", result.content);
}
```

The SDK also provides `app.sendMessage()` to inject messages into the host conversation (e.g., "Show me the invoices for this customer"), enabling drill-down flows where a click in one viewer triggers a new tool call in the chat.

**Current status**: `kanban-viewer` uses `callServerTool` for `Task`, `Opportunity`, and `Issue` moves. The rest of the viewer catalog remains read-only in terms of mutations, but now shares refresh/revalidation infrastructure through `refreshRequest`.

#### Why not native ERPNext kanban?

The MCP App exists because the user is already inside a host conversation. Keeping the board inside the MCP host avoids a context switch back to ERPNext, preserves conversational context, and still routes every write through the ERPNext MCP server as the source of truth.

#### Planned Interactive Capabilities

| Interaction | Viewer | Tool Called | Description |
|-------------|--------|------------|-------------|
| **Task kanban drag-and-drop** | kanban-viewer | `erpnext_kanban_move_card` | Delivered in V1 with optimistic UI, FIFO mutation queue, AX affordances, and rollback on business errors. Drag disabled in column focus mode (narrow viewports); button-based moves with column-colored destination dots instead. |
| **Opportunity kanban** | kanban-viewer | `erpnext_kanban_get_board` + `erpnext_kanban_move_card` | Delivered. Opportunity boards run on the same canonical kanban viewer and adapter model. |
| **Issue kanban** | kanban-viewer | `erpnext_kanban_get_board` + `erpnext_kanban_move_card` | Delivered. Issue boards run on the same canonical kanban viewer and adapter model. |
| **KPI drill-down** | kpi-viewer | `erpnext_sales_invoice_list` (via `sendMessage`) | Click "Outstanding Receivables" KPI card -> injects a message that triggers doclist-viewer filtered on `outstanding_amount > 0`. |
| **Inline cell edit** | doclist-viewer | `erpnext_doc_update` | Double-click a cell -> inline edit -> save = PATCH to ERPNext via `erpnext_doc_update({ doctype, name, fields })`. |
| **Funnel click-through** | funnel-viewer | `erpnext_doc_list` (via `sendMessage`) | Click "Quotations" stage -> lists all quotations at that stage in a new doclist-viewer. |
| **Quick actions** | doclist-viewer, invoice-viewer | `erpnext_sales_order_submit`, `erpnext_sales_invoice_create` | Contextual action buttons: Submit, Cancel, Create Invoice from SO, Mark as Paid. |
| **Chart segment drill** | chart-viewer | `erpnext_doc_list` (via `sendMessage`) | Click a bar/slice/segment -> drill into the underlying documents. |

#### Delivered cross-viewer infrastructure

- `refreshRequest` is injected server-side into viewer payloads so MCP Apps can revalidate themselves safely
- `kanban-viewer` revalidates after successful writes and on focus
- `doclist-viewer`, `stock-viewer`, `invoice-viewer`, `chart-viewer`, `kpi-viewer`, and `funnel-viewer` support focus refresh and manual fallback refresh

#### Implementation Notes

- **Optimistic UI**: Update the viewer immediately on user action, then confirm with the server response. Roll back on error.
- **Confirmation dialogs**: Destructive actions (Submit, Cancel) must show a confirmation step before calling the tool.
- **Error surfaces**: `callServerTool` errors (permissions, validation) must be shown inline, not silently swallowed.
- **Host capability check**: Before enabling interactive features, check `app.getHostCapabilities()?.serverTools` — not all hosts support proxied tool calls.
- **Column focus mode**: On narrow viewports (≤920px), the board switches to single-column tab navigation. Drag-and-drop is disabled in this mode; cards use button-based moves exclusively with colored destination dots matching target column colors.
- **Card design**: Accent strip (column color) at top, tone-aware badges (error=red, warning=amber, success=green), vertical metric layout with micro-caps labels, integrated action footer with column-colored destination indicators.

### TIER 1b — Cross-Viewer Navigation & Inline Actions (einvoice pattern)

Pattern ported from `mcp-einvoice`: server-driven `_rowAction` + `InlineDetailPanel` + `sendMessage` for cross-viewer drill-down. Shared atoms (`ActionButton`, `InfoField`) in `~/shared/`.

#### doclist-viewer — DONE

- [x] `_rowAction` support: server injects `{ toolName, idField, argName }` in list payloads
- [x] Row click → `callServerTool` → `InlineDetailPanel` expands under the row
- [x] Detail panel shows flattened doc fields + Submit/Cancel actions with confirm pattern
- [x] `sendMessage` navigation buttons (server-driven via `_sendMessageHints`)
- [x] Default "Full details" `sendMessage` fallback when no hints provided
- [x] Chip filters for status/category columns (auto-detected, 2-8 distinct values)
- [x] Auto-injection of `_rowAction` + `_sendMessageHints` in `ui-refresh.ts` for all known DocTypes
- [x] Modular architecture: atoms/molecules in `components/`, shared in `~/shared/`

#### invoice-viewer — DONE

- [x] Clic sur item → ItemDetailPanel inline: fiche article + stock dispo (`erpnext_item_get` + `erpnext_stock_balance`)
- [x] `sendMessage` vers stock-viewer et item details pour drill-down
- [x] InvoiceActions: Submit, Cancel avec confirm pattern
- [x] `sendMessage` vers Payment Entry liés
- [x] Bouton "Customer/Supplier invoices" → `sendMessage` vers doclist-viewer
- [x] Architecture modulaire: StatusBadge, ItemDetailPanel, InvoiceActions

#### stock-viewer — DONE

- [x] Clic sur ligne → StockDetailPanel inline: item info, mouvements recents (`erpnext_stock_entry_list`)
- [x] `sendMessage` vers chart-viewer (stock chart), item details, stock entries
- [x] Architecture modulaire: StockDetailPanel component
- [ ] Bouton "Replenish" → `callServerTool("erpnext_stock_entry_create")` pour Material Receipt (future)

#### chart-viewer — DONE

- [x] Clic sur barre (vertical/horizontal/stacked) → `sendMessage` avec le label du data point
- [x] Clic sur segment pie/donut → `sendMessage` avec le nom de la tranche
- [x] `_drillDown` template auto-injecté par `ui-refresh.ts` pour 7 chart tools (sales, stock, revenue, orders, AR aging, gross profit, P&L)
- [x] Template `{label}` remplacé dynamiquement par le label cliqué
- [x] Cursor pointer + host capability check

#### kanban-viewer — DONE

- [x] Edit inline dans le detail modal (priorité, progression, due date, assignee) — existant
- [x] callServerTool pour moves, save, refresh — existant
- [x] `handleNavigate` via `sendMessage` remplace l'ancien `handleAction` fire-and-forget
- [x] Boutons Task: "Timesheets", Opportunity: "Quotations", Issue: "Related tasks"
- [x] Bouton "Open in doclist" pour tous les doctypes
- [x] Utilise `ActionButton` partagé

#### kpi-viewer — DONE

- [x] Clic sur le grand chiffre → `sendMessage` drill-down (exceptions: overdue invoices, unpaid, etc.)
- [x] Clic sur sparkline → `sendMessage` vers chart-viewer pour tendance détaillée
- [x] `_drillDown` et `_trendDrillDown` auto-injectés par `ui-refresh.ts` pour les 5 KPI tools
- [x] Hover feedback visuel sur le big number et la sparkline

#### funnel-viewer — DONE

- [x] Clic sur une étape → `sendMessage` vers la liste correspondante (leads, opportunities, quotations, orders)
- [x] `_drillDown` par stage supporté côté payload serveur
- [x] Default drill-down mapping par label (Lead→leads, Opportunity→opportunities, etc.)
- [x] Hover feedback visuel sur les barres
- [ ] Bouton "Open kanban" → `sendMessage` vers kanban-viewer (future)
- [ ] Clic sur conversion badge → deals perdus/bloqués à cette transition (future)

### TIER 2 — New Viewers & Infrastructure (P1)

| Item | Type | Description |
|------|------|-------------|
| **HTTP Auth (OAuth/JWT)** | Infrastructure | `@casys/mcp-server` has a full auth pipeline (Bearer/JWT/JWKS, presets for Auth0/Google/GitHub, per-tool scope enforcement, RFC 9728). Needs validation with mcp-erpnext: wire auth config, test scope-per-tool (e.g. `erpnext:read` vs `erpnext:write`), document setup. Prerequisite for multi-user deployment. |
| Customer 360 viewer | New viewer | All docs for one customer in one view (orders, invoices, payments, contacts) — uses `sendMessage` heavily |
| Employee Card viewer | New viewer | Fiche employee with attendance, leaves, salary, expenses |
| BOM Cost Breakdown | chart-viewer (treemap) | Bill of Materials cost hierarchy |
| Bank Reconciliation Status | New viewer | Match bank transactions to GL entries |
| HR Overview | kpi-viewer + chart-viewer | Headcount, attendance, leave balance |
| Stock Ledger Timeline | chart-viewer (line) + doclist-viewer | Stock movements over time with drill-down |
| Gantt Viewer | New viewer | Project / task timeline (horizontal bars) |

### TIER 3 — Ideas / Nice-to-have (P2)

- Manufacturing dashboard (Work Order status, machine utilization)
- Multi-currency reconciliation viewer
- Approval queue viewer (pending approvals across doctypes)
- Webhook event log viewer

---

## Architecture Notes

- Each KPI is a **separate tool call** — NO aggregated dashboard tool
- PML Feed composes multiple viewer iframes -> user gets a dashboard
- New viewers follow the pattern: `src/ui/{name}/src/{Name}.tsx`
- Shared atoms: `~/shared/ActionButton.tsx`, `~/shared/InfoField.tsx`, `~/shared/theme.ts`, `~/shared/ErpNextBrand.tsx`
- Viewer-local molecules in `src/ui/{name}/src/components/` (e.g. `InlineDetailPanel`, `ChipFilters`, `StatusCell`)
- Server-driven row actions: `_rowAction` and `_sendMessageHints` auto-injected by `ui-refresh.ts` for all known DocTypes
- MCP App protocol: `new App()`, `app.ontoolresult`, parse JSON from `content[0].text`
- `animationDuration={0}` on all Recharts components (no fade-in)
- Register viewer name in `lib/erpnext/server.ts` UI_VIEWERS array
- Interactive tool calls use `app.callServerTool()` from `@modelcontextprotocol/ext-apps`
- Cross-viewer navigation uses `app.sendMessage()` to inject follow-up queries
- `kanban-viewer` is the canonical read-write viewer with accent-colored cards, tone-aware badges, and column-colored move buttons
- Card `accent` field maps to column color for the top accent strip; badge `tone` maps to semantic colors (error/warning/success/info/neutral)
- Move action buttons display a colored dot matching the destination column's color for visual orientation

## Sources
- [MCP Apps SDK](https://github.com/modelcontextprotocol/ext-apps) — `@modelcontextprotocol/ext-apps`
- [MCP Apps Specification (2026-01-26)](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx)
- [Frappe Forum — Dashboard Options](https://discuss.frappe.io/t/dashboard-options-for-erpnext/70454)
- [Frappe Forum — KPI Dashboard](https://discuss.frappe.io/t/how-i-created-this-sales-kpi-dashboard/33252)
- [GitHub — AR Aging Issues](https://github.com/frappe/erpnext/issues/45830)
- [Mint — Better Bank Reconciliation](https://github.com/The-Commit-Company/mint)
- [ERPNext Procurement Tracker](https://techfordai.com/procurement-tracker-in-erpnext/)
