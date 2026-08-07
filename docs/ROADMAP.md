# ERPNext MCP — Roadmap

## Platform Integration (current focus)

The viewer and tooling layer is mature. This phase turns hvgerp-mcp from a
single-instance stdio/HTTP server into a multi-tenant, ERP-agnostic platform
reachable through a shared MCP bridge with real identity.

| Item                    | Description                                                                                                                                                                                                                      | Status      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| **MCP bridge wiring**   | Connect to a Deno Deploy relay (local tunnel → cloud → host) so viewers and KPI feeds can be published and shared outside a single host session, not just spawned per-client over stdio.                                         | In progress |
| **ERP-agnostic core**   | Extract the Frappe/ERPNext REST client behind an adapter interface so the same tool catalog and viewers can target other ERP backends. ERPNext becomes the first adapter rather than a hard dependency.                          | Next        |
| **Zitadel auth (OIDC)** | Wire [Zitadel](https://zitadel.com) as the OAuth2/OIDC provider for the HTTP transport: JWT/JWKS validation and per-tool scope enforcement (`erpnext:read` vs `erpnext:write`). Prerequisite for multi-tenant bridge deployment. | Done        |

## Interactive Additions (P0)

Core mutations and drill-down navigation are shipped across all seven viewers.
What remains:

| Interaction                | Viewer                         | Tool Called                            | Description                                                                                            |
| -------------------------- | ------------------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Inline cell edit**       | doclist-viewer                 | `erpnext_doc_update`                   | Double-click a cell → inline edit → save as PATCH via `erpnext_doc_update({ doctype, name, fields })`. |
| **Quick actions**          | doclist-viewer, invoice-viewer | `erpnext_sales_invoice_create`         | "Create Invoice from SO" and "Mark as Paid" contextual buttons. (Submit and Cancel are already wired.) |
| **Replenish shortcut**     | stock-viewer                   | `erpnext_stock_entry_create`           | "Replenish" button in the stock detail panel → Material Receipt entry.                                 |
| **Funnel → Kanban**        | funnel-viewer                  | `sendMessage`                          | "Open kanban" button per funnel stage → sendMessage to kanban-viewer for that DocType.                 |
| **Conversion badge drill** | funnel-viewer                  | `erpnext_doc_list` (via `sendMessage`) | Click a conversion rate badge → list deals lost or stalled at that transition.                         |

## New Viewers & Infrastructure (P1)

| Item                       | Type                                 | Description                                                                                                                                                                                                                                       |
| -------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **HTTP Auth (OAuth/JWT)**  | Infrastructure                       | Wire auth config and test scope-per-tool (`erpnext:read` vs `erpnext:write`) with hvgerp-mcp. `@casys/mcp-server` already has the full pipeline (Bearer/JWT/JWKS, Auth0/Google/GitHub presets, RFC 9728). Prerequisite for multi-user deployment. |
| Customer 360 viewer        | New viewer                           | All docs for one customer in one view — orders, invoices, payments, contacts — via `sendMessage`-heavy composition.                                                                                                                               |
| Employee Card viewer       | New viewer                           | Employee profile with attendance, leaves, salary, and expenses.                                                                                                                                                                                   |
| BOM Cost Breakdown         | chart-viewer (treemap)               | Bill of Materials cost hierarchy.                                                                                                                                                                                                                 |
| Bank Reconciliation Status | New viewer                           | Match bank transactions to GL entries.                                                                                                                                                                                                            |
| HR Overview                | kpi-viewer + chart-viewer            | Headcount, attendance, leave balance.                                                                                                                                                                                                             |
| Stock Ledger Timeline      | chart-viewer (line) + doclist-viewer | Stock movements over time with drill-down.                                                                                                                                                                                                        |
| Gantt Viewer               | New viewer                           | Project/task timeline (horizontal bars).                                                                                                                                                                                                          |

## Ideas / Nice-to-have (P2)

- Manufacturing dashboard (Work Order status, machine utilization)
- Multi-currency reconciliation viewer
- Approval queue viewer (pending approvals across doctypes)
- Webhook event log viewer

## Sources

- [MCP Apps SDK](https://github.com/modelcontextprotocol/ext-apps) —
  `@modelcontextprotocol/ext-apps`
- [MCP Apps Specification (2026-01-26)](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx)
- [Frappe Forum — Dashboard Options](https://discuss.frappe.io/t/dashboard-options-for-erpnext/70454)
- [Frappe Forum — KPI Dashboard](https://discuss.frappe.io/t/how-i-created-this-sales-kpi-dashboard/33252)
- [GitHub — AR Aging Issues](https://github.com/frappe/erpnext/issues/45830)
- [Mint — Better Bank Reconciliation](https://github.com/The-Commit-Company/mint)
- [ERPNext Procurement Tracker](https://techfordai.com/procurement-tracker-in-erpnext/)

## Ideas not yet scheduled

Moved out of the old `known-issues.md`, which mixed roadmap ideas with bug
history.

### Setup wizard automation

A fresh ERPNext instance requires master data before being able to create
transactional documents. The tools `erpnext_company_create` and
`erpnext_doc_create` now exist, but the full workflow is:

1. Create Company
2. Create Price Lists (Standard Selling, Standard Buying)
3. Create Warehouses (or use the ones auto-created by Company)
4. Create Item Groups if needed
5. Create UOMs if non-standard (Nos, Kg, etc. exist by default)

**Idea**: A tool `erpnext_setup_check` that checks that the prerequisites exist
and returns what is missing.

### Retry / error context enrichment

When an operation fails (e.g.: MandatoryError), the handler could:

1. Parse the Frappe error
2. Return a structured message with the missing field
3. Suggest the fix (e.g.: "Add selling_price_list field")

### Rate limits / throttling

No rate limiting on the client side. An agent that loops can bombard the ERPNext
API. `FrappeClient` retries reads on 429/5xx, but does not yet perform global
throttling or per-session request budgeting.

### Integration tests

Current tests are all mocked. Integration tests running against a real ERPNext
(Docker) instance would be needed to validate end-to-end workflows. Suggested
Deno pattern:

```typescript
const runIntegration = Deno.env.get("ERPNEXT_INTEGRATION") === "1";
Deno.test({
  name: "integration: sales order create validates ERPNext defaults",
  ignore: !runIntegration,
  fn: async () => {
    /* requires ERPNEXT_URL, ERPNEXT_API_KEY, ERPNEXT_API_SECRET */
  },
});
```
