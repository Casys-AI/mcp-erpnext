/**
 * ErpNext Tools Client
 *
 * Client for executing ERPNext tools with MCP interface support.
 * Follows the same pattern as lib/syson/src/client.ts and lib/plm/src/client.ts.
 *
 * @module lib/erpnext/src/client
 */

import {
  allTools,
  getCategories,
  getToolByName,
  getToolsByCategory,
  toolsByCategory,
} from "./tools/mod.ts";
import type {
  ErpNextTool,
  ErpNextToolCategory,
  ToolAnnotations,
} from "./tools/types.ts";
import type {
  MCPToolMeta,
  ToolHandler,
  ToolHandlerContext,
} from "@casys/mcp-server";
import { getFrappeClient } from "./api/frappe-client.ts";
import { runWithLinkDisambiguation } from "./mrtr/link-disambiguation.ts";
import {
  withUiRefreshRequest,
  withViewerToolCapabilities,
} from "./tools/ui-refresh.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A mutating tool may opt into viewer refresh only by returning an explicit,
 * valid request for a safe read-back tool. Read-only tools keep the generic
 * same-tool refresh behaviour.
 */
function withSafeUiRefresh(
  result: unknown,
  tool: ErpNextTool,
  args: Record<string, unknown>,
  availableToolNames: ReadonlySet<string>,
): unknown {
  const readOnly = tool.annotations?.readOnlyHint === true;
  if (!isRecord(result)) {
    return result;
  }
  // Certains outils déclarent leur viewer seulement sur la définition MCP.
  // Le payload enrichi doit connaître cette URI pour recevoir son contrat de
  // capacités et son refresh avant d'être sérialisé pour l'iframe.
  const resultMeta = isRecord(result._meta) ? result._meta : {};
  const declaredUi = tool._meta?.ui;
  const viewerResult = declaredUi && !isRecord(resultMeta.ui)
    ? {
      ...result,
      _meta: { ...resultMeta, ...tool._meta, ui: declaredUi },
    }
    : result;

  const request = isRecord(viewerResult.refreshRequest)
    ? viewerResult.refreshRequest
    : null;
  const target = request && typeof request.toolName === "string"
    ? getToolByName(request.toolName)
    : undefined;
  const hasSafeExplicitRefresh = request !== null &&
    typeof request.toolName === "string" &&
    availableToolNames.has(request.toolName) &&
    isRecord(request.arguments) &&
    (request.toolName === tool.name
      ? readOnly
      : target?.annotations?.readOnlyHint === true);

  if (hasSafeExplicitRefresh) {
    return withUiRefreshRequest(
      viewerResult,
      tool.name,
      args,
      new Date(),
      availableToolNames,
    );
  }

  // A malformed or mutating explicit target is more dangerous than no
  // refresh: strip it before the payload reaches a viewer.
  let sanitized = viewerResult;
  if ("refreshRequest" in viewerResult) {
    sanitized = { ...viewerResult };
    delete sanitized.refreshRequest;
  }

  return readOnly
    ? withUiRefreshRequest(
      sanitized,
      tool.name,
      args,
      new Date(),
      availableToolNames,
    )
    : withViewerToolCapabilities(sanitized, availableToolNames);
}

// Re-export from tools
export {
  allTools,
  getCategories,
  getToolByName,
  getToolsByCategory,
  toolsByCategory,
};

export type { ErpNextTool, ErpNextToolCategory };

// ============================================================================
// Wire format types (MCP protocol)
// ============================================================================

/** Minimal JSON Schema representation used for MCP tool input validation. */
export interface JSONSchema {
  /** JSON Schema type, e.g. "object", "string", "number", "array", "boolean" */
  type: string;
  /** Nested property schemas (for type "object") */
  properties?: Record<string, JSONSchema>;
  /** List of required property names */
  required?: string[];
  /** Human-readable description of the schema or property */
  description?: string;
  /** Additional JSON Schema keywords (e.g. `enum`, `items`, `default`) */
  [key: string]: unknown;
}

export type { ToolAnnotations } from "./tools/types.ts";

/** MCP protocol wire format for tool registration. Sent to MCP clients during `tools/list`. */
export interface MCPToolWireFormat {
  /** Unique tool name, e.g. "erpnext_list_customers" */
  name: string;
  /** Human-readable tool description shown to LLM / MCP client */
  description: string;
  /** JSON Schema defining the tool's input parameters */
  inputSchema: JSONSchema;
  /** Behavioural hints for model clients */
  annotations?: ToolAnnotations;
  /** Optional MCP metadata for UI rendering (e.g. iframe viewer resource URI) */
  _meta?: MCPToolMeta;
}

// ============================================================================
// ErpNextToolsClient Class
// ============================================================================

