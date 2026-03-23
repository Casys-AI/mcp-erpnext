# Refactoring Plan: @casys/mcp-server 0.12.0

Upgrade from 0.9.2 to 0.12.0. Analysis done 2026-03-23 with Codex.

## New features available

| Feature | Export | Description |
|---------|--------|-------------|
| `ToolErrorMapper` | type | Centralized error handling via server config |
| `ToolAnnotations` | type | readOnlyHint, destructiveHint on tools |
| `StructuredToolResult` | type | Separate LLM summary from viewer payload |
| `uiMeta()` | function | Helper to build `_meta.ui` objects |
| `composeEvents()` | function | Server-side viewer-to-viewer event routing |

## Refactoring items

### P0 — Do now

#### 1. Widen tool types for annotations + richer _meta

- **What**: Add `annotations?: ToolAnnotations` and allow richer `_meta` in `ErpNextTool` type
- **Files**: `src/tools/types.ts`, `src/client.ts`
- **Effort**: M

#### 2. Move error wrapping to toolErrorMapper

- **What**: Remove try/catch in `client.ts:buildHandlersMap()`, configure `toolErrorMapper` in `server.ts`
- **Pattern**: Map FrappeAPIError 4xx → `isError` (user-facing). Let 5xx/timeouts rethrow as JSON-RPC errors.
- **Files**: `server.ts`, `src/client.ts`, `tests/tools/client_test.ts`
- **Effort**: M

#### 3. Add ToolAnnotations to all tools

- **What**: Mark tools with `readOnlyHint` (list, get, analytics) and `destructiveHint` (delete, cancel, submit)
- **Files**: `src/tools/*.ts`
- **Effort**: M

### P1 — Next session

#### 4. Normalize UI metadata with uiMeta()

- **What**: Replace 91 inline `_meta: { ui: { resourceUri: "..." } }` with shared constants via `uiMeta()`
- **Files**: `src/tools/*.ts`, `src/tools/ui-refresh.ts`
- **Effort**: M/L

### P2 — Future

#### 5. Compose-ready navigation intents

- **What**: Replace prompt-string sendMessage hints with typed navigation descriptors + `_meta.ui.emits`/`_meta.ui.accepts`
- **Blocked by**: MCP Compose support in hosts (Claude Desktop, etc.)
- **Files**: `src/tools/ui-refresh.ts`, viewers
- **Effort**: L

#### 6. StructuredToolResult — separate LLM summary from viewer payload

- **What**: Return `{ content: summary, structuredContent: viewerData }` so LLM gets a short text and viewers get full JSON
- **Pattern already validated in mcp-einvoice**: viewers use `extractToolResultText()` which prefers `structuredContent` over `content[0].text` (fallback for clients that don't support it)
- **Migration path**:
  1. Update `src/ui/shared/refresh.ts` → add `structuredContent` to `ToolResultPayload` type, prefer it in `extractToolResultText()`
  2. Update tool handlers to return `{ content: humanSummary, structuredContent: viewerData }`
  3. All viewers already use `extractToolResultText()` so they auto-migrate
  4. Clients without structuredContent support still get `content` text — no breaking change
- **Files**: `src/ui/shared/refresh.ts`, `src/tools/*.ts`, `src/client.ts`
- **Effort**: L

## Dependencies

- `@casys/mcp-server@^0.12` (already upgraded)
- `@casys/mcp-compose@^0.3` (re-exported by mcp-server, needed for P1/P2)
