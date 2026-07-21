# Changelog

All notable changes to `@casys/mcp-erpnext` will be documented in this file.

## [2.5.0](https://github.com/Casys-AI/mcp-erpnext/compare/v2.4.2...v2.5.0) (2026-07-21)

### Features

- **Human-readable link filters** — tools filtering on a Link field (employee,
  customer, supplier, item, plus dynamic-link fields like Payment Entry's
  `party` or Quotation's `party_name`) now accept a name/email, not just the
  document ID, and resolve it server-side in the same call — no more
  list-then-filter round trip. Ambiguous matches surface the candidate list
  instead of silently guessing, and write paths never fuzzy-match. Thanks
  [@notnotkeshav](https://github.com/notnotkeshav) (#9).
- **Date-range filters** — `date_from`/`date_to` added to 10 list tools that
  lacked them (timesheet, project, task, leave application, payroll entry,
  expense claim, asset, campaign, quotation, supplier quotation). Thanks
  [@notnotkeshav](https://github.com/notnotkeshav) (#7).
- **Pluggable cache layer** — `FrappeClient.list()`/`.get()` are cached through
  a pluggable `Cache` (in-process `MemoryCache` by default, `NoopCache` to
  disable), with automatic invalidation on create/update/delete/submit/cancel
  and optional startup warming. Config: `MCP_CACHE_ENABLED`, `MCP_CACHE_TTL_MS`,
  `MCP_CACHE_WARM_TOOLS`. Thanks
  [@notnotkeshav](https://github.com/notnotkeshav) (#6).

## [2.4.2](https://github.com/Casys-AI/mcp-erpnext/compare/v2.4.1...v2.4.2) (2026-07-21)

### Bug Fixes

- **http:** HTTP mode (`--http`) now binds to `127.0.0.1` by default instead of
  `0.0.0.0`. The server — and every tool, which acts with the server's ERPNext
  API key — is no longer reachable from the whole network unless exposure is
  explicitly opted into via `--hostname=0.0.0.0`, matching MCP security best
  practice. A startup warning is printed when binding to a non-loopback
  interface. Docker deployments must pass `--hostname=0.0.0.0` in the container
  command. Thanks @notnotkeshav for surfacing the exposure gap (#8, #10).

## [2.4.1](https://github.com/Casys-AI/mcp-erpnext/compare/v2.4.0...v2.4.1) (2026-07-16)

### Features

- **`erpnext_doc_unassign`** removes one user's native assignment on any DocType
  via `frappe.desk.form.assign_to.remove` (closes the ToDo, resyncs `_assign`)
  and returns the remaining open assignments. Idempotent on the Frappe side.
  Tool count 122 → 123.
- **kanban-viewer:** per-assignee unassign (×) button in the detail modal, with
  busy/error states.

### Bug Fixes

- **kanban-viewer:** Frappe v16 omits `_assign` from single-doc GET responses —
  the detail modal now rebuilds it from the authoritative assignment result
  (assign and unassign), and treats an explicit empty `_assign` as truly
  unassigned so a just-removed assignee no longer reappears.

## [2.4.0](https://github.com/Casys-AI/mcp-erpnext/compare/v2.3.1...v2.4.0) (2026-07-16)

### Bug Fixes

- **npm/HTTP:** `npx @casys/mcp-erpnext --http` no longer crashes on Node.js
  with `ReferenceError: Deno is not defined`. The npm bundle now consumes
  `@casys/mcp-server`'s own npm build (Node-clean) instead of re-bundling its
  Deno/JSR source, and both packages select their runtime adapter at load time
  instead of a build-time file swap. `build-node.sh` fails fast if the resolved
  `@casys/mcp-server` predates 0.21.1 (first Node-clean release). Thanks
  [@dennypradipta](https://github.com/dennypradipta) for the report and the
  workaround docs ([#4](https://github.com/Casys-AI/mcp-erpnext/pull/4)).

### Features

- **native Frappe assignment across doctypes.** `erpnext_doc_assign` assigns any
  document via `frappe.desk.form.assign_to.add` (permissions, ToDo, realtime
  notifications, and assignment emails preserved), with assignee validation and
  native ToDo IDs in the response. `erpnext_user_list` lists enabled users. The
  kanban detail modal gains an assignee section with a user dropdown
  ([#5](https://github.com/Casys-AI/mcp-erpnext/pull/5)). Based on
  [@mateotiedra](https://github.com/mateotiedra)'s Task-assignment
  implementation ([#3](https://github.com/Casys-AI/mcp-erpnext/pull/3)) — thanks
  Mateo!
- migrate to `@casys/mcp-server` ^0.21 and the `McpApp` API (the deprecated
  `ConcurrentMCPServer` alias is no longer used); audited the deprecated
  Sampling / Logging / Roots capabilities — none used (migration plan §1–2).

## [2.3.1](https://github.com/Casys-AI/mcp-erpnext/compare/v2.3.0...v2.3.1) (2026-05-29)

### Bug Fixes

- **analytics:** `erpnext_stock_chart` no longer fails (HTTP 417) when filtering
  by `item_group`. `Bin` has no `item_group` field, so the group is resolved to
  item codes via `Item` and filtered in memory.

### Documentation

- **readme:** add status badges (JSR, npm, CI, MCP, license) and a Screenshots
  gallery of the 7 interactive viewers.
- add community health files: `SECURITY.md`, `CONTRIBUTING.md`,
  `CODE_OF_CONDUCT.md`, issue forms, and a pull request template.
- **roadmap:** add the "NEXT — Platform integration" milestone (MCP bridge,
  ERP-agnostic core, Zitadel OIDC auth).

## [2.3.0](https://github.com/Casys-AI/mcp-erpnext/compare/v2.2.2...v2.3.0) (2026-05-14)

### Features

- add missing tests and doclist-viewer component re-exports
  ([a5f714f](https://github.com/Casys-AI/mcp-erpnext/commit/a5f714fbdc5e2234635f2626fcca615704e965cd))
- add ToolAnnotations (readOnlyHint, destructiveHint) to all tools
  ([386e28b](https://github.com/Casys-AI/mcp-erpnext/commit/386e28b9b687f3e99e0593878cdf51abf7a112e0))
- **chart-viewer:** add data point click drill-down and fix currency
  ([09b3519](https://github.com/Casys-AI/mcp-erpnext/commit/09b35194ff88b91bc0ba6f708efa8e461cc12824))
- **doclist-viewer:** add inline detail, row actions, sendMessage, chip filters
  ([121a723](https://github.com/Casys-AI/mcp-erpnext/commit/121a723edc071e40939b896c5d325171e636731c))
- **frappe-client:** retry transient reads
  ([699ecdf](https://github.com/Casys-AI/mcp-erpnext/commit/699ecdf3848e219a8a1a5f093031895d62d63a8a))
- **funnel-viewer:** add stage click drill-down via sendMessage
  ([ea7612e](https://github.com/Casys-AI/mcp-erpnext/commit/ea7612e9620c976501e6f4ba1bc350dfa82524e1))
- **funnel-viewer:** redesign with trapezoid clip-path, gradients, and action
  buttons
  ([2b0bc1d](https://github.com/Casys-AI/mcp-erpnext/commit/2b0bc1ddcd7ba9e5d7826ae80f11ea792823930b))
- **invoice-viewer:** add item drill-down, actions, sendMessage navigation
  ([ac44542](https://github.com/Casys-AI/mcp-erpnext/commit/ac44542da1baae63106b1a46c4bcb4e3d80688b4))
- **kanban-viewer:** replace fire-and-forget actions with sendMessage
  ([cc4e43b](https://github.com/Casys-AI/mcp-erpnext/commit/cc4e43bc3c80b03c7182db82658e109fc3a5df89))
- **kanban:** enrich card fields for all three doctypes
  ([4bfbfdd](https://github.com/Casys-AI/mcp-erpnext/commit/4bfbfdd30d7bd40f98f0668263a071e60ec263f0))
- **kanban:** enrich cards, add detail modal, and improve tab navigation
  ([0638ce1](https://github.com/Casys-AI/mcp-erpnext/commit/0638ce185457347f7571796c2e6ad46d78fde43a))
- **kanban:** enrich cards, detail modal, and tab navigation
  ([cb4a938](https://github.com/Casys-AI/mcp-erpnext/commit/cb4a938be4d787de1c69e241077a70580b819414))
- **kanban:** integrate column focus layout for narrow viewports
  ([efbf288](https://github.com/Casys-AI/mcp-erpnext/commit/efbf288274c546606f86200b0cb5ed5a0375aacf))
- **kanban:** proper form controls for each field type in detail modal
  ([2f0bd39](https://github.com/Casys-AI/mcp-erpnext/commit/2f0bd39a8d015c1db71e77b3f9de9565ed8ce887))
- **kanban:** redesign cards, branding, and focus mode UX
  ([4bf5f20](https://github.com/Casys-AI/mcp-erpnext/commit/4bf5f20ed695d9eb09d484240d3c1b581ebb94d4))
- **kanban:** redesign detail modal with Jira-style layout
  ([2c52adf](https://github.com/Casys-AI/mcp-erpnext/commit/2c52adf6f5c8cd8c6383f17d0e99196a68c44a68))
- **kanban:** redesign detail modal with polished form layout
  ([c083487](https://github.com/Casys-AI/mcp-erpnext/commit/c0834876f23bf1bfdbb5a27ae6832387dde07ec5))
- **kpi-viewer:** add drill-down on big number and sparkline click
  ([6e771d0](https://github.com/Casys-AI/mcp-erpnext/commit/6e771d0aaab7ed2465a24808aefeb36cc1d92224))
- **stock-viewer:** add stock detail panel with item info and sendMessage
  ([932e894](https://github.com/Casys-AI/mcp-erpnext/commit/932e894cc5ad21cca001a4524d71c2c3c9138ff9))

### Bug Fixes

- add missing items schema for filters array (closes
  [#2](https://github.com/Casys-AI/mcp-erpnext/issues/2))
  ([40b865f](https://github.com/Casys-AI/mcp-erpnext/commit/40b865fd85cf680abf2b3cb7c217876c2f1ca10b))
- **doclist-viewer:** cap visible columns at 6, prioritize key fields
  ([37b80bc](https://github.com/Casys-AI/mcp-erpnext/commit/37b80bc3b7d8ab1d7e3f17584328acc5ff31281b))
- **funnel-viewer:** replace height:100vh with minHeight to prevent content
  clipping
  ([76e7d9a](https://github.com/Casys-AI/mcp-erpnext/commit/76e7d9ada4bfcbac4f7440fb437f69154d46a95e))
- iframe infinite resize in all viewers and remove invalid Lead source field
  ([25e443e](https://github.com/Casys-AI/mcp-erpnext/commit/25e443e5560d4c95d27b6cdd4353a240ee158b8e))
- import ToolAnnotations from @casys/mcp-server, add structuredContent tests
  ([98d2eb1](https://github.com/Casys-AI/mcp-erpnext/commit/98d2eb1fc43ae226e49a7d91d4f56bc8fce65221))
- **kanban-viewer:** guard detail save tool calls
  ([b8777d9](https://github.com/Casys-AI/mcp-erpnext/commit/b8777d9a9bbd3b49c9242cca1e2b4a6742026785))
- **kanban-viewer:** use shared extractToolResultText for structuredContent
  support
  ([a66f97b](https://github.com/Casys-AI/mcp-erpnext/commit/a66f97b3530eb57c8ba03b39b5524abc7727e61e))
- **kanban:** bump min-height to 600px for better modal display
  ([c591eb1](https://github.com/Casys-AI/mcp-erpnext/commit/c591eb173621b6e4e3002d6de6e9ceaf8dae08bc))
- **kanban:** redesign detail modal and fix save
  ([b829df9](https://github.com/Casys-AI/mcp-erpnext/commit/b829df9b0dc83285a5ff84f98cc20cb76b2eae43))
- **kanban:** remove stale capabilities gate blocking save and actions
  ([b10d35b](https://github.com/Casys-AI/mcp-erpnext/commit/b10d35b264ade49d3cbd0f9d6e33059dda6861c0))
- **kanban:** set min-height 480px so detail modal has room to display
  ([c348cb6](https://github.com/Casys-AI/mcp-erpnext/commit/c348cb6c579f7d89759df62c9025183e8b791d22))
- **kanban:** unwrap doc_get data envelope and fix modal action buttons
  ([b67bf0f](https://github.com/Casys-AI/mcp-erpnext/commit/b67bf0f2aa338d7f02eed35af6e7498c3d66aead))
- pin @casys/mcp-server version constraint for JSR publish
  ([2782e80](https://github.com/Casys-AI/mcp-erpnext/commit/2782e80a5362602704d7468129b3fecbf481eff7))
- remove uiMeta() import from viewer-meta (mcp-compose not on npm)
  ([89d20ff](https://github.com/Casys-AI/mcp-erpnext/commit/89d20ff1a40b344bf9cf14e01fcd9d439b203625))
- structuredContent for all viewer tools + dead code cleanup
  ([b9ab6cc](https://github.com/Casys-AI/mcp-erpnext/commit/b9ab6ccebd2c4f4d18c316cac1c480fdbf9c1b64))
- surface Frappe error messages instead of generic "Tool execution failed"
  ([b4ef624](https://github.com/Casys-AI/mcp-erpnext/commit/b4ef624818ed8f70a1827ccd4382c04ac58c9c3a))
- update build-node.sh to use @casys/mcp-server@^0.12.0
  ([525a084](https://github.com/Casys-AI/mcp-erpnext/commit/525a084aebcac29bfbfae6820f2262564d8231e9))
- use npx jsr add for Node build to resolve JSR transitive deps
  ([fcbaa38](https://github.com/Casys-AI/mcp-erpnext/commit/fcbaa382858e8c15c84021817eb2e970e0b262a6))

### Refactoring

- colocate tests with source files (Deno convention)
  ([35643e9](https://github.com/Casys-AI/mcp-erpnext/commit/35643e9a3622f9fa67c5544ba0d027535dead5cb))
- replace 91 inline _meta with shared viewer-meta constants
  ([076ecba](https://github.com/Casys-AI/mcp-erpnext/commit/076ecba75e499eab5aee8a0004a5303da847ee2e))
- replace 91 inline _meta with shared viewer-meta constants via uiMeta()
  ([dff32fa](https://github.com/Casys-AI/mcp-erpnext/commit/dff32faaeb2ff93923599d40540247a4ce6a1031))
- **sales:** dedupe line item mapping
  ([22774bb](https://github.com/Casys-AI/mcp-erpnext/commit/22774bbc5cf6351327b4f3281c5806c7f528453e))
- use toolErrorMapper and widen tool types for annotations
  ([db4b4ba](https://github.com/Casys-AI/mcp-erpnext/commit/db4b4ba44097c0085e697ae1c2b64744555239de))
- use uiMeta() from @casys/mcp-server in viewer-meta constants
  ([428bb52](https://github.com/Casys-AI/mcp-erpnext/commit/428bb52812ef0d6c9822e2b3c92837de51e3ca0c))

### Documentation

- add v2.1.0 changelog
  ([15527fc](https://github.com/Casys-AI/mcp-erpnext/commit/15527fcd81843a8190e216d86f62e6937ecf589a))
- clarify release workflow
  ([9c3bf88](https://github.com/Casys-AI/mcp-erpnext/commit/9c3bf88796de68f08e2afafbf51fc386eb7a03a8))
- condense README tools section, add docs/tools.md full reference
  ([b109860](https://github.com/Casys-AI/mcp-erpnext/commit/b1098603d60a1f19548299f987f354fa356b582f))
- document ERPNext Cloud compatibility and update env vars
  ([38e9ba0](https://github.com/Casys-AI/mcp-erpnext/commit/38e9ba019cdaae5f71d2fb23ed67adeedfcc5b96))
- mark P0 and P1 refactoring as done in refacto plan
  ([78e57b9](https://github.com/Casys-AI/mcp-erpnext/commit/78e57b98d439f960c8a2a8df1c66936eace543da))
- move project guidelines to AGENTS.md, add versioning conventions
  ([b322a5b](https://github.com/Casys-AI/mcp-erpnext/commit/b322a5b8af90b6c5d4a094040a151da6665861de))
- normalize project documentation
  ([a9184fe](https://github.com/Casys-AI/mcp-erpnext/commit/a9184feb9937c858343c39673567f5e065804245))
- update ROADMAP with TIER 1b cross-viewer navigation (all 7 viewers done)
  ([995a0f1](https://github.com/Casys-AI/mcp-erpnext/commit/995a0f11f8e5ffb5a1a5692d9aee979d4960764c))
- wrap Claude entrypoint
  ([377947c](https://github.com/Casys-AI/mcp-erpnext/commit/377947cc42a9df716c72af1199dfb3369c2b7f85))

## [2.1.0] - 2026-03-23

### Added

- **Cross-viewer navigation** — all 7 viewers now support `sendMessage` for
  drill-down into related documents. Click a row, item, data point, or KPI to
  navigate to another viewer.
- **Inline detail panels** — `doclist-viewer`, `invoice-viewer`, and
  `stock-viewer` expand rows to show full document details with action buttons
  (Submit, Cancel, Payments).
- **Chip filters** — `doclist-viewer` auto-detects status/category columns and
  renders clickable filter chips.
- **Interactive charts** — click bar/pie/line/area data points in `chart-viewer`
  to drill into underlying documents via `sendMessage`.
- **KPI drill-down** — click the big number or sparkline in `kpi-viewer` for
  exception lists or trend charts.
- **Funnel redesign** — trapezoid stages with CSS clip-path, gradient fills,
  ambient glow on hover, conversion badges with colored arrows, and
  click-through navigation.
- **structuredContent** — viewer tools return both `content` (JSON text for LLM)
  and `structuredContent` (data object for MCP Apps viewers). Viewers prefer
  `structuredContent` with fallback.
- **ToolAnnotations** — 95 tools annotated with `readOnlyHint`
  (list/get/analytics) and `destructiveHint` (submit/cancel/delete).
- **Shared components** — `ActionButton` (confirm pattern) and `InfoField`
  (key-value display) in `~/shared/` for reuse across viewers.
- **VS Code Copilot config** — `.vscode/mcp.json` example added to README.
- **ERPNext Cloud docs** — documented compatibility with Frappe Cloud /
  erpnext.com instances.
- **`docs/tools.md`** — full tool reference moved out of README for readability.

### Changed

- **@casys/mcp-server upgraded to 0.12.0** — uses `toolErrorMapper`,
  `MCPToolMeta`, `uiMeta()`, `ToolAnnotations` from the framework.
- **`viewer-meta.ts`** — single source of truth for viewer URIs using `uiMeta()`
  from `@casys/mcp-server`. Replaces 91 inline `_meta` objects.
- **Error handling** — moved from try/catch in `buildHandlersMap()` to
  `toolErrorMapper` in server config. Frappe API errors are surfaced with full
  detail.
- **Doclist column cap** — max 6 visible columns (prioritized: name, status,
  customer, grand_total, dates). Extra fields visible in detail panel.
- **Invoice viewer redesign** — two-column party layout, inline dates,
  `FeedbackBanner`, action loading tracked per key, inspired by mcp-einvoice
  pattern.
- **Node build** — uses `npx jsr add` instead of npm for JSR dependency
  resolution (fixes `@casys/mcp-compose` transitive dep).
- **Tests colocated** — all 22 test files moved from `tests/` to sit next to
  their source (Deno convention).
- **README condensed** — tools section replaced with compact category table.

### Fixed

- **VS Code Copilot schema validation (#2)** — `erpnext_doc_list` filters array
  was missing inner `items` schema. Strict JSON Schema validators no longer
  reject the tool.
- **Error messages** — "Tool execution failed" replaced with actual Frappe API
  error messages (e.g. "UOM 'Nos' not found").
- **Chart currency** — `formatCurrency()` now passes `data.currency` instead of
  defaulting to USD.
- **Funnel height clipping** — replaced `height: 100vh` + `overflow: hidden`
  with `minHeight: 100vh`.
- **Race conditions** — doclist row detail fetch guards against stale responses
  when clicking rows quickly.
- **Invoice item expansion** — keyed by line index instead of `item_code` to
  handle duplicate items.
- **Kanban structuredContent** — replaced inline `extractTextContent` with
  shared `extractToolResultText` that supports `structuredContent`.

## [0.2.0] - 2026-03-20

### Added

- **Kanban card redesign** — accent-colored top strip (column color), tone-aware
  badges (error/warning/success/info/neutral with semantic colors), vertical
  metric layout with micro-caps labels, and integrated action footer with
  column-colored destination dots.
- **Column-colored move buttons** — each move action button shows a 6px colored
  dot matching the destination column's color for instant visual orientation.

### Changed

- **Column focus mode improvements** — drag-and-drop is now disabled in focus
  mode (narrow viewports ≤920px) since only one column is visible. Cards use
  button-based moves exclusively. Removed unused `onDragOver`/`onDrop` handlers
  from the focus panel.
- **Cursor affordance** — draggable cards in multi-column mode now show
  `cursor: grab` (and `grabbing` on drag).

### Fixed

- **Horizontal scroll eliminated** — added `overflow-x: hidden` on `html, body`
  and the `BoardView` root container, plus `minWidth: 0` on flex children (tabs,
  panel) to prevent content overflow in column focus mode.

## [0.1.9] - 2026-03-10

### Added

- **Canonical read-write kanban MCP App** — `kanban-viewer` is now the single
  kanban surface, backed by `erpnext_kanban_get_board` and
  `erpnext_kanban_move_card`.
- **Kanban adapters for three ERPNext DocTypes** — `Task`, `Opportunity`, and
  `Issue` now share the same normalized board contract, explicit transition
  matrices, optimistic reconciliation, and server-authoritative mutation flow.
- **Shared viewer refresh infrastructure** — server-side `refreshRequest`
  injection plus shared viewer refresh helpers now support safe revalidation for
  long-lived MCP Apps.
- **Refresh-aware passive viewers** — `doclist-viewer`, `stock-viewer`,
  `invoice-viewer`, `chart-viewer`, `kpi-viewer`, and `funnel-viewer` now
  support focus refresh and manual fallback refresh actions.
- **Packaged Node distribution fixes** — the npm/Node bundle now serves the
  packaged MCP server and embedded UI resources correctly in HTTP mode.

### Changed

- **MCP App positioning** — the library is now documented and structured around
  the first production-grade read-write ERPNext MCP App flow, rather than around
  a read-only viewer catalog.
- **Kanban scope** — what started as a `Task` validation path is now extended
  through the same architecture to `Opportunity` and `Issue`.
- **Documentation consolidation** — `README.md`, `docs/ROADMAP.md`,
  `docs/coverage.md`, and the kanban design/implementation plans now reflect the
  live server surface and current viewer/tool counts.

### Removed

- **Legacy order pipeline surface** — `order-pipeline-viewer` has been removed.
- **Legacy pipeline tools** — `erpnext_order_pipeline` and
  `erpnext_purchase_pipeline` have been removed in favor of the canonical kanban
  path.

### Fixed

- **JSR viewer packaging** — `src/ui/dist` is now included in JSR publish
  artifacts so MCP App viewers are available for JSR consumers.
- **Publish workflow safety** — npm publish now fails on real registry errors
  and only skips when the version is already published.
- **Windows packaged viewer lookup** — resource path resolution now correctly
  handles Windows file URLs for npm bundle viewer assets.
- **Server metadata version** — MCP server version metadata is aligned to
  `0.1.9`.
