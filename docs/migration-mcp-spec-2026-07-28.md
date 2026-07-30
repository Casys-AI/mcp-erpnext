# Migration: MCP specification 2026-07-28

Verified against `@casys/mcp-server` 0.22.0 and this repository at 2.6.0 on
2026-07-30. Every claim below cites the source that establishes it; where the
draft plan and the implementation disagreed, the implementation won.

**Status as of 2026-07-30:** `transport: "stateless"` is implemented in
`server.ts:99` on branch `feat/stateless-transport`. The framework's `transport`
option shipped in 0.22, so this change does NOT require a version bump. The
`^0.22` pin is sufficient.

## TL;DR

| Change                                                         | Action here                                                                                                                                         | Blocked?                                                              |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `transport: "stateless"` (`server.ts:99`)                      | **Done — and BREAKING.** Clients that do not send the `_meta` envelope lose access; warrants a major version. Works on the current `^0.22` pin.     | No                                                                    |
| Bump `^0.22` → `^0.23` (`deno.json:59`)                        | Separate, optional — adds `resultType`/`serverInfo` in responses and enables MRTR+Tasks. NOT required for stateless transport itself.               | Yes — JSR 24h dependency-age window, resolvable ~2026-07-31 09:04 UTC |
| `cache: { ttlMs, scope }` (`server.ts:99`)                     | Optional — cuts `tools/list` latency for frequent callers                                                                                           | No                                                                    |
| Tasks extension                                                | Optional — no current handler justifies it                                                                                                          | No                                                                    |
| Result envelope, routing headers, MRTR, `subscriptions/listen` | Nothing to do on `^0.22`; envelope fields (`resultType`, `serverInfo`) appear automatically once bumped to `^0.23`; other items not applicable here | —                                                                     |

## What changed in 2026-07-28

### Stateless transport

The spec makes stateless HTTP the primary path. Each request carries its own
protocol version in `params._meta["io.modelcontextprotocol/protocolVersion"]`;
the `initialize` handshake remains valid but is no longer required. `GET /mcp`
returns `405` in stateless mode (`mcp-app.ts:1959`) — the long-lived SSE stream
is replaced by `subscriptions/listen`.

This server constructs `McpApp` without a `transport` option (`server.ts:98`),
which selects the `"stateful"` default. The framework's own type documentation
is blunt about what that costs: `"stateful"` _"advertises 2025-06-18 and
negotiates nothing per-request, so it never carries the envelope"_
(`types.ts:161`). A 2026-07-28 client therefore receives the legacy shape even
after the version bump. This is the one change that is genuinely required, and
the earlier draft was wrong to file it as "inherited from server".

### Result envelope (`resultType`)

Every result from a 2026-07-28 server carries `resultType: "complete"` at the
root plus `io.modelcontextprotocol/serverInfo` in `_meta`. The framework applies
this in `completeResult()` (`mcp-app.ts:530`), gated on the negotiated version.
Nothing to do here.

### Routing headers (`Mcp-Method` / `Mcp-Name`)

2026-07-28 requests carry `Mcp-Method` so proxies can route without parsing the
body, plus `Mcp-Name` for the methods that name a target — `tools/call`,
`resources/read`, `prompts/get`, `tasks/*`. It is not required on `tools/list`
and friends (`transport/request-headers.ts:30`). The framework validates them
against the body they claim to describe (`transport/request-headers.ts:426`,
gated at `mcp-app.ts:2238`), and only for peers that negotiated 2026-07-28. This
server validates inbound headers; it proxies nothing. Nothing to do.

### MRTR replaces server-initiated requests

Sampling and other server→client requests are replaced by MRTR: a handler
needing client input returns an `input_required` result, and the client replays
it with `inputResponses` and a sealed `requestState`. No handler here asks for
input mid-call, and `enableSampling` is unused. Not applicable.

### `subscriptions/listen`

The `GET /mcp` SSE stream and `resources/subscribe` are both gone; clients that
want notifications open a stream via `subscriptions/listen`. This server pushes
no notifications — no `sendNotification`, no dynamic resource registration after
startup. The registry will exist and stay empty. Nothing to do.

### Tasks extension (SEP-2663)

A handler opts into async mode by returning `createTask(...)` instead of a
direct result; the framework then exposes it through `tasks/get|update|cancel`.
`createTask` is imported from the framework's barrel (`@casys/mcp-server`,
`packages/server/mod.ts:263`). There is no `ctx.tasks.create()` — the earlier
draft invented that API. Optional; see below.

### Cache hints (SEP-2549)

Results of `tools/list`, `resources/list` and `resources/read` carry `ttlMs` and
`cacheScope` (`"public"` | `"private"` — not `global`/`tenant`, as the earlier
draft had it). The framework emits them automatically, defaulting to `ttlMs: 0`
and `scope: "private"` (`types.ts:186`) — inert by design. The server is
conformant without touching this; setting values is a performance decision, not
a conformance one.

## Required work

