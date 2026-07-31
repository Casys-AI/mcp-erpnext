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
import { FrappeAPIError, setFrappeClient } from "./api/frappe-client.ts";
import type { FrappeClient } from "./api/frappe-client.ts";
import { MemoryCache } from "./cache/memory.ts";
import { setCache } from "./cache/cache.ts";
import { ErpNextToolsClient } from "./client.ts";
import { linkDisambiguationRequestKey } from "./mrtr/link-disambiguation.ts";

// ---------------------------------------------------------------------------
// Shared fixture: one stateless server used by all tests
// ---------------------------------------------------------------------------

const PROTO_KEY = "io.modelcontextprotocol/protocolVersion";
const CLIENT_CAPS_KEY = "io.modelcontextprotocol/clientCapabilities";
const SERVER_INFO_KEY = "io.modelcontextprotocol/serverInfo";
const PROTO_VERSION = "2026-07-28";
const CACHE_TTL_MS = 3_600_000;
const MRTR_SIGNING_KEY = "0123456789abcdef".repeat(4);

/** Build a minimal McpApp configured exactly as server.ts configures it. */
function buildApp(): McpApp {
  const app = new McpApp({
    name: "mcp-erpnext-wire-test",
    version: "0.0.0",
    transport: "stateless",
    cache: { ttlMs: CACHE_TTL_MS, scope: "public" },
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

let _tasksHandler: FetchHandler | null = null;

async function tasksHandler(): Promise<FetchHandler> {
  if (!_tasksHandler) {
    _tasksHandler = await new McpApp({
      name: "mcp-erpnext-wire-tasks-test",
      version: "0.0.0",
      transport: "stateless",
      extensions: { "io.modelcontextprotocol/tasks": {} },
    }).getFetchHandler({ cors: false });
  }
  return _tasksHandler;
}

let _mrtrHandler: FetchHandler | null = null;

async function mrtrHandler(): Promise<FetchHandler> {
  if (!_mrtrHandler) {
    const app = new McpApp({
      name: "mcp-erpnext-wire-mrtr-test",
      version: "0.0.0",
      transport: "stateless",
      mrtr: { signingKey: MRTR_SIGNING_KEY },
    });
    app.registerTools(
      [{
        name: "choose_customer",
        description: "MRTR fixture",
        inputSchema: {
          type: "object" as const,
          properties: { customer: { type: "string" as const } },
          required: ["customer"],
        },
      }],
      new Map([
        [
          "choose_customer",
          (_args, context) => {
            if (context?.inputResponses === undefined) {
              return {
                resultType: "input_required",
                inputRequests: {
                  customer: {
                    method: "elicitation/create",
                    params: {
                      mode: "form",
                      message: "Choose a customer",
                      requestedSchema: {
                        type: "object",
                        properties: {
                          recordId: {
                            type: "string",
                            enum: ["CUST-001", "CUST-002"],
                          },
                        },
                        required: ["recordId"],
                      },
                    },
                  },
                },
              };
            }
            return {
              verified: context.retryVerified,
              response: context.inputResponses.customer,
            };
          },
        ],
      ]),
    );
    _mrtrHandler = await app.getFetchHandler({ cors: false });
  }
  return _mrtrHandler;
}

// ---------------------------------------------------------------------------
// Helper: build a well-formed stateless POST request
// ---------------------------------------------------------------------------

function request(
  method: string,
  params: Record<string, unknown> = {},
  headers: HeadersInit = {},
): Request {
  const payload = {
    jsonrpc: "2.0",
    id: 1,
    method,
    params: {
      _meta: {
        [PROTO_KEY]: PROTO_VERSION,
        [CLIENT_CAPS_KEY]: {},
      },
      ...params,
    },
  };
  return new Request("http://localhost/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "MCP-Protocol-Version": PROTO_VERSION,
      "Mcp-Method": method,
      ...headers,
    },
    body: JSON.stringify(payload),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test(
  "stateless wire: server/discover returns the 2026 result envelope and public cache hints",
  async () => {
    const h = await handler();
    const res = await h(request("server/discover"));

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

    const result = body.result as Record<string, unknown>;
    assertEquals(
      result["resultType"],
      "complete",
      "Every successful stateless result must identify itself as complete",
    );
    assertEquals(result["ttlMs"], CACHE_TTL_MS);
    assertEquals(result["cacheScope"], "public");

    const serverInfo = { name: "mcp-erpnext-wire-test", version: "0.0.0" };
    assertEquals(result["serverInfo"], serverInfo);
    const meta = result["_meta"] as Record<string, unknown>;
    assertEquals(meta[SERVER_INFO_KEY], serverInfo);
  },
);

Deno.test(
  "stateless wire: no Mcp-Session-Id header on any response",
  async () => {
    const h = await handler();
    const res = await h(request("server/discover"));

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
  "stateless wire: missing protocol header returns HeaderMismatch before body validation",
  async () => {
    const h = await handler();
    const res = await h(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Mcp-Method": "server/discover",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "server/discover",
          params: {},
        }),
      }),
    );
    assertEquals(
      res.status,
      400,
      "A missing required header must return HTTP 400",
    );

    const body = await res.json() as Record<string, unknown>;
    assert("error" in body, "Response must have an 'error' field");

    const error = body.error as Record<string, unknown>;
    assertEquals(
      error["code"],
      -32020,
      "Error code must be -32020 (HeaderMismatch) when a required header is absent",
    );
  },
);

Deno.test(
  "stateless wire: mismatched request metadata headers return HeaderMismatch",
  async () => {
    const h = await handler();
    const res = await h(request("server/discover", {}, {
      "Mcp-Method": "tools/list",
    }));

    assertEquals(res.status, 400);
    const body = await res.json() as Record<string, unknown>;
    const error = body.error as Record<string, unknown>;
    assertEquals(error["code"], -32020);
  },
);

Deno.test(
  "stateless wire: tools/call requires Mcp-Name to mirror params.name",
  async () => {
    const h = await handler();
    const res = await h(request("tools/call", { name: "ping", arguments: {} }));

    assertEquals(res.status, 400);
    const body = await res.json() as Record<string, unknown>;
    const error = body.error as Record<string, unknown>;
    assertEquals(error["code"], -32020);
  },
);

Deno.test(
  "stateless wire: missing client capabilities returns InvalidParams",
  async () => {
    const h = await handler();
    const res = await h(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "MCP-Protocol-Version": PROTO_VERSION,
          "Mcp-Method": "server/discover",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "server/discover",
          params: { _meta: { [PROTO_KEY]: PROTO_VERSION } },
        }),
      }),
    );

    assertEquals(res.status, 400);
    const body = await res.json() as Record<string, unknown>;
    const error = body.error as Record<string, unknown>;
    assertEquals(error["code"], -32602);
  },
);

