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
import { resolveToolSelection, type ToolSelection } from "./tools/selection.ts";
import { getFrappeClient } from "./api/frappe-client.ts";
import { runWithLinkDisambiguation } from "./mrtr/link-disambiguation.ts";
import {
  withUiRefreshRequest,
  withViewerToolCapabilities,
} from "./tools/ui-refresh.ts";
import { fetchDocTypeLayout } from "./tools/doctype-layout.ts";
import { splitViewerResult, VIEWER_META_KEY } from "./tools/model-visible.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The attachment download tool returns an already-formed MCP result. Keep the
 * guard deliberately narrow so an ordinary business object with a `content`
 * property cannot bypass viewer enrichment or JSON serialization.
 */
function isSingleEmbeddedBlobResult(value: unknown): boolean {
  if (!isRecord(value) || !Array.isArray(value.content)) return false;
  if (Object.keys(value).some((key) => key !== "content")) return false;
  if (value.content.length !== 2) return false;

  const [summary, embedded] = value.content;
  if (
    !isRecord(summary) || summary.type !== "text" ||
    typeof summary.text !== "string"
  ) {
    return false;
  }
  if (!isRecord(embedded) || embedded.type !== "resource") return false;
  if (!isRecord(embedded.resource)) return false;

  const resource = embedded.resource;
  return typeof resource.uri === "string" &&
    resource.uri.startsWith("file:///") &&
    typeof resource.mimeType === "string" &&
    typeof resource.blob === "string";
}

/**
 * Le DocType d'un résultat qui est une fiche unique : `data` porte `doctype`
 * et `name` (forme normale), ou le résultat est lui-même l'enregistrement
 * (forme directe lue par `documentEnvelopeOf` côté vue). Une liste (`data` en
 * tableau) n'en est pas une.
 */
function singleDocumentDoctypeOf(
  result: Record<string, unknown>,
): string | undefined {
  const nonEmpty = (value: unknown): value is string =>
    typeof value === "string" && value.trim().length > 0;
  const document = isRecord(result.data) && nonEmpty(result.data.doctype) &&
      nonEmpty(result.data.name)
    ? result.data
    : !Array.isArray(result.data) && nonEmpty(result.doctype) &&
        nonEmpty(result.name)
    ? result
    : undefined;
  return document ? (document.doctype as string).trim() : undefined;
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
export {
  assertNonEmptySelection,
  resolveToolSelection,
  ToolFilterError,
} from "./tools/selection.ts";
export type {
  ToolFilterReason,
  ToolFilterWarning,
  ToolSelection,
  ToolSelectionOptions,
} from "./tools/selection.ts";

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
  /**
   * Restrict tools to specific categories (e.g. `["sales", "inventory"]`; see
   * `getCategories()`). Omit to load all. Unknown names are ignored and
   * reported in `ErpNextToolsClient.selection.warnings`.
   */
  categories?: string[];
  /**
   * Remove whole categories from the selection (e.g. `["buy"]`). Applied after
   * `categories`. Unknown names throw a `ToolFilterError`.
   */
  excludeCategories?: string[];
  /**
   * Remove individual tools by exact name (e.g. `["erpnext_file_list"]`).
   * Applied after `categories`. Unknown names throw a `ToolFilterError`.
   */
  excludeTools?: string[];
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
  /** How the active tool list was resolved (warnings, effective filters). */
  readonly selection: ToolSelection;

  constructor(options?: ErpNextToolsClientOptions) {
    this.enableLinkDisambiguation = options?.enableLinkDisambiguation ?? false;
    this.selection = resolveToolSelection({
      categories: options?.categories,
      excludeCategories: options?.excludeCategories,
      excludeTools: options?.excludeTools,
    });
    this.tools = this.selection.tools;
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
   * machine-readable value). Both carry only domain data : l'enrichissement
   * viewer (refresh, sauts, `_availableTools`…) part dans
   * `_meta["io.casys/viewer"]`, le seul canal caché au modèle sur tous les
   * hôtes, que la vue refusionne à la lecture. McpApp passes these results
   * through unchanged.
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
        if (
          tool.name === "erpnext_file_download" &&
          isSingleEmbeddedBlobResult(execution.result)
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
          // Fiche unique avec viewer : la vue reçoit la mise en page ERPNext
          // du DocType (fail-soft : `null` ne change rien au résultat).
          const layoutDoctype = hasViewer
            ? singleDocumentDoctypeOf(r)
            : undefined;
          const fieldLayout = layoutDoctype
            ? await fetchDocTypeLayout(client, layoutDoctype)
            : null;
          // Le modèle ne lit que le métier : l'enrichissement viewer part
          // dans `_meta`, caché au modèle mais livré à la vue avec le
          // CallToolResult complet. Sans enrichissement, le `_meta` déclaré
          // passe inchangé, comme avant.
          const { data, viewer } = splitViewerResult(
            fieldLayout ? { ...r, _fieldLayout: fieldLayout } : r,
          );
          const declaredMeta = r._meta ?? toolMeta;
          const hasEnrichment = Object.keys(viewer).length > 0;
          const meta = hasEnrichment
            ? {
              ...(isRecord(declaredMeta) ? declaredMeta : {}),
              [VIEWER_META_KEY]: { version: 1, ...viewer },
            }
            : hasViewer
            ? declaredMeta
            : undefined;
          return {
            content: [{ type: "text", text: JSON.stringify(data) }],
            structuredContent: data,
            ...(meta !== undefined ? { _meta: meta } : {}),
          };
        }

        return result;
      });
    }
    return handlers;
  }

  /**
   * Execute a tool by name.
   *
   * API bibliothèque : renvoie le résultat enrichi complet, clés viewer
   * incluses, sans le découpage modèle/vue de `buildHandlersMap`. Le handler
   * ne reçoit que le client Frappe, sans capacités MCP du client :
   * `erpnext_file_download` y est donc toujours refusé (`FileDownloadError`,
   * `APP_CONTEXT_REQUIRED`) — les octets des pièces jointes ne sont servis
   * qu'aux hôtes MCP Apps via le serveur MCP.
   */
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
    if (
      tool.name === "erpnext_file_download" &&
      isSingleEmbeddedBlobResult(result)
    ) {
      return result;
    }
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