/** Configuration options for {@link ErpNextToolsClient}. */
export interface ErpNextToolsClientOptions {
  /** Restrict tools to specific categories (e.g. `["selling", "stock"]`). Omit to load all. */
  categories?: string[];
  /** Enable MRTR forms for ambiguous Link-field resolution. Default: false. */
  enableLinkDisambiguation?: boolean;
}

/**
 * Client for executing ERPNext tools.
 * Lazily initializes the Frappe HTTP client on first tool execution.
 */
export class ErpNextToolsClient {
  private tools: ErpNextTool[];
  private readonly enableLinkDisambiguation: boolean;

  constructor(options?: ErpNextToolsClientOptions) {
    this.enableLinkDisambiguation = options?.enableLinkDisambiguation ?? false;
    if (options?.categories) {
      this.tools = options.categories.flatMap((cat) => getToolsByCategory(cat));
    } else {
      this.tools = allTools;
    }
  }

  /** List available tools (with handler attached) */
  listTools(): ErpNextTool[] {
    return this.tools;
  }

  /** Convert tools to MCP wire format (for server registration) */
  toMCPFormat(): MCPToolWireFormat[] {
    return this.tools.map((t) => {
      const wire: MCPToolWireFormat = {
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema as JSONSchema,
      };
      if (t.annotations) wire.annotations = t.annotations;
      if (t._meta) wire._meta = t._meta;
      return wire;
    });
  }

  /**
   * Build a handlers Map for McpApp.registerTools().
   * Each handler wraps the tool to inject the FrappeClient context.
   * Errors are handled by the server's toolErrorMapper (configured in server.ts).
   *
   * Object results are returned as pre-formatted MCP results with both
   * `content` (text JSON for model clients) and `structuredContent` (the exact
   * machine-readable value). Viewer metadata is attached only when declared.
   * McpApp passes these results through unchanged.
   */
  buildHandlersMap(): Map<string, ToolHandler> {
    const handlers = new Map<string, ToolHandler>();
    const availableToolNames = new Set(this.tools.map((tool) => tool.name));
    for (const tool of this.tools) {
      const toolMeta = tool._meta;
      handlers.set(tool.name, async (
        args: Record<string, unknown>,
        mcpContext?: ToolHandlerContext,
      ) => {
        const client = getFrappeClient();
        const toolContext = {
          client,
          ...(mcpContext?.clientCapabilities !== undefined
            ? { clientCapabilities: mcpContext.clientCapabilities }
            : {}),
          ...(mcpContext?.inputResponses !== undefined
            ? { inputResponses: mcpContext.inputResponses }
            : {}),
          ...(mcpContext?.retryVerified !== undefined
            ? { retryVerified: mcpContext.retryVerified }
            : {}),
        };
        const execution = this.enableLinkDisambiguation
          ? await runWithLinkDisambiguation({
            args,
            context: mcpContext,
            enabled: true,
            execute: (callArgs) => tool.handler(callArgs, toolContext),
          })
          : {
            result: await tool.handler(args, toolContext),
            args,
          };
        if (
          execution.result !== null &&
          typeof execution.result === "object" &&
          !Array.isArray(execution.result) &&
          (execution.result as Record<string, unknown>).resultType ===
            "input_required"
        ) {
          return execution.result;
        }
        const result = withSafeUiRefresh(
          execution.result,
          tool,
          execution.args,
          availableToolNames,
        );

        // Every JSON object remains machine-readable, whether or not it has a
        // viewer. Check both result._meta.ui (list tools embed it) and
        // tool._meta.ui (some detail tools declare it on registration).
        const r = result !== null && typeof result === "object" &&
            !Array.isArray(result)
          ? result as Record<string, unknown>
          : null;
        const resultUi = r?._meta && typeof r._meta === "object" &&
          (r._meta as Record<string, unknown>).ui;
        const hasViewer = resultUi || toolMeta?.ui;

        if (r) {
          return {
            content: [{ type: "text", text: JSON.stringify(result) }],
            structuredContent: r,
            ...(hasViewer ? { _meta: r._meta ?? toolMeta } : {}),
          };
        }

        return result;
      });
    }
    return handlers;
  }

  /** Execute a tool by name */
  async execute(name: string, args: Record<string, unknown>): Promise<unknown> {
    const tool = this.tools.find((t) => t.name === name);
    if (!tool) {
      throw new Error(
        `[ErpNextToolsClient] Unknown tool: "${name}". ` +
          `Available: ${this.tools.map((t) => t.name).join(", ")}`,
      );
    }
    const client = getFrappeClient();
    const result = await tool.handler(args, { client });
    return withSafeUiRefresh(
      result,
      tool,
      args,
      new Set(this.tools.map((candidate) => candidate.name)),
    );
  }

  /** Get tool count */
  get count(): number {
    return this.tools.length;
  }
}

/** Default singleton client (all categories) */
export const defaultClient: ErpNextToolsClient = new ErpNextToolsClient();