Deno.test(
  "stateless wire: missing required client capability returns -32021",
  async () => {
    const h = await tasksHandler();
    const res = await h(request("tasks/get", { taskId: "task-1" }, {
      "Mcp-Name": "task-1",
    }));

    assertEquals(res.status, 400);
    const body = await res.json() as Record<string, unknown>;
    const error = body.error as Record<string, unknown>;
    assertEquals(error["code"], -32021);
    assertEquals(error["data"], {
      requiredCapabilities: {
        extensions: { "io.modelcontextprotocol/tasks": {} },
      },
    });
  },
);

Deno.test(
  "stateless wire: unsupported protocol version returns -32022 with recovery data",
  async () => {
    const h = await handler();
    const unsupportedVersion = "2025-11-25";
    const res = await h(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "MCP-Protocol-Version": unsupportedVersion,
          "Mcp-Method": "server/discover",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "server/discover",
          params: {
            _meta: {
              [PROTO_KEY]: unsupportedVersion,
              [CLIENT_CAPS_KEY]: {},
            },
          },
        }),
      }),
    );

    assertEquals(res.status, 400);
    const body = await res.json() as Record<string, unknown>;
    const error = body.error as Record<string, unknown>;
    assertEquals(error["code"], -32022);
    assertEquals(error["data"], {
      supported: [PROTO_VERSION],
      requested: unsupportedVersion,
    });
  },
);

Deno.test(
  "stateless wire: GET and DELETE /mcp return HTTP 405",
  async () => {
    const h = await handler();
    for (const method of ["GET", "DELETE"]) {
      const res = await h(new Request("http://localhost/mcp", { method }));
      assertEquals(res.status, 405, `${method} /mcp must return 405`);
    }
  },
);

Deno.test(
  "stateless wire: MRTR signs requestState, rejects tampering, and verifies the retry",
  async () => {
    const h = await mrtrHandler();
    const capabilities = { elicitation: {} };
    const originalArgs = { customer: "Acme" };
    const first = await h(request("tools/call", {
      name: "choose_customer",
      arguments: originalArgs,
      _meta: {
        [PROTO_KEY]: PROTO_VERSION,
        [CLIENT_CAPS_KEY]: capabilities,
      },
    }, { "Mcp-Name": "choose_customer" }));

    assertEquals(first.status, 200);
    const firstBody = await first.json() as Record<string, unknown>;
    const firstResult = firstBody.result as Record<string, unknown>;
    assertEquals(firstResult.resultType, "input_required");
    assert(
      typeof firstResult.requestState === "string" &&
        firstResult.requestState.length > 20,
      "A signed requestState token must accompany input_required",
    );

    const inputResponses = {
      customer: {
        action: "accept",
        content: { recordId: "CUST-002" },
      },
    };
    const tampered = `${firstResult.requestState}x`;
    const rejected = await h(request("tools/call", {
      name: "choose_customer",
      arguments: originalArgs,
      inputResponses,
      requestState: tampered,
      _meta: {
        [PROTO_KEY]: PROTO_VERSION,
        [CLIENT_CAPS_KEY]: capabilities,
      },
    }, { "Mcp-Name": "choose_customer" }));

    assertEquals(rejected.status, 400);
    const rejectedBody = await rejected.json() as Record<string, unknown>;
    const rejectedError = rejectedBody.error as Record<string, unknown>;
    assertEquals(rejectedError.code, -32602);

    const accepted = await h(request("tools/call", {
      name: "choose_customer",
      arguments: originalArgs,
      inputResponses,
      requestState: firstResult.requestState,
      _meta: {
        [PROTO_KEY]: PROTO_VERSION,
        [CLIENT_CAPS_KEY]: capabilities,
      },
    }, { "Mcp-Name": "choose_customer" }));

    assertEquals(accepted.status, 200);
    const acceptedBody = await accepted.json() as Record<string, unknown>;
    const acceptedResult = acceptedBody.result as Record<string, unknown>;
    assertEquals(acceptedResult.resultType, "complete");
    const content = acceptedResult.content as Array<Record<string, unknown>>;
    const payload = JSON.parse(String(content[0].text));
    assertEquals(payload.verified, true);
    assertEquals(payload.response, inputResponses.customer);
  },
);

