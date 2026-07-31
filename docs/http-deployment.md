# How to run the HTTP server

Most users do not need this. Claude Desktop and Claude Code connect over stdio,
which the [Quick Start](../README.md#quick-start) covers — one process per
session, credentials in the client config, nothing to deploy.

Run the HTTP server when several clients share one always-on instance, or when
the server lives somewhere other than the user's machine.

> **Breaking in 3.0.0.** The HTTP transport is stateless (MCP spec 2026-07-28):
> every request must carry
> `params._meta["io.modelcontextprotocol/protocolVersion"]`, and clients that
> omit it receive HTTP 400. The official TypeScript SDK v1 line is affected.
> stdio is unaffected. See
> [the migration guide](migration-mcp-spec-2026-07-28.md).

## HTTP mode

> **Implemented in unreleased 3.0.0 — HTTP clients only.** The HTTP transport is
> stateless (MCP spec 2026-07-28). Every request must carry
> `params._meta["io.modelcontextprotocol/protocolVersion"]`; clients that omit
> it are rejected. The official TypeScript SDK v1 line is affected. **stdio is
> unaffected** — if you connect via `command`/`args` above, nothing changes. See
> [the migration guide](docs/migration-mcp-spec-2026-07-28.md), or stay on 2.x.

> 3.0.0 HTTP clients must also send `MCP-Protocol-Version: 2026-07-28`, the
> matching `Mcp-Method`, and an object-valued
> `params._meta["io.modelcontextprotocol/clientCapabilities"]`. `clientInfo` is
> a protocol SHOULD, not a mandatory field. The new public one-hour cache hints
> apply only to protocol discovery/list/read responses, not ERPNext data.

```bash
ERPNEXT_URL=http://localhost:8000 \
ERPNEXT_API_KEY=xxx \
ERPNEXT_API_SECRET=xxx \
npx -y @casys/mcp-erpnext --http --port=3012
```

> **Note:** HTTP mode binds to `127.0.0.1` (loopback) by default as of v2.4.2.
> For Docker or multi-host setups, add `--hostname=0.0.0.0`.

## Deno (HTTP mode)

```bash
ERPNEXT_URL=http://localhost:8000 \
ERPNEXT_API_KEY=xxx \
ERPNEXT_API_SECRET=xxx \
deno run -A npm:@casys/mcp-erpnext --http --port=3012
```

> **Note:** Versions ≤ 2.3.1 of the npm bundle crashed with
> `ReferenceError: Deno is not defined` in HTTP mode — fixed in 2.4.0
> (`@casys/mcp-server` ≥ 0.21.1). If you hit this error, upgrade with
> `npx -y @casys/mcp-erpnext@latest`, or use the Deno runner above. See
> [`docs/known-issues.md`](docs/known-issues.md).
