# Changelog

All notable changes to `@casys/mcp-erpnext` will be documented in this file.

## [2.1.0] - 2026-03-23

### Added

- **Cross-viewer navigation** — all 7 viewers now support `sendMessage` for drill-down into related documents. Click a row, item, data point, or KPI to navigate to another viewer.
- **Inline detail panels** — `doclist-viewer`, `invoice-viewer`, and `stock-viewer` expand rows to show full document details with action buttons (Submit, Cancel, Payments).
- **Chip filters** — `doclist-viewer` auto-detects status/category columns and renders clickable filter chips.
- **Interactive charts** — click bar/pie/line/area data points in `chart-viewer` to drill into underlying documents via `sendMessage`.
- **KPI drill-down** — click the big number or sparkline in `kpi-viewer` for exception lists or trend charts.
- **Funnel redesign** — trapezoid stages with CSS clip-path, gradient fills, ambient glow on hover, conversion badges with colored arrows, and click-through navigation.
- **structuredContent** — viewer tools return both `content` (JSON text for LLM) and `structuredContent` (data object for MCP Apps viewers). Viewers prefer `structuredContent` with fallback.
- **ToolAnnotations** — 95 tools annotated with `readOnlyHint` (list/get/analytics) and `destructiveHint` (submit/cancel/delete).
- **Shared components** — `ActionButton` (confirm pattern) and `InfoField` (key-value display) in `~/shared/` for reuse across viewers.
- **VS Code Copilot config** — `.vscode/mcp.json` example added to README.
- **ERPNext Cloud docs** — documented compatibility with Frappe Cloud / erpnext.com instances.
- **`docs/tools.md`** — full tool reference moved out of README for readability.

### Changed

- **@casys/mcp-server upgraded to 0.12.0** — uses `toolErrorMapper`, `MCPToolMeta`, `uiMeta()`, `ToolAnnotations` from the framework.
- **`viewer-meta.ts`** — single source of truth for viewer URIs using `uiMeta()` from `@casys/mcp-server`. Replaces 91 inline `_meta` objects.
- **Error handling** — moved from try/catch in `buildHandlersMap()` to `toolErrorMapper` in server config. Frappe API errors are surfaced with full detail.
- **Doclist column cap** — max 6 visible columns (prioritized: name, status, customer, grand_total, dates). Extra fields visible in detail panel.
- **Invoice viewer redesign** — two-column party layout, inline dates, `FeedbackBanner`, action loading tracked per key, inspired by mcp-einvoice pattern.
- **Node build** — uses `npx jsr add` instead of npm for JSR dependency resolution (fixes `@casys/mcp-compose` transitive dep).
- **Tests colocated** — all 22 test files moved from `tests/` to sit next to their source (Deno convention).
- **README condensed** — tools section replaced with compact category table.

### Fixed

- **VS Code Copilot schema validation (#2)** — `erpnext_doc_list` filters array was missing inner `items` schema. Strict JSON Schema validators no longer reject the tool.
- **Error messages** — "Tool execution failed" replaced with actual Frappe API error messages (e.g. "UOM 'Nos' not found").
- **Chart currency** — `formatCurrency()` now passes `data.currency` instead of defaulting to USD.
- **Funnel height clipping** — replaced `height: 100vh` + `overflow: hidden` with `minHeight: 100vh`.
- **Race conditions** — doclist row detail fetch guards against stale responses when clicking rows quickly.
- **Invoice item expansion** — keyed by line index instead of `item_code` to handle duplicate items.
- **Kanban structuredContent** — replaced inline `extractTextContent` with shared `extractToolResultText` that supports `structuredContent`.

## [0.2.0] - 2026-03-20

### Added

- **Kanban card redesign** — accent-colored top strip (column color), tone-aware badges (error/warning/success/info/neutral with semantic colors), vertical metric layout with micro-caps labels, and integrated action footer with column-colored destination dots.
- **Column-colored move buttons** — each move action button shows a 6px colored dot matching the destination column's color for instant visual orientation.

### Changed

- **Column focus mode improvements** — drag-and-drop is now disabled in focus mode (narrow viewports ≤920px) since only one column is visible. Cards use button-based moves exclusively. Removed unused `onDragOver`/`onDrop` handlers from the focus panel.
- **Cursor affordance** — draggable cards in multi-column mode now show `cursor: grab` (and `grabbing` on drag).

### Fixed

- **Horizontal scroll eliminated** — added `overflow-x: hidden` on `html, body` and the `BoardView` root container, plus `minWidth: 0` on flex children (tabs, panel) to prevent content overflow in column focus mode.

## [0.1.9] - 2026-03-10

### Added

- **Canonical read-write kanban MCP App** — `kanban-viewer` is now the single kanban surface, backed by `erpnext_kanban_get_board` and `erpnext_kanban_move_card`.
- **Kanban adapters for three ERPNext DocTypes** — `Task`, `Opportunity`, and `Issue` now share the same normalized board contract, explicit transition matrices, optimistic reconciliation, and server-authoritative mutation flow.
- **Shared viewer refresh infrastructure** — server-side `refreshRequest` injection plus shared viewer refresh helpers now support safe revalidation for long-lived MCP Apps.
- **Refresh-aware passive viewers** — `doclist-viewer`, `stock-viewer`, `invoice-viewer`, `chart-viewer`, `kpi-viewer`, and `funnel-viewer` now support focus refresh and manual fallback refresh actions.
- **Packaged Node distribution fixes** — the npm/Node bundle now serves the packaged MCP server and embedded UI resources correctly in HTTP mode.

### Changed

- **MCP App positioning** — the library is now documented and structured around the first production-grade read-write ERPNext MCP App flow, rather than around a read-only viewer catalog.
- **Kanban scope** — what started as a `Task` validation path is now extended through the same architecture to `Opportunity` and `Issue`.
- **Documentation consolidation** — `README.md`, `docs/ROADMAP.md`, `docs/coverage.md`, and the kanban design/implementation plans now reflect the live server surface and current viewer/tool counts.

### Removed

- **Legacy order pipeline surface** — `order-pipeline-viewer` has been removed.
- **Legacy pipeline tools** — `erpnext_order_pipeline` and `erpnext_purchase_pipeline` have been removed in favor of the canonical kanban path.

### Fixed

- **JSR viewer packaging** — `src/ui/dist` is now included in JSR publish artifacts so MCP App viewers are available for JSR consumers.
- **Publish workflow safety** — npm publish now fails on real registry errors and only skips when the version is already published.
- **Windows packaged viewer lookup** — resource path resolution now correctly handles Windows file URLs for npm bundle viewer assets.
- **Server metadata version** — MCP server version metadata is aligned to `0.1.9`.