Deno.test(
  "stateless wire: signed MRTR crosses the ERPNext handler boundary before a write",
  async () => {
    setCache(new MemoryCache());
    let createCalls = 0;
    let createdData: Record<string, unknown> | undefined;
    const frappeClient = {
      get: async (_doctype: string, name: string) => {
        if (name === "CUST-002") return { name };
        throw new FrappeAPIError("not found", 404, null);
      },
      list: async () => [
        { name: "CUST-001", customer_name: "Acme" },
        { name: "CUST-002", customer_name: "Acme" },
      ],
      create: async (_doctype: string, data: Record<string, unknown>) => {
        createCalls++;
        createdData = data;
        return { name: "QTN-TEST", ...data };
      },
    } as unknown as FrappeClient;
    setFrappeClient(frappeClient);

    try {
      const toolsClient = new ErpNextToolsClient({
        categories: ["sales"],
        enableLinkDisambiguation: true,
      });
      const app = new McpApp({
        name: "mcp-erpnext-wire-erp-mrtr-test",
        version: "0.0.0",
        transport: "stateless",
        mrtr: { signingKey: MRTR_SIGNING_KEY },
      });
      app.registerTools(
        toolsClient.toMCPFormat(),
        toolsClient.buildHandlersMap(),
      );
      const h = await app.getFetchHandler({ cors: false });
      const capabilities = { elicitation: {} };
      const originalArgs = {
        quotation_to: "Customer",
        party_name: "Acme",
        items: [{ item_code: "ITEM-001", qty: 1, rate: 100 }],
      };
      const meta = {
        [PROTO_KEY]: PROTO_VERSION,
        [CLIENT_CAPS_KEY]: capabilities,
      };

      const first = await h(request("tools/call", {
        name: "erpnext_quotation_create",
        arguments: originalArgs,
        _meta: meta,
      }, { "Mcp-Name": "erpnext_quotation_create" }));
      assertEquals(first.status, 200);
      assertEquals(createCalls, 0);
      const firstBody = await first.json() as Record<string, unknown>;
      const firstResult = firstBody.result as Record<string, unknown>;
      assertEquals(firstResult.resultType, "input_required");
      const requestKey = linkDisambiguationRequestKey("party_name");
      const requests = firstResult.inputRequests as Record<string, unknown>;
      assert(requestKey in requests);

      const inputResponses = {
        [requestKey]: {
          action: "accept",
          content: { recordId: "CUST-002" },
        },
      };
      const retry = await h(request("tools/call", {
        name: "erpnext_quotation_create",
        arguments: originalArgs,
        inputResponses,
        requestState: firstResult.requestState,
        _meta: meta,
      }, { "Mcp-Name": "erpnext_quotation_create" }));

      assertEquals(retry.status, 200);
      assertEquals(createCalls, 1);
      assertEquals(createdData?.party_name, "CUST-002");
      const retryBody = await retry.json() as Record<string, unknown>;
      const retryResult = retryBody.result as Record<string, unknown>;
      assertEquals(retryResult.resultType, "complete");
    } finally {
      setFrappeClient(null);
    }
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
  assert(
    /cache:\s*\{\s*ttlMs:\s*3_600_000,\s*scope:\s*"public",\s*\}/s
      .test(source),
    "server.ts must advertise public one-hour protocol cache hints",
  );
  assert(
    /mrtr:\s*mrtrConfig/.test(source) &&
      /enableLinkDisambiguation:\s*mrtrConfig\s*!==\s*undefined/.test(source),
    "server.ts must enable Link-field MRTR only when signed MRTR config exists",
  );
  assert(
    !source.includes("io.modelcontextprotocol/tasks"),
    "server.ts must not advertise process-local Tasks",
  );
});
