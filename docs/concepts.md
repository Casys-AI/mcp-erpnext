# Concepts

This document explains the reasoning behind five design decisions you encounter
when the server does something unexpected: a write failing where a read
succeeds, a warning at startup, a question about which transport to use,
uncertainty about what to do when no typed tool exists for a DocType, and
confusion about which cache controls which data.

## How link resolution works — and why writes are stricter

Most tools accept a human-readable identifier where an ERPNext Link field
expects an internal ID. The resolution logic lives in `src/api/resolve.ts`.

A read path is forgiving: it will settle for a partial match, so "Acme" finds
"Acme Supplies Ltd". A write path is not. And in both cases, a name matching
several records raises rather than picks one — display names are not unique keys
in ERPNext, so even a correctly spelled name can hit several documents.

Write paths disable partial matching entirely (`allowPartialMatch: false` in the
call to `resolveLink`). The reason is consequence asymmetry. On a read path,
resolving to the wrong party produces a misleading response the caller can
discard and retry. On a write path — a purchase order, a leave application, an
expense claim — resolving to the wrong party creates a permanent record. Once
submitted, that document is irreversible in ERPNext. A fuzzy match that saves a
lookup on read paths would silently create durable financial records against the
wrong counterparty on write paths. The strictness is intentional, not an
oversight.

When an ambiguous name reaches a write tool, the error includes the candidate
IDs. Passing an unambiguous ID directly bypasses the resolution step entirely.

## Why there are two transports, and which one you need

stdio is the default. When Claude Desktop or Claude Code loads the server via
`command` and `args` in an MCP config file, it spawns a private process per
session. That process inherits credentials from environment variables in the
config block, runs entirely inside the client's trust boundary, and exits when
the session ends. There is no network exposure, no authentication layer, and no
shared state between sessions. Auth configuration options are irrelevant in this
mode.

HTTP mode is for deployments where multiple clients — Claude Desktop, a CI
agent, a web application — share a single always-on server. The server binds to
`127.0.0.1` by default because every tool call acts with the server's ERPNext
API key. Accepting connections from arbitrary network addresses would expose
that key to anyone who can reach the port. Binding to the network interface is
an explicit opt-in (`--hostname=0.0.0.0`), not the default. HTTP mode is also
where authentication options live: static bearer tokens and OAuth JWT validation
only apply when a server is shared.

The 2026-07-28 MCP specification made the HTTP transport stateless. There is no
session identifier. Clients written against older MCP revisions must be updated
before they can use the 3.0.0 HTTP transport; stdio clients are completely
unaffected by this change.

Most users who are running the server for a single Claude Desktop session never
need HTTP mode.

## Tool categories and the escape hatch

The server organises its 125 tools across 14 typed categories — sales,
purchasing, accounting, HR, inventory, and so on. Each category wraps the
doctypes its domain most commonly needs, with typed schemas, validated fields,
and predictable behaviour.

The Generic Operations category exists for everything else. Its tools take a
`doctype` argument and work against any ERPNext DocType — see the reference for
the list. They are the recommended approach for a one-off operation on a DocType
that has no typed wrapper yet — requesting a new typed tool is rarely warranted
when the generic operations cover the operation adequately.

The trade-off is explicitness: a typed tool can validate inputs specific to a
DocType (required child table rows, mandatory fields, domain constraints) before
touching ERPNext. The generic operations trust that the caller supplies a
correct payload, which ERPNext then validates server-side.

Some behaviour is not reachable through the document API at all. A site can
refuse a direct field write and expose a whitelisted method as the only
supported way to change it, and custom apps ship business endpoints that no
DocType write can stand in for. `erpnext_method_call` covers that last gap: it
calls a whitelisted method by its dotted path. Because it is a far wider surface
than the typed tools, it is deny-by-default and only reaches methods matched by
`ERPNEXT_METHOD_ALLOWLIST`; with that variable unset the tool refuses every
call.

## MRTR: how link disambiguation reaches the user

When a tool resolves a link field and encounters multiple candidates, the
default behaviour is to return an `AmbiguousLinkError` with the candidate list.
The caller retries with an unambiguous ID. This is always available.

When `MCP_MRTR_SIGNING_KEY` is set and the connecting client declares
`elicitation` support in its capabilities, the server activates a second path.
Instead of returning an error, the server signs the current call state — the
full original arguments plus the candidate list — and presents the choice to the
user through the MCP elicitation protocol. The user picks a candidate. The
client replays the call carrying the signed token. The server verifies the
token, confirms the selected record was among the original candidates, and
executes the write. A refusal or an invalid response performs no ERPNext
mutation.

The signed token proves the retry is authentic. It does not make the token
single-use. That is a separate guarantee, provided by a replay store that
consumes each token atomically on first use. The default replay store is
process-local, which means a token that validates on one instance of the server
also validates on every other instance. In a load-balanced deployment with a
shared signing key and no shared replay store, the same signed retry creates the
document on each instance that receives it — purchase orders, leave
applications, and expense claims that are irreversible once submitted.

The framework logs a startup warning whenever MRTR is enabled without a shared
replay store. That warning is this paragraph. A multi-instance deployment must
provide a shared atomic replay store; Redis satisfies the contract. A
single-instance deployment with the default store is safe.

The signing key is validated at startup by `src/mrtr/config.ts`: it must be
exactly 64 lowercase hexadecimal characters. Any other format is rejected with
an error before the server accepts connections.

## Two caches, two different things

The 3.0.0 server applies a one-hour `"public"` cache hint to four protocol
endpoints: `server/discover`, `tools/list`, `resources/list`, and
`resources/read`. These are responses that describe the server's capabilities —
the tool catalog and the viewer resources — not ERPNext data. The hint is safe
to mark `"public"` because none of these responses vary by caller: the tool set
is chosen once at startup, auth performs no per-caller filtering, and the viewer
HTML is a build artifact. A shared cache can legitimately serve one caller's
response to another.

If tool visibility ever becomes per-caller — role-based tool filtering,
per-tenant resources — the protocol cache must move to `"private"` in the same
change as the filtering logic. Leaving it `"public"` when responses vary would
allow one caller's filtered view to be served to a caller whose view should be
different.

The ERPNext data cache is an entirely separate concern. It is configured by
`MCP_CACHE_TTL_MS` (default 15 seconds) and `MCP_CACHE_ENABLED`. It caches the
results of ERPNext API calls — list queries, document fetches, link resolution
lookups — not protocol metadata. The two caches operate at different layers, on
different data, and with different TTLs. Tuning one has no effect on the other.
