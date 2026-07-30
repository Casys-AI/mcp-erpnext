/**
 * Stateless-transport wire tests
 *
 * These tests verify that the HTTP layer behaves exactly as the MCP spec
 * 2026-07-28 stateless transport requires. They are NOT unit tests of
 * ERPNext business logic — they probe the protocol contract so that
 * regressions (e.g. accidentally reverting to stateful) are caught at
 * the assertion level rather than discovered in production.
 *
 * A minimal McpApp with `transport: "stateless"` is constructed in-process
 * and driven via `getFetchHandler()`, which exercises the full HTTP dispatch
 * stack without binding to a real port.
 *
 * @module src/transport_wire_test
 */

import { assert, assertEquals } from "@std/assert";
import { McpApp } from "@casys/mcp-server";
import type { FetchHandler } from "@casys/mcp-server";

// ---------------------------------------------------------------------------
// Shared fixture: one stateless server used by all tests
// ---------------------------------------------------------------------------

const PROTO_KEY = "io.modelcontextprotocol/protocolVersion";
const CLIENT_CAPS_KEY = "io.modelcontextprotocol/clientCapabilities";
const PROTO_VERSION = "2026-07-28";

/** Build a minimal McpApp configured exactly as server.ts configures it. */
function buildApp(): McpApp {
  const app = new McpApp({
    name: "mcp-erpnext-wire-test",
    version: "0.0.0",
    transport: "stateless",
  });
  // Register a trivial no-op tool so tools/list returns a non-empty array.
  app.registerTools(
    [
      {
        name: "ping",
        description: "No-op tool used by wire tests",
        inputSchema: { type: "object" as const, properties: {} },
      },
    ],
    new Map([
      [
        "ping",
        async (_args: unknown) => ({
          content: [{ type: "text" as const, text: "pong" }],
        }),
      ],
    ]),
  );
  return app;
}

/** Lazily constructed handler shared across all tests in this file. */
let _handler: FetchHandler | null = null;

async function handler(): Promise<FetchHandler> {
  if (!_handler) {
    _handler = await buildApp().getFetchHandler({ cors: false });
  }
  return _handler!;
}

// ---------------------------------------------------------------------------
// Helper: build a well-formed stateless POST request for tools/list
// ---------------------------------------------------------------------------

function wellFormedRequest(body?: unknown): Request {
  const payload = body ?? {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
    params: {
      _meta: {
        [PROTO_KEY]: PROTO_VERSION,
        [CLIENT_CAPS_KEY]: {},
      },
    },
  };
  return new Request("http://localhost/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "MCP-Protocol-Version": PROTO_VERSION,
      "Mcp-Method": "tools/list",
    },
    body: JSON.stringify(payload),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test(
  "stateless wire: well-formed 2026 request returns HTTP 200 with a valid result and protocol echo header",
  async () => {
    const h = await handler();
    const res = await h(wellFormedRequest());

    assertEquals(res.status, 200, "Expected HTTP 200 on well-formed request");

    // The stateless transport echoes MCP-Protocol-Version on every response.
    // A stateful server never sets this header.
    assertEquals(
      res.headers.get("mcp-protocol-version"),
      PROTO_VERSION,
      "MCP-Protocol-Version response header must echo the requested version",
    );

    const body = await res.json() as Record<string, unknown>;
    assert("result" in body, "Response must have a 'result' field (not error)");
    assert(
      !("error" in body),
      "Response must not contain an error field on a well-formed request",
    );

    // tools/list result must contain a tools array (may be empty if no tools
    // were registered, but must be an array).
    const result = body.result as Record<string, unknown>;
    assert(
      Array.isArray(result["tools"]),
      "tools/list result must carry a 'tools' array",
    );

    // NOTE: result.resultType and result._meta['io.modelcontextprotocol/serverInfo']
    // are present in @casys/mcp-server >=0.23. This repo pins ^0.22 (0.22.0 at
    // time of writing), where those fields are not yet stamped. The assertions
    // above cover what 0.22 actually emits; upgrade the pin to 0.23 when it
    // ships and add the envelope assertions then.
  },
);

Deno.test(
  "stateless wire: no Mcp-Session-Id header on any response",
  async () => {
    const h = await handler();
    const res = await h(wellFormedRequest());

    // In stateful mode, the server echoes or creates an Mcp-Session-Id.
    // Stateless mode must never emit one.
    assertEquals(
      res.headers.get("mcp-session-id"),
      null,
      "Mcp-Session-Id must not appear in stateless responses",
    );
  },
);

Deno.test(
  "stateless wire: request without _meta envelope returns HTTP 400 with -32602 — this is the breaking change",
  async () => {
    const h = await handler();

    // A client written against the stateful protocol or MCP 2024-11-05 will
    // omit params._meta entirely. In stateless mode the server rejects it.
    const req = new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        // No MCP-Protocol-Version header either — a true stateful client
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {}, // no _meta
      }),
    });

    const res = await h(req);
    assertEquals(
      res.status,
      400,
      "Request missing _meta must return HTTP 400 (breaking change for stateful clients)",
    );

    const body = await res.json() as Record<string, unknown>;
    assert("error" in body, "Response must have an 'error' field");

    const error = body.error as Record<string, unknown>;
    assertEquals(
      error["code"],
      -32602,
      "Error code must be -32602 (InvalidParams) when _meta is absent",
    );
  },
);

Deno.test(
  "stateless wire: GET /mcp returns HTTP 405 — SSE channel is gone",
  async () => {
    const h = await handler();
    const res = await h(
      new Request("http://localhost/mcp", { method: "GET" }),
    );

    assertEquals(
      res.status,
      405,
      "GET /mcp must return 405 in stateless mode (no SSE server-push channel)",
    );
  },
);

// ---------------------------------------------------------------------------
// The tests above prove how the LIBRARY behaves in stateless mode. They build
// their own McpApp, so they would pass even if server.ts reverted to stateful —
// which is precisely the regression that matters here. This one closes that gap.
// ---------------------------------------------------------------------------

Deno.test("server.ts configures the stateless transport", async () => {
  // A source assertion rather than a behavioural one, deliberately: server.ts
  // exports nothing (everything lives in a non-exported main()), and starting it
  // for real needs ERPNext credentials. Refactoring it to expose a testable
  // builder would be the cleaner fix, but that is a larger change than the one
  // this commit makes.
  //
  // What this catches: someone removing or flipping the option — the actual
  // regression. What it does not catch: the option being present but ineffective.
  // The wire tests above cover that half.
  const source = await Deno.readTextFile(
    new URL("../server.ts", import.meta.url),
  );

  assert(
    /transport:\s*"stateless"/.test(source),
    'server.ts must pass transport: "stateless" to McpApp — without it the ' +
      "default is stateful, and @casys/mcp-server 0.24 removes that mode entirely",
  );
  assert(
    !/transport:\s*"stateful"/.test(source),
    "server.ts must not configure the stateful transport",
  );
});