### 1. Switch the HTTP transport to stateless — **done** in `feat/stateless-transport`

`server.ts:99` (formerly :98, line shifted by one after adding this line):

```diff
  const server = new McpApp({
    name: "mcp-erpnext",
    version: "2.6.0",
+   transport: "stateless",
    maxConcurrent: 10,
```

The `transport` option is available from `@casys/mcp-server` **0.22**, which is
the version already pinned in `deno.json`. **No version bump is required** for
this change. The earlier draft of this document listed it as blocked on the
^0.23 bump; that was wrong — the option shipped in 0.22, making this change
immediately available.

> **Note for the ^0.23 bump (future, optional):** once bumped, every result will
> automatically carry `resultType: "complete"` and
> `_meta["io.modelcontextprotocol/serverInfo"]` (added by `stampResult()` in the
> framework). No server code needs to change for that. The bump also unlocks
> MRTR and the Tasks extension, which are optional improvements described in the
> section below.

The diff to apply after the bump (when/if desired):

```diff
-"@casys/mcp-server": "jsr:@casys/mcp-server@^0.22"
+"@casys/mcp-server": "jsr:@casys/mcp-server@^0.23"
```

After landing the bump, wait for the JSR 24h dependency-age window and retrigger
CI (see commit `496e336` for precedent):

```sh
git commit --allow-empty -m "ci: retrigger — @casys/mcp-server ^0.23 now resolvable"
```

### 2. The breaking change, in detail

**This is a breaking change for clients, and the reason is easy to misread.**

The stateless transport validates two `_meta` fields on _every_ request, before
any method dispatch — `initialize` included (`mcp-app.ts:2158`):

| Required in `params._meta`                   | If missing                                              |
| -------------------------------------------- | ------------------------------------------------------- |
| `io.modelcontextprotocol/protocolVersion`    | `-32602 Missing required field` + HTTP 400              |
| `io.modelcontextprotocol/clientCapabilities` | same — and it must be an **object**, not merely present |

A client written against 2025-06-18 sends neither, so it is rejected on every
call, not only on the handshake.

The trap is `STATELESS_SUPPORTED_VERSIONS`, which does list `2026-07-28`,
`2025-11-25` and `2025-06-18` (`mcp-app.ts:212`). That is **not** backward
compatibility: it means a _stateless-aware_ client may negotiate an older
revision. The per-request `_meta` envelope is required whichever version it
declares. Reading that list as "old clients keep working" is exactly the mistake
an earlier revision of this document made.

What is true, and still reassuring: nothing this repository relies on is
withdrawn — no `sendNotification`, no `resources/subscribe`, no sampling, no
elicitation, no `@casys/mcp-bridge` dependency. The migration costs no
functionality here, only client compatibility.

**So this warrants a major version.** Before releasing, verify against the
clients that actually matter — Claude Desktop, Claude Code, VS Code Copilot, and
anything custom — that each sends the 2026 `_meta` envelope. Any that does not
loses access at the switch; users needing the old behaviour stay on the 2.x
line.

Commit both changes together — they are one atomic migration.

## Optional improvements

### Cache hints

`McpAppOptions.cache` (`types.ts:185`) controls the hints emitted on list and
read results. It does not affect `tools/call` — `CacheableResult` covers list
and read only.

This server is deployed one instance per ERPNext site. The tool list is built at
startup from source and is identical for every caller, and the viewer HTML under
`src/ui/` is a static build artefact — both are safely `"public"`:

```typescript
cache: {
  ttlMs: 3_600_000,  // 1h — match your redeploy cadence
  scope: "public",
},
```

If a future change ever makes the tool list vary per caller (role-based
filtering, say), move back to `"private"` until invariance is re-established.
Getting this wrong lets a shared cache serve one caller's view to another, so
`"private"` is the right answer whenever there is doubt.

### Tasks extension

Declare the extension so clients know to poll it — the framework will not hand a
task to a client that did not declare support, and will not advertise an
extension it was not told to enable:

```typescript
extensions: { "io.modelcontextprotocol/tasks": {} },
```

`extensions` is `Readonly<Record<string, unknown>>` (`types.ts:259`); `{}` is
correct, as the Tasks spec defines no per-extension configuration yet.

A handler then opts in per call:

```typescript
import { createTask } from "@casys/mcp-server";

handler: async (args, ctx) => {
  return createTask(
    { statusMessage: "Analysing…", pollIntervalMs: 3_000 },
    async (ctrl) => {
      ctrl.setStatusMessage("Fetching data…");
      const data = await ctx.client.list("BOM", { limit: 1000 });
      if (ctrl.signal.aborted) return { cancelled: true };
      return { result: data };
    },
  );
},
```

`CreateTaskOptions` (`task-store.ts:41`): `statusMessage?`, `ttlMs?`,
`pollIntervalMs?`. `TaskController` (`task-store.ts:76`): `signal`,
`setStatusMessage()`, `requireInput()`. Throwing `{ code, message }` marks the
task `failed`; a business-level outcome ("order not found") should be _returned_
normally — it reaches `completed`, not `failed` (`task-store.ts:120`).

