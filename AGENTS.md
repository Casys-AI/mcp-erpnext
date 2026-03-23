# AGENTS.md

Repository guidelines for AI coding agents working on this codebase.

- Repo: https://github.com/Casys-AI/mcp-erpnext
- In chat replies, file references must be repo-root relative only (example: `src/tools/sales.ts:42`); never absolute paths.

## Project Overview

MCP server for ERPNext/Frappe ERP — 120+ tools across 14 categories with 7 interactive UI viewers. Connects MCP-compatible AI agents to ERPNext via the Model Context Protocol. Published as `@casys/mcp-erpnext` on npm (Node bundle) and JSR (Deno).

## Project Structure & Module Organization

- **Entry points**: `mod.ts` (JSR public API), `server.ts` (MCP server — stdio + HTTP).
- **Config**: `deno.json` is the primary config (version, tasks, import map). `src/ui/package.json` manages UI-only npm deps (React, Vite, Recharts).
- **Source code**: all under `src/`. Server-side TypeScript uses Deno conventions; UI viewers use Vite/React with standard npm imports.
- **Tool categories**: one file per category under `src/tools/` (`sales.ts`, `inventory.ts`, `accounting.ts`, etc.). All registered in `src/tools/mod.ts`.
- **Tests**: colocated with source files (Deno convention) — `foo.ts` / `foo_test.ts`. Not all modules have tests yet; the convention is the target, not a guarantee.
- **UI viewers**: each viewer is a standalone React app under `src/ui/{viewer-name}/`, bundled to a single HTML file. Built output goes to `src/ui/dist/` (gitignored but included in published artifacts via `deno.json` publish config).
- **Kanban**: `src/kanban/` contains types, definitions, field-utils, and per-DocType adapters in `adapters/`.
- **Runtime adapters**: `src/runtime.ts` (Deno) and `src/runtime.node.ts` (Node.js) — the build script swaps them.
- **Scripts**: `scripts/build-node.sh` produces the npm bundle.
- **Docs**: `docs/` contains roadmap, known issues, and coverage notes.
- Keep UI-only deps in `src/ui/package.json`; do not add them to `deno.json`. Conversely, server-side deps go in the `deno.json` import map.

## Build, Test, and Development Commands

```bash
# Run all tests (also: deno task test)
deno test --allow-all src/

# Run a single test file
deno test --allow-all src/tools/sales_test.ts

# Type check
deno check mod.ts server.ts

# Format (Deno built-in)
deno fmt

# Lint (Deno built-in)
deno lint

# Start HTTP server (dev)
deno task serve                    # --http --port=3012

# Start with MCP inspector
deno task inspect

# Compile to standalone binary
deno task compile

# Build UI viewers
deno task ui:build                 # or: cd src/ui && npm ci && node build-all.mjs

# Build Node.js npm bundle
deno task ui:build && ./scripts/build-node.sh

# Dev a specific UI viewer with HMR
cd src/ui && npm run dev:kanban    # also: dev:invoice, dev:stock, dev:doclist
```

- Runtime baseline: **Deno 2.x** (development), **Node 20+** (npm bundle target — CI uses Node 22).
- If UI deps are missing, run `cd src/ui && npm ci` (prefer `npm ci` over `npm install` for reproducibility).
- Run `deno test --allow-all src/` before pushing when you touch logic.
- Run `deno check mod.ts server.ts` to verify type safety after changes.
- Hard gate: if the change affects the build pipeline or published surfaces, `scripts/build-node.sh` must be tested.

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

Viewers: `invoice-viewer`, `stock-viewer`, `doclist-viewer`, `chart-viewer`, `kpi-viewer`, `funnel-viewer`, `kanban-viewer`. Resource URIs: `ui://mcp-erpnext/{viewer-name}`.

Viewers use the MCP Apps SDK (`@modelcontextprotocol/ext-apps`). Interactive viewers use `app.callServerTool()` for mutations and `app.sendMessage()` for cross-viewer navigation.

All viewers carry a `refreshRequest` payload for safe revalidation (injected by `src/tools/ui-refresh.ts`).

Registered in `src/ui/viewers.ts` — add new viewer names there and in `server.ts`'s resource loop.

