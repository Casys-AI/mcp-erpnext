/**
 * erpnext_file_download invariant: no file bytes without the MCP Apps extension.
 *
 * `visibility: ["app"]` only hides the tool from `tools/list`; `tools/call`
 * cannot tell an App from a model. The server therefore refuses, before any
 * Frappe request, every client that did not announce the MCP Apps extension
 * (`io.modelcontextprotocol/ui`, MIME `text/html;profile=mcp-app`).
 *
 * These tests drive the real tool registry through the real McpApp stateless
 * HTTP stack and through the `buildHandlersMap()` / `execute()` entry points.
 * They pin the maintainer's absolute constraint: file content never reaches a
 * client that is not an MCP Apps host, whatever its size, as base64 or
 * otherwise.
 *
 * @module src/file_download_guard_test
 */

import { assert, assertEquals, assertFalse, assertRejects } from "@std/assert";
import { McpApp } from "@casys/mcp-server";
import type { FetchHandler, ToolHandlerContext } from "@casys/mcp-server";
import { setFrappeClient } from "./api/frappe-client.ts";
import type { FrappeClient } from "./api/frappe-client.ts";
import { ErpNextToolsClient } from "./client.ts";
import { FileDownloadError } from "./tools/file-download-error.ts";

const PROTO_KEY = "io.modelcontextprotocol/protocolVersion";
const CLIENT_CAPS_KEY = "io.modelcontextprotocol/clientCapabilities";
const PROTO_VERSION = "2026-07-28";

const TOOL = "erpnext_file_download";
const INPUT = {
  file_id: "FILE-1",
  attached_to_doctype: "Task",
  attached_to_name: "TASK-1",
};

/** 64 KiB of non-trivial bytes: its base64 form is easy to detect. */
const FILE_BYTES = new Uint8Array(64 * 1024).map((_, i) => (i * 7 + 3) % 251);
const FILE_BASE64 = (() => {
  let binary = "";
  for (const byte of FILE_BYTES) binary += String.fromCharCode(byte);
  return btoa(binary);
})();

const APPS_CAPABILITIES = {
  extensions: {
    "io.modelcontextprotocol/ui": { mimeTypes: ["text/html;profile=mcp-app"] },
  },
};

/** Frappe stand-in: counts every call, whichever method is used. */
function makeCountingFrappe() {
  const calls: string[] = [];
  const client = new Proxy({}, {
    get: (_target, property) => (..._args: unknown[]) => {
      calls.push(String(property));
      if (property === "downloadFile") {
        return Promise.resolve({
          fileId: "FILE-1",
          fileName: "big.pdf",
          mimeType: "application/pdf",
          bytes: FILE_BYTES,
          isPrivate: true,
        });
      }
      return Promise.resolve({ name: "TASK-1", doctype: "Task" });
    },
  }) as unknown as FrappeClient;
  return { client, calls };
}

/** McpApp wired like server.ts: real tools, real handlers, same error mapper. */
async function buildWireHandler(): Promise<FetchHandler> {
  const toolsClient = new ErpNextToolsClient({ categories: ["operations"] });
  const app = new McpApp({
    name: "mcp-erpnext-download-guard-test",
    version: "0.0.0",
    transport: "stateless",
    validateSchema: true,
    // Same contract as server.ts: only error.message reaches the wire.
    toolErrorMapper: (error: unknown) =>
      error instanceof Error ? error.message : String(error),
  });
  app.registerTools(toolsClient.toMCPFormat(), toolsClient.buildHandlersMap());
  return await app.getFetchHandler({ cors: false });
}

function toolCall(
  name: string,
  args: Record<string, unknown>,
  capabilities: Record<string, unknown>,
): Request {
  return new Request("http://localhost/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "MCP-Protocol-Version": PROTO_VERSION,
      "Mcp-Method": "tools/call",
      "Mcp-Name": name,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name,
        arguments: args,
        _meta: {
          [PROTO_KEY]: PROTO_VERSION,
          [CLIENT_CAPS_KEY]: capabilities,
        },
      },
    }),
  });
}

async function callOverHttp(capabilities: Record<string, unknown>) {
  const { client, calls } = makeCountingFrappe();
  setFrappeClient(client);
  try {
    const handler = await buildWireHandler();
    const response = await handler(toolCall(TOOL, INPUT, capabilities));
    const raw = await response.text();
    return { status: response.status, raw, calls };
  } finally {
    setFrappeClient(null);
  }
}

