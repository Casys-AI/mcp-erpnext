# Migration: MCP specification 2026-07-28

This document describes the MCP 2026-07-28 contract introduced on the 3.x line.
The release notes and package metadata remain authoritative for the exact
version installed.

## What 3.x implements

The server uses `@casys/mcp-server` `^0.26.1` and the 2026-07-28 protocol
contract:

- `server/discover` is available for capability discovery.
- Every HTTP request supplies `MCP-Protocol-Version: 2026-07-28` and the
  matching `Mcp-Method` header. Methods addressing a named object also supply
  `Mcp-Name`.
- Every request includes `params._meta` with
  `io.modelcontextprotocol/protocolVersion` and an object-valued
  `io.modelcontextprotocol/clientCapabilities`.
- Successful complete results carry `resultType: "complete"` and
  `_meta["io.modelcontextprotocol/serverInfo"]`; protocol errors use the
  2026-07-28 error envelopes.
- `server/discover`, `tools/list`, `resources/list`, and `resources/read`
  advertise public cache hints of one hour. This is protocol-response caching,
  distinct from the ERPNext data cache configured with `MCP_CACHE_TTL_MS`.

  `"public"` is only correct because nothing here varies by caller: the tool set
  is chosen once at startup from `categories`, auth performs no per-caller
  filtering, and the viewer HTML is a build artefact. **If any of those ever
  becomes caller-specific — role-based tool filtering, per-tenant resources —
  this must move back to `"private"` in the same change.** A shared cache is
  otherwise free to serve one caller's response to another.

`clientInfo` is a SHOULD, not a required field. Clients may send it, but a valid
request is not rejected merely because it is absent.

`deno.json` preserves Deno 2.9's 24-hour minimum dependency age for every other
package, while explicitly exempting the coordinated `jsr:@casys/mcp-server`
release. This makes clean CI and Docker builds reproducible during its initial
cooldown without globally disabling the supply-chain delay.

## Stateless HTTP client requirements

Stateless mode has no session identifier. `GET /mcp` and `DELETE /mcp` return
405, and the server does not issue `Mcp-Session-Id`. HTTP clients written for
older MCP revisions must be updated before using HTTP on 3.x; stdio clients are
served through era negotiation. Modern stdio clients receive 2026-07-28 result
envelopes; clients that begin with legacy `initialize` retain the 2025-11-25
wire shape.

Use this shape for a discovery request:

```sh
curl -sS -D - -X POST http://127.0.0.1:3012/mcp \
  -H 'Content-Type: application/json' \
  -H 'MCP-Protocol-Version: 2026-07-28' \
  -H 'Mcp-Method: server/discover' \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "server/discover",
    "params": {
      "_meta": {
        "io.modelcontextprotocol/protocolVersion": "2026-07-28",
        "io.modelcontextprotocol/clientCapabilities": {}
      }
    }
  }'
```

A `tools/list` request uses the same envelope and changes `Mcp-Method` and
`method` to `tools/list`. Its response includes `resultType: "complete"`, server
information in `_meta`, and the public one-hour cache hint.

## Optional MRTR link disambiguation

Some ERPNext links accept an ID or a human-readable identifier. Where a lookup
has several safe candidates, the server can ask a capable client to choose
through MCP request/retry (MRTR), rather than guessing. MRTR is opt-in.

- The client must advertise elicitation support in `clientCapabilities`.
- Set `MCP_MRTR_SIGNING_KEY` to exactly 64 lowercase hexadecimal characters to
  enable signed request state. The environment-based bootstrap is intended for
  one server instance.
- The retry is accepted only when the framework marks it verified and the
  selected record is among the candidates reconstructed from the unchanged
  original arguments. A refusal or invalid response performs no ERPNext
  mutation.
- Without a signing key or elicitation support, clients retain the existing
  explicit ambiguity error with the candidate list. They can retry with an
  unambiguous ID.

Do not enable this environment-only MRTR setup on more than one instance. The
framework consumes a verified retry nonce before application dispatch, but its
default replay store is process-local. A load-balanced deployment requires one
shared signing key and a shared atomic replay store wired directly into
`McpApp`, which this bootstrap does not currently expose.

## Deliberately not advertised

Tasks are not advertised. No handler has been demonstrated to be long-running
enough to justify asynchronous polling, and the framework `TaskStore` is local
to a process, which is unsuitable for a multi-instance HTTP deployment without
shared task storage.

The framework supports `subscriptions/listen`, but this server emits no ERPNext
notifications. Clients therefore must not rely on subscriptions for ERPNext
updates.

## Verification before release

```sh
deno check mod.ts server.ts
deno test --allow-all src/transport_wire_test.ts
deno task release:check
```

Confirm on the wire that `server/discover`, result envelopes, routing headers,
public one-hour cache hints, and the stateless 405/no-session behavior all match
this document. Test both MRTR-capable and non-elicitation clients before
enabling MRTR for any write path.