**No current handler justifies converting**, but the reasoning depends on work
that is not yet on `main`, so it is worth being exact.

Tasks pays for itself when work outlasts `pollIntervalMs` — caller-chosen,
defaulting to 5s (`task-store.ts:41`); there is no framework threshold. Below
that, polling costs more than it saves.

The five tools an obvious reading nominates — `erpnext_kanban_get_board`,
`erpnext_revenue_trend`, `erpnext_stock_treemap`, `erpnext_revenue_vs_orders`,
`erpnext_stock_chart` — each make a single Frappe call, with one exception:
`erpnext_stock_chart` issues a second, serial call when `item_group` is supplied
(`analytics.ts:68`). None is a Tasks candidate.

The genuinely multi-query handlers are `erpnext_sales_funnel` (four calls),
`erpnext_gross_profit`, `erpnext_profit_loss` and `erpnext_product_radar`. On
`main` today those calls are **serial**. Branch
`perf/parallelise-analytics-fanout` groups each set with `Promise.all`, bringing
them to roughly one round-trip; once it merges, the "no handler is slow enough"
conclusion holds by measurement rather than by assertion. Until then, the
strongest accurate statement is that these handlers are latency-bound on ERPNext
round-trips, and that removing the serialisation is the cheaper fix — Tasks
would move the wait to the client rather than remove it.

## Verifying the migration

### Static checks (what CI runs)

```sh
deno task pre-commit   # fmt --check && lint && task check
deno test --allow-all src/
```

`deno task check` targets `mod.ts` and `server.ts` only. Do **not** run a bare
`deno check .`: the React viewers under `src/ui/` are built by Vite and are
outside Deno's type graph, so a global check fails on files that are not part of
the server.

### Wire-level probe

```sh
deno task serve   # deno run --allow-all server.ts --http --port=3012
```

A `tools/list` call is the fastest smoke test. Four things are required of a
2026-07-28 stateless request:

| Requirement                                                  | Value                       |
| ------------------------------------------------------------ | --------------------------- |
| `params._meta["io.modelcontextprotocol/protocolVersion"]`    | `"2026-07-28"`              |
| `params._meta["io.modelcontextprotocol/clientCapabilities"]` | an object, `{}` is fine     |
| `MCP-Protocol-Version` header                                | `"2026-07-28"`              |
| `Mcp-Method` header                                          | mirrors the body's `method` |

```sh
curl -s -D - -X POST http://127.0.0.1:3012/mcp \
  -H 'Content-Type: application/json' \
  -H 'MCP-Protocol-Version: 2026-07-28' \
  -H 'Mcp-Method: tools/list' \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list",
    "params": {
      "_meta": {
        "io.modelcontextprotocol/protocolVersion": "2026-07-28",
        "io.modelcontextprotocol/clientCapabilities": {}
      }
    }
  }'
```

Expect `MCP-Protocol-Version: 2026-07-28` in the response headers, `resultType`
and `_meta["io.modelcontextprotocol/serverInfo"]` in the result, and **no**
`Mcp-Session-Id` — the stateless transport never emits one.

### Client compatibility — the check that actually matters

Re-running the call with `2025-06-18` in the header and `_meta` proves only that
the server down-negotiates for a _stateless-aware_ client. It says nothing about
existing clients, because it still sends the 2026 `_meta` envelope that they do
not.

To find out what breaks, drop the envelope entirely — this is the shape a
pre-migration client sends:

```sh
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:3012/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Against the stateless transport this returns **400** with
`-32602 Missing required field`. That is the breaking change, reproduced in one
command.

So the real test is not a curl at all: connect each client you support — Claude
Desktop, Claude Code, VS Code Copilot, anything custom — and confirm it still
lists tools and calls one. Whatever fails here is what your major version bump
is for.

## Deliberately not doing

| Item                                               | Why                                                                                                                                                                                       |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ConcurrentMCPServer` → `McpApp` rename            | Already done — `server.ts:34` imports `McpApp` directly. The earlier draft listed this as outstanding work; executing it would be a no-op.                                                |
| Sampling / `createMessage`                         | Zero occurrences in `src/**/*.ts`, and deprecated in 2026-07-28 regardless                                                                                                                |
| W3C Trace Context                                  | Not implemented in the framework — zero source hits for `traceparent`, `tracestate` or `propagation.extract`. There is nothing to inherit.                                                |
| MRTR                                               | No handler requests input mid-call                                                                                                                                                        |
| `subscriptions/listen`                             | This server pushes no notifications                                                                                                                                                       |
| Converting analytics to Tasks                      | No handler approaches the threshold where polling beats blocking                                                                                                                          |
| `_meta.ui.csp` / `_meta.ui.permissions` per viewer | `MCPResource` exposes no **per-resource** field for either (`types.ts:326`). A global `resourceCsp` option does exist (`types.ts:121`) — it is the per-viewer granularity that is missing |