Deno.test("file_download over HTTP stateless - a client without MCP Apps gets an error, zero Frappe requests and no base64", async () => {
  for (
    const capabilities of [
      {},
      { elicitation: {} },
      { extensions: { "io.modelcontextprotocol/ui": {} } },
      {
        extensions: {
          "io.modelcontextprotocol/ui": { mimeTypes: ["text/plain"] },
        },
      },
    ]
  ) {
    const { status, raw, calls } = await callOverHttp(capabilities);
    const label = JSON.stringify(capabilities);
    assertEquals(status, 200, label);
    assertEquals(calls, [], `${label}: Frappe must not be reached`);
    assertFalse(raw.includes(FILE_BASE64.slice(0, 64)), `${label}: no base64`);
    assertFalse(raw.includes('"resource"'), `${label}: no embedded resource`);
    assert(raw.length < 2_048, `${label}: small response (${raw.length} B)`);

    const body = JSON.parse(raw) as {
      result: { isError?: boolean; content: Array<{ text: string }> };
    };
    assertEquals(body.result.isError, true, label);
    const text = body.result.content[0].text;
    assert(
      text.startsWith(
        "[erpnext_file_download] APP_CONTEXT_REQUIRED: ",
      ),
      text,
    );
    assert(text.includes(". Recovery: "), text);
    assert(text.includes("erpnext_file_list"), text);
  }
});

Deno.test("file_download over HTTP stateless - an MCP Apps host still receives exactly one blob", async () => {
  const { status, raw, calls } = await callOverHttp(APPS_CAPABILITIES);
  assertEquals(status, 200);
  assertEquals(calls, ["downloadFile"]);
  assertEquals(raw.split(FILE_BASE64).length - 1, 1, "exactly one base64 copy");
  const body = JSON.parse(raw) as {
    result: {
      isError?: boolean;
      content: Array<{
        type: string;
        resource?: { mimeType: string; blob: string };
      }>;
    };
  };
  assert(!body.result.isError);
  const resources = body.result.content.filter((b) => b.type === "resource");
  assertEquals(resources.length, 1);
  assertEquals(resources[0].resource?.blob, FILE_BASE64);
});

Deno.test("file_download over HTTP stateless - the tool stays hidden from tools/list", async () => {
  const handler = await buildWireHandler();
  const response = await handler(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "MCP-Protocol-Version": PROTO_VERSION,
        "Mcp-Method": "tools/list",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {
          _meta: {
            [PROTO_KEY]: PROTO_VERSION,
            [CLIENT_CAPS_KEY]: APPS_CAPABILITIES,
          },
        },
      }),
    }),
  );
  const body = await response.json() as {
    result: { tools: Array<{ name: string }> };
  };
  const names = body.result.tools.map((tool) => tool.name);
  assert(names.includes("erpnext_file_list"));
  assertFalse(names.includes(TOOL));
});

Deno.test("file_download via buildHandlersMap (stdio path) - refuses without the extension, serves with it", async () => {
  const { client, calls } = makeCountingFrappe();
  setFrappeClient(client);
  try {
    const handler = new ErpNextToolsClient({ categories: ["operations"] })
      .buildHandlersMap().get(TOOL)!;

    for (
      const context of [
        undefined,
        { toolName: TOOL } as ToolHandlerContext,
        { toolName: TOOL, clientCapabilities: {} } as ToolHandlerContext,
      ]
    ) {
      const error = await assertRejects(
        () => Promise.resolve(handler(INPUT, context)),
        FileDownloadError,
      );
      assertEquals(error.code, "APP_CONTEXT_REQUIRED");
    }
    assertEquals(calls, []);

    const result = await handler(INPUT, {
      toolName: TOOL,
      clientCapabilities: APPS_CAPABILITIES,
    } as ToolHandlerContext);
    assertEquals(calls, ["downloadFile"]);
    assertEquals(JSON.stringify(result).split(FILE_BASE64).length - 1, 1);
  } finally {
    setFrappeClient(null);
  }
});

Deno.test("ErpNextToolsClient.execute - the library entry point carries no client capabilities, so file_download is refused", async () => {
  const { client, calls } = makeCountingFrappe();
  setFrappeClient(client);
  try {
    const toolsClient = new ErpNextToolsClient({ categories: ["operations"] });
    const error = await assertRejects(
      () => toolsClient.execute(TOOL, INPUT),
      FileDownloadError,
    );
    assertEquals(error.code, "APP_CONTEXT_REQUIRED");
    assertEquals(calls, []);
  } finally {
    setFrappeClient(null);
  }
});