### Server bootstrap

`server.ts` creates a `ConcurrentMCPServer` (from `@casys/mcp-server`), registers all tools + UI resources, and starts in stdio or HTTP mode. Supports `--http`, `--port=`, `--hostname=`, and `--categories=` flags.

## Coding Style & Naming Conventions

- Language: TypeScript (Deno-flavored ESM). Prefer strict typing; avoid `any`.
- Formatting/linting: use `deno fmt` and `deno lint`. Respect the exclude rules in `deno.json` (UI `.tsx`/`.mjs` files are excluded from Deno lint).
- **Server-side code** (`src/` except `src/ui/`): all imports use `.ts` extensions (Deno convention). External deps use the import map in `deno.json` (e.g. `import { ... } from "@casys/mcp-server"`). Never add bare npm specifiers in server-side files.
- **UI viewer code** (`src/ui/`): standard npm imports resolved by Vite (e.g. `import { ... } from "react"`). These follow `src/ui/package.json` deps, not the Deno import map.
- Use `import type { ... }` for type-only imports everywhere.
- Tool names: `erpnext_{entity}_{operation}` — snake_case, always prefixed with `erpnext_`.
- Tool categories: one of the 14 registered categories in `src/tools/mod.ts`. New categories require updating the registry.
- Add brief code comments for tricky or non-obvious logic only. Do not add JSDoc/comments to straightforward code.
- Keep files concise; extract helpers rather than letting files bloat.

### Import boundaries

- **Runtime APIs**: always import from `"./runtime.ts"` — never use `Deno.*` or `node:*` directly in source files (only inside the runtime adapters).
- **Tool files**: import `FrappeClient` type from `"../api/frappe-client.ts"`, tool types from `"./types.ts"`, viewer meta from `"./viewer-meta.ts"`.
- **UI viewers**: import from `@modelcontextprotocol/ext-apps` for MCP Apps SDK. Shared components go in `src/ui/shared/`.
- **Kanban adapters**: import types from `../types.ts`, not from other adapters. Each adapter is self-contained.

## Testing Guidelines

- Framework: Deno's built-in test runner with `jsr:@std/assert`.
- Test files are colocated: `src/tools/sales.ts` → `src/tools/sales_test.ts`.
- Run all: `deno test --allow-all src/`; run one: `deno test --allow-all src/tools/sales_test.ts`.

Two test styles exist:

### Tool tests (mock FrappeClient)

Tool handler tests inject a mock `FrappeClient` — no real network calls:

```typescript
function makeMockClient(overrides: Record<string, unknown> = {}): FrappeClient {
  return {
    list: async () => [],
    get: async () => ({ name: "TEST-001" }),
    create: async (_doctype: string, data: Record<string, unknown>) => ({ name: "NEW-001", ...data }),
    update: async () => ({ name: "TEST-001" }),
    delete: async () => {},
    callMethod: async () => null,
    ...overrides,
  } as unknown as FrappeClient;
}
const ctx = { client: makeMockClient({ list: async () => [...] }) };
const result = await tool.handler(input, ctx);
```

### Pure unit tests (no mock needed)

Utility and UI-shared modules (e.g. `src/ui/shared/refresh_test.ts`, `src/ui/viewer-resource-paths_test.ts`) test pure functions without a `FrappeClient` mock.

### General rules

- When adding a new tool, add at least one test for the happy path and one for error handling.
- When modifying tool behavior, update the corresponding tests.
- Do not add integration tests against real ERPNext instances in the main test suite.

## CI/CD

GitHub Actions workflow (`.github/workflows/publish.yml`) triggers on push to `main`:
1. **publish-jsr**: builds UI → `npx jsr publish --allow-dirty`
2. **publish-npm**: builds UI → `scripts/build-node.sh` → `npm publish --access public` (gracefully skips if version already published)

No test step in CI — tests must be run locally before pushing.

## Versioning

This project follows **semver** (`MAJOR.MINOR.PATCH`):
- **MAJOR**: breaking changes to the MCP tool API (renamed/removed tools, changed input schemas, changed response shapes that break existing consumers).
- **MINOR**: new tools, new viewers, new features, non-breaking additions.
- **PATCH**: bug fixes, documentation, internal refactors with no user-facing change.

