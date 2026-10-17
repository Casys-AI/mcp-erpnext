import type { ViewerKey } from "./canned.ts";

export type Rpc = (
  method: string,
  params: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

const PROTOCOL = "2026-07-28";
let nextId = 0;

export function liveRequest(
  method: string,
  params: Record<string, unknown>,
) {
  return {
    jsonrpc: "2.0",
    id: ++nextId,
    method,
    params: {
      ...params,
      _meta: {
        "io.modelcontextprotocol/protocolVersion": PROTOCOL,
        "io.modelcontextprotocol/clientCapabilities": {
          extensions: {
            "io.modelcontextprotocol/ui": {
              mimeTypes: ["text/html;profile=mcp-app"],
            },
          },
        },
      },
    },
  };
}

export const liveRpc: Rpc = async (method, params) => {
  const name = params.name ?? params.uri;
  const response = await fetch("/__mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      "MCP-Protocol-Version": PROTOCOL,
      "Mcp-Method": method,
      ...(typeof name === "string" ? { "Mcp-Name": name } : {}),
    },
    body: JSON.stringify(liveRequest(method, params)),
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  const data = raw.startsWith("event:") || raw.startsWith("data:")
    ? raw.split("\n").find((line) => line.startsWith("data:"))?.slice(5)
    : raw;
  if (!data) throw new Error("Le serveur MCP n’a pas renvoyé de résultat.");
  const message = JSON.parse(data);
  if (message.error) {
    throw new Error(message.error.message ?? "Échec de l’appel MCP.");
  }
  if (!response.ok || !message.result || typeof message.result !== "object") {
    throw new Error(`Serveur MCP indisponible (${response.status}).`);
  }
  return message.result;
};

export function livePayload(
  result: Record<string, unknown>,
): Record<string, unknown> {
  if (
    result.structuredContent && typeof result.structuredContent === "object"
  ) {
    return result.structuredContent as Record<string, unknown>;
  }
  if (Array.isArray(result.content)) {
    for (const block of result.content) {
      if (block.type !== "text" || typeof block.text !== "string") continue;
      try {
        const payload = JSON.parse(block.text);
        if (payload && typeof payload === "object") return payload;
      } catch {
        // A tool error can contain prose rather than JSON.
      }
    }
  }
  return {};
}

async function readTool(rpc: Rpc, name: string, args: Record<string, unknown>) {
  const result = await rpc("tools/call", { name, arguments: args });
  if (result.isError === true) {
    const message = Array.isArray(result.content)
      ? result.content.find((block) => block.type === "text")?.text
      : undefined;
    throw new Error(message ?? `Échec de ${name}.`);
  }
  return result;
}

function firstName(result: Record<string, unknown>, label: string): string {
  const rows = livePayload(result).data;
  const name = Array.isArray(rows) ? rows[0]?.name : undefined;
  if (typeof name !== "string" || !name) {
    throw new Error(`Aucune ${label} disponible dans ERPNext.`);
  }
  return name;
}

export function viewerNameOf(result: Record<string, unknown>): string {
  const payload = livePayload(result);
  const meta = payload._meta as { ui?: { resourceUri?: string } } | undefined;
  const uri = meta?.ui?.resourceUri;
  const match = typeof uri === "string"
    ? /^ui:\/\/mcp-erpnext\/([a-z-]+-viewer)$/.exec(uri)
    : null;
  if (!match) throw new Error("Cet outil ne fournit pas d’interface ERPNext.");
  return match[1];
}

export async function initialLiveResult(
  viewer: ViewerKey,
  rpc: Rpc = liveRpc,
  override?: { tool: string; args: Record<string, unknown> },
): Promise<Record<string, unknown>> {
  await rpc("server/discover", {});
  if (override) {
    const catalogue = await rpc("tools/list", {});
    const tool = Array.isArray(catalogue.tools)
      ? catalogue.tools.find((tool) => tool.name === override.tool)
      : undefined;
    if (tool?.annotations?.readOnlyHint !== true) {
      throw new Error(
        "Le chargement initial accepte uniquement un outil de lecture.",
      );
    }
    return await readTool(rpc, override.tool, override.args);
  }
  if (viewer === "doc") {
    const company = await readTool(rpc, "erpnext_company_list", { limit: 1 });
    return await readTool(rpc, "erpnext_doc_get", {
      doctype: "Company",
      name: firstName(company, "société"),
    });
  }
  if (viewer === "invoice") {
    const invoices = await readTool(rpc, "erpnext_sales_invoice_list", {
      limit: 1,
    });
    return await readTool(rpc, "erpnext_sales_invoice_get", {
      name: firstName(invoices, "facture"),
    });
  }
  const presets: Record<Exclude<ViewerKey, "doc" | "invoice">, {
    name: string;
    args: Record<string, unknown>;
  }> = {
    doclist: { name: "erpnext_company_list", args: { limit: 20 } },
    kanban: {
      name: "erpnext_kanban_get_board",
      args: { doctype: "Task", limit: 20 },
    },
    stock: { name: "erpnext_stock_balance", args: { limit: 20 } },
    funnel: { name: "erpnext_sales_funnel", args: {} },
    kpi: { name: "erpnext_kpi_revenue", args: {} },
    chart: { name: "erpnext_revenue_trend", args: { months: 6 } },
  };
  const preset = presets[viewer];
  return await readTool(rpc, preset.name, preset.args);
}
