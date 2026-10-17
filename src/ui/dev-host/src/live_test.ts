import { assertEquals, assertRejects } from "@std/assert";
import {
  initialLiveResult,
  livePayload,
  liveRequest,
  liveRpc,
  type Rpc,
  viewerNameOf,
} from "./live.ts";

Deno.test("dev-host live - modern requests announce Apps and the supported MIME", () => {
  const request = liveRequest("tools/call", {
    name: "erpnext_company_list",
    arguments: {},
  });
  assertEquals(request.params._meta, {
    "io.modelcontextprotocol/protocolVersion": "2026-07-28",
    "io.modelcontextprotocol/clientCapabilities": {
      extensions: {
        "io.modelcontextprotocol/ui": {
          mimeTypes: ["text/html;profile=mcp-app"],
        },
      },
    },
  });
});

Deno.test("dev-host live - document preset resolves the real company and keeps its result", async () => {
  const calls: [string, Record<string, unknown>][] = [];
  // Forme actuelle du serveur : données métier dans `structuredContent`,
  // `_meta` déclaré au niveau du résultat (découpage modèle/vue).
  const document = {
    content: [],
    structuredContent: {
      data: { doctype: "Company", name: "Real Company" },
    },
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/doc-viewer" } },
  };
  const rpc: Rpc = async (method, args) => {
    calls.push([method, args]);
    if (method === "server/discover") return {};
    if (args.name === "erpnext_company_list") {
      return { structuredContent: { data: [{ name: "Real Company" }] } };
    }
    return document;
  };
  const result = await initialLiveResult("doc", rpc);
  assertEquals(result, document);
  assertEquals(viewerNameOf(result), "doc-viewer");
  assertEquals(calls[2], ["tools/call", {
    name: "erpnext_doc_get",
    arguments: { doctype: "Company", name: "Real Company" },
  }]);
});

Deno.test("dev-host live - viewerNameOf still reads the legacy payload _meta", () => {
  const legacy = {
    structuredContent: {
      data: [],
      _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
    },
  };
  assertEquals(viewerNameOf(legacy), "doclist-viewer");
});

Deno.test("dev-host live - automatic initial loading refuses write tools before calling them", async () => {
  const calls: string[] = [];
  const rpc: Rpc = async (method) => {
    calls.push(method);
    return method === "tools/list"
      ? {
        tools: [{
          name: "erpnext_doc_delete",
          annotations: { readOnlyHint: false },
        }],
      }
      : {};
  };
  await assertRejects(
    () =>
      initialLiveResult("doc", rpc, {
        tool: "erpnext_doc_delete",
        args: { name: "KEEP-ME" },
      }),
    Error,
    "uniquement un outil de lecture",
  );
  assertEquals(calls, ["server/discover", "tools/list"]);
});

Deno.test("dev-host live - empty invoice population gives a clear error without a fake get", async () => {
  const calls: string[] = [];
  const rpc: Rpc = async (_method, params) => {
    if (typeof params.name === "string") calls.push(params.name);
    return { structuredContent: { data: [] } };
  };
  await assertRejects(
    () => initialLiveResult("invoice", rpc),
    Error,
    "Aucune facture",
  );
  assertEquals(calls, ["erpnext_sales_invoice_list"]);
});

Deno.test("dev-host live - proxy transport preserves one binary resource without JSON wrapping", async () => {
  const originalFetch = globalThis.fetch;
  const result = {
    content: [
      { type: "text", text: '{"file_name":"sample.txt"}' },
      {
        type: "resource",
        resource: {
          uri: "erpnext://file/sample.txt",
          mimeType: "text/plain",
          blob: "aGVsbG8=",
        },
      },
    ],
    resultType: "complete",
  };
  try {
    globalThis.fetch = ((_input: unknown, init: RequestInit) => {
      assertEquals(
        new Headers(init.headers).get("Mcp-Name"),
        "erpnext_file_download",
      );
      return Promise.resolve(
        new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result })),
      );
    }) as typeof fetch;
    const received = await liveRpc("tools/call", {
      name: "erpnext_file_download",
      arguments: {},
    });
    assertEquals(received, result);
    assertEquals(livePayload(received), { file_name: "sample.txt" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
