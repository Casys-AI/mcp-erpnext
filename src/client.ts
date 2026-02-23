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
import type { ErpNextTool, ErpNextToolCategory } from "./tools/types.ts";
import { getFrappeClient } from "./api/frappe-client.ts";

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

/** MCP protocol wire format for tool registration. Sent to MCP clients during `tools/list`. */
export interface MCPToolWireFormat {
  /** Unique tool name, e.g. "erpnext_list_customers" */
  name: string;
  /** Human-readable tool description shown to LLM / MCP client */
  description: string;
  /** JSON Schema defining the tool's input parameters */
  inputSchema: JSONSchema;
  /** Optional MCP metadata for UI rendering (e.g. iframe viewer resource URI) */
  _meta?: { ui: { resourceUri: string } };
}

// ============================================================================
// ErpNextToolsClient Class
// ============================================================================

/** Configuration options for {@link ErpNextToolsClient}. */
export interface ErpNextToolsClientOptions {
  /** Restrict tools to specific categories (e.g. `["selling", "stock"]`). Omit to load all. */
  categories?: string[];
}

/**
 * Client for executing ERPNext tools.
 * Lazily initializes the Frappe HTTP client on first tool execution.
 */
export class ErpNextToolsClient {
  private tools: ErpNextTool[];

  constructor(options?: ErpNextToolsClientOptions) {
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
      if (t._meta) wire._meta = t._meta;
      return wire;
    });
  }

  /**
   * Build a handlers Map for ConcurrentMCPServer.registerTools().
   * Each handler wraps the tool to inject the FrappeClient context.
   */
  buildHandlersMap(): Map<string, (args: Record<string, unknown>) => Promise<unknown>> {
    const handlers = new Map<string, (args: Record<string, unknown>) => Promise<unknown>>();
    for (const tool of this.tools) {
      handlers.set(tool.name, (args: Record<string, unknown>) => {
        const client = getFrappeClient();
        return tool.handler(args, { client });
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
    return await tool.handler(args, { client });
  }

  /** Get tool count */
  get count(): number {
    return this.tools.length;
  }
}

/** Default singleton client (all categories) */
export const defaultClient: ErpNextToolsClient = new ErpNextToolsClient();
