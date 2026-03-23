/**
 * ErpNext Tool Interface
 *
 * Defines the shape of a single MCP tool in the ERPNext library,
 * following the same pattern as lib/syson and lib/plm.
 *
 * @module lib/erpnext/tools/types
 */

import type { FrappeClient } from "../api/frappe-client.ts";
import type { MCPToolMeta } from "@casys/mcp-server";

/**
 * Behavioural hints for model clients (mirrors MCP SDK ToolAnnotations).
 * Passed through in tools/list so hosts can adapt their UI accordingly.
 */
export interface ToolAnnotations {
  /** If true, tool has no side-effects and is safe to call speculatively */
  readOnlyHint?: boolean;
  /** If true, executing may produce irreversible effects */
  destructiveHint?: boolean;
  /** If true, repeated calls with same args produce same result */
  idempotentHint?: boolean;
  /** If true, tool may interact with entities outside the MCP system */
  openWorldHint?: boolean;
}

/** Available tool categories */
export type ErpNextToolCategory =
  | "sales"
  | "inventory"
  | "accounting"
  | "hr"
  | "kanban"
  | "project"
  | "operations"
  | "purchasing"
  | "delivery"
  | "manufacturing"
  | "crm"
  | "assets"
  | "setup"
  | "analytics";

/** JSON Schema for tool inputs (MCP wire format) */
export type JSONSchema = {
  type: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  description?: string;
  enum?: unknown[];
  items?: JSONSchema;
  [key: string]: unknown;
};

/** Context passed to every tool handler */
export interface ErpNextToolContext {
  client: FrappeClient;
}

/**
 * A single ERPNext MCP tool.
 * Each tool maps to one or more Frappe REST operations.
 */
export interface ErpNextTool {
  /** Unique tool name, snake_case, prefixed with erpnext_ */
  name: string;
  /** Human-readable description for the LLM */
  description: string;
  /** Category for grouping/filtering */
  category: ErpNextToolCategory;
  /** JSON Schema for tool input parameters */
  inputSchema: JSONSchema;
  /** Behavioural hints for model clients */
  annotations?: ToolAnnotations;
  /** MCP Apps UI metadata — uses MCPToolMeta from @casys/mcp-server */
  _meta?: MCPToolMeta;
  /** Execute the tool and return a JSON-serializable result */
  handler: (
    input: Record<string, unknown>,
    ctx: ErpNextToolContext,
  ) => Promise<unknown>;
}

/** MCP wire-format tool (for ConcurrentMCPServer registration) */
export interface MCPToolWireFormat {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  annotations?: ToolAnnotations;
  _meta?: MCPToolMeta;
}

/** Convert an ErpNextTool to MCP wire format */
export function toMCPWireFormat(tool: ErpNextTool): MCPToolWireFormat {
  const wire: MCPToolWireFormat = {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  };
  if (tool.annotations) wire.annotations = tool.annotations;
  if (tool._meta) wire._meta = tool._meta;
  return wire;
}