Version locations (both must stay in sync):
1. `deno.json` → `version` field (used by JSR publish and npm build script)
2. `server.ts` → `ConcurrentMCPServer` constructor `version` parameter (runtime metadata)

Rules:
- Do not bump version during work-in-progress. Bump once at the end, just before the final push.
- Do not change version numbers without explicit approval.
- CHANGELOG follows [Keep a Changelog](https://keepachangelog.com/) format. Only user-facing changes.

## Commit & Pull Request Guidelines

- Use concise, action-oriented commit messages (e.g. `feat: add supplier quotation tools`, `fix: submit handler optimistic locking`).
- Conventional commit prefixes: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`, `style:`.
- Group related changes; avoid bundling unrelated refactors.
- CHANGELOG: user-facing changes only in `CHANGELOG.md`; no internal/meta notes.

## Security & Configuration

- Environment variables: `ERPNEXT_URL`, `ERPNEXT_API_KEY`, `ERPNEXT_API_SECRET` (all required at runtime).
- Never commit `.env` files, API keys, or credentials. The `.gitignore` already covers `.env*`.
- `FrappeClient` authenticates via API key/secret headers. No OAuth or session-based auth.
- All errors throw `FrappeAPIError` — no silent fallbacks or swallowed errors. Do not introduce `try/catch` blocks that hide errors.

## Key Conventions

- Tool `_meta.ui.resourceUri` binds a tool's output to a specific UI viewer (e.g. `"ui://mcp-erpnext/doclist-viewer"`). Use `uiMeta()` from `src/tools/viewer-meta.ts`.
- `FrappeFilter` is a `[field, operator, value]` tuple for Frappe list queries.
- Generic operations tools (`erpnext_doc_*`) are the escape hatch for any DocType not yet wrapped with dedicated tools.
- The `annotations` field on tools signals read-only vs write behavior (e.g. `{ readOnlyHint: true }` for list/get tools).
- `structuredContent` in tool responses: tools that bind to a UI viewer return `structuredContent` with the viewer's MIME type so MCP clients can render the viewer.

## Known Issues & Frappe Gotchas

- **Optimistic locking on submit**: Frappe requires the `modified` timestamp. Submit handlers must `GET` the doc first, then pass the full doc to `frappe.client.submit`. Cancel does not need this. See `docs/known-issues.md`.
- **`_server_messages`**: Frappe error responses have 2 levels — `exc_type` and `_server_messages`. The client now parses both and includes `_server_messages` in the error message (see `src/api/frappe-client.ts`).
- **Fresh ERPNext instances**: may fail on submit with `base_rounded_total = None` until the setup wizard is completed.

## Common Task Recipes

### Add a new tool
1. Add the tool object to the appropriate `src/tools/{category}.ts` file
2. Follow the `ErpNextTool` shape: `name`, `description`, `category`, `inputSchema`, `handler`, optional `_meta` and `annotations`
3. If the category file is new, export it and register it in `src/tools/mod.ts`
4. Add tests in `src/tools/{category}_test.ts`
5. Run `deno test --allow-all src/tools/{category}_test.ts`

### Add a new UI viewer
1. Create `src/ui/{viewer-name}/` with a Vite React app (copy an existing viewer as template)
2. Add the viewer name to `src/ui/viewers.ts`
3. Add a `VIEWER_META` constant in `src/tools/viewer-meta.ts`
4. Add a build entry in `src/ui/build-all.mjs`
5. The server automatically picks it up from the `UI_VIEWERS` array

### Release a version
1. Update `version` in `deno.json`
2. Update `version` in the `ConcurrentMCPServer` constructor in `server.ts`
3. Update `CHANGELOG.md` with user-facing changes
4. Commit, push to `main` — CI publishes to JSR and npm automatically

## Collaboration Notes

- When answering questions, verify in code; do not guess.
- When working on a GitHub Issue or PR, print the full URL at the end of the task.
- Do not modify generated/built files (`src/ui/dist/`, `dist-node/`). They are gitignored.
- Never update dependencies without explicit approval.
- Lint/format churn: if staged diffs are formatting-only, auto-resolve without asking.
