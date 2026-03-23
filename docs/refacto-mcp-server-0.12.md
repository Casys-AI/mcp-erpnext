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

### P0 — DONE

#### 1. Widen tool types for annotations + richer _meta — DONE

- `ErpNextTool._meta` now uses `MCPToolMeta` from `@casys/mcp-server`
- `ToolAnnotations` added to `ErpNextTool` and wire format

#### 2. Move error wrapping to toolErrorMapper — DONE

- `toolErrorMapper` configured in `server.ts`, try/catch removed from `client.ts`

#### 3. Add ToolAnnotations to all tools — DONE

- 95 annotations across 14 tool files (readOnlyHint + destructiveHint)

### P1 — DONE

#### 4. Normalize UI metadata with uiMeta() — DONE

- `src/tools/viewer-meta.ts` uses `uiMeta()` from `@casys/mcp-server`
- All 14 tool files import from `viewer-meta.ts`
- `MCPToolMeta` type used throughout instead of inline types

#### 6. StructuredToolResult — DONE

- `client.ts:buildHandlersMap()` returns pre-formatted MCP results for viewer tools with both `content` (JSON text for LLM backward compat) and `structuredContent` (data object for viewers)
- `src/ui/shared/refresh.ts:extractToolResultText()` prefers `structuredContent` over `content[0].text`
- Pattern matches mcp-einvoice implementation

### P2 — Future

#### 5. Compose-ready navigation intents

- **What**: Replace prompt-string sendMessage hints with typed navigation descriptors + `_meta.ui.emits`/`_meta.ui.accepts`
- **Available now**: `uiMeta()` already supports `emits` and `accepts` arrays
- **Example**:
  ```ts
  const DOCLIST_META = uiMeta({
    resourceUri: "ui://mcp-erpnext/doclist-viewer",
    emits: ["rowSelected", "navigate"],
    accepts: ["setFilter", "refresh"],
  })._meta;
  ```
- **What's needed**: viewer-side `composeEvents()` listener + server routing logic
- **Blocked by**: MCP Compose support in hosts (Claude Desktop, etc.) — mcp-einvoice doesn't use it yet either
- **Files**: `src/tools/viewer-meta.ts`, `src/tools/ui-refresh.ts`, viewers
- **Effort**: L

## Dependencies

- `@casys/mcp-server@^0.12` (upgraded, uses `uiMeta` re-exported from mcp-compose)
- `@casys/mcp-compose@^0.3` (transitive dep, resolved via `npx jsr add` in Node build)
- Node build uses `npx jsr add` instead of npm for JSR package resolution
