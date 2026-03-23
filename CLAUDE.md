# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MCP server for ERPNext/Frappe ERP — 120 tools across 14 categories with 7 interactive UI viewers. Connects MCP-compatible AI agents to ERPNext via the Model Context Protocol. Published as `@casys/mcp-erpnext` on npm (Node bundle) and JSR (Deno).

## Commands

```bash
# Run all tests
deno test --allow-all src/

# Run a single test file
deno test --allow-all src/tools/sales_test.ts

# Type check
deno check mod.ts server.ts

# Start HTTP server (dev)
deno task serve

# Build UI viewers (from src/ui/)
cd src/ui && npm install && node build-all.mjs

# Build Node.js npm bundle
deno task ui:build && ./scripts/build-node.sh

# Dev a specific UI viewer with HMR
cd src/ui && npm run dev:kanban   # also: dev:invoice, dev:stock, dev:doclist
```

## Architecture

### Dual-runtime design

The project runs on **Deno** (development/JSR) and **Node.js** (npm). Platform-specific APIs are abstracted through a runtime adapter:
- `src/runtime.ts` — Deno implementation (uses `Deno.env`, `Deno.readTextFile`, etc.)
- `src/runtime.node.ts` — Node.js implementation (uses `process.env`, `node:fs`)

The build script `scripts/build-node.sh` swaps `runtime.ts` with `runtime.node.ts`, strips `.ts` extensions from imports, and produces a single esbuild bundle at `dist-node/bin/mcp-erpnext.mjs`.

**All source code imports `from "./runtime.ts"` — never import Deno or Node APIs directly.**

### Tool architecture

Each tool is an `ErpNextTool` object (`src/tools/types.ts`) with: `name`, `description`, `category`, `inputSchema` (JSON Schema), `handler`, and optional `_meta` (UI viewer binding). Tools are grouped by category in individual files under `src/tools/`, registered in `src/tools/mod.ts`, and exposed through `ErpNextToolsClient` (`src/client.ts`).

Tool naming: `erpnext_{entity}_{operation}` (e.g. `erpnext_customer_list`, `erpnext_sales_order_create`).

The `handler` receives `(input, ctx)` where `ctx.client` is the `FrappeClient` singleton. The client is lazily initialized from env vars on first use.

### Frappe REST client

`src/api/frappe-client.ts` is a zero-dependency HTTP client wrapping the Frappe REST API. Key methods: `list()`, `get()`, `create()`, `update()`, `delete()`, `callMethod()`. All errors throw `FrappeAPIError` with HTTP status and parsed body — no silent fallbacks.

**Submit handlers must GET the doc first** to pass `modified` for Frappe's optimistic locking (see `docs/known-issues.md`). Cancel does not need this.

### Kanban system

The kanban viewer is the canonical read-write MCP App. Architecture:
- `src/kanban/types.ts` — shared contracts (`KanbanBoard`, `KanbanCard`, `KanbanAdapter`, etc.)
- `src/kanban/definitions.ts` — board registry (Task, Opportunity, Issue)
- `src/kanban/adapters/{task,opportunity,issue}.ts` — per-DocType adapters that define columns, transitions, card mapping, and move execution
- `src/tools/kanban.ts` — two tools (`erpnext_kanban_get_board`, `erpnext_kanban_move_card`) that dispatch to the right adapter

To add a new kanban DocType: create an adapter in `src/kanban/adapters/`, register it in `definitions.ts`, and add it to the `ADAPTERS` map in `src/tools/kanban.ts`.

Card design conventions:
- **Accent strip**: 3px colored bar at top of each card, color from `card.accent` (matches column color)
- **Badge tones**: `tone` field maps to semantic colors — `error` (red), `warning` (amber), `success` (green), `info` (blue), `neutral` (muted)
- **Metrics**: Vertical layout with micro-caps labels (9px uppercase) and mono bold values
- **Move buttons**: Integrated card footer with column-colored destination dots (6px circles matching target column color)
- **Column focus mode**: On viewports ≤920px, switches to single-column tab navigation. Drag-and-drop is disabled; only button-based moves are available

### UI viewers

7 React viewers built with Vite, bundled as single HTML files via `vite-plugin-singlefile`. Located under `src/ui/{viewer-name}/`. Built output goes to `src/ui/dist/{viewer-name}/index.html`.

Viewers use the MCP Apps SDK (`@modelcontextprotocol/ext-apps`). Interactive viewers use `app.callServerTool()` for mutations and `app.sendMessage()` for cross-viewer navigation.

All viewers carry a `refreshRequest` payload for safe revalidation (injected by `src/tools/ui-refresh.ts`).

Registered in `src/ui/viewers.ts` — add new viewer names there and in `server.ts`'s resource loop.

### Server bootstrap

`server.ts` creates a `ConcurrentMCPServer` (from `@casys/mcp-server`), registers all tools + UI resources, and starts in stdio or HTTP mode. Supports `--http`, `--port=`, `--hostname=`, and `--categories=` flags.

## Testing patterns

Tests use Deno's built-in test runner with `jsr:@std/assert`. All tests mock `FrappeClient` — no real network calls. Pattern:

```typescript
function makeMockClient(overrides = {}) {
  return { list: async () => [], get: async () => ({...}), ...overrides } as unknown as FrappeClient;
}
const ctx = { client: makeMockClient({ list: async () => [...] }) };
const result = await tool.handler(input, ctx);
```

Test files are colocated with source files (Deno convention): `src/tools/sales_test.ts` tests `src/tools/sales.ts`.

## CI/CD

GitHub Actions workflow (`.github/workflows/publish.yml`) publishes to JSR and npm on push to `main`. It builds UI viewers, then runs `build-node.sh` for the npm bundle.

## Key conventions

- Tool `_meta.ui.resourceUri` binds a tool's output to a specific UI viewer (e.g. `"ui://mcp-erpnext/doclist-viewer"`)
- `FrappeFilter` is a `[field, operator, value]` tuple for Frappe list queries
- Generic operations tools (`erpnext_doc_*`) are the escape hatch for any DocType not yet wrapped with dedicated tools
- Environment variables: `ERPNEXT_URL`, `ERPNEXT_API_KEY`, `ERPNEXT_API_SECRET` (all required)
