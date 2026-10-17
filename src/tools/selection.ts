/**
 * Tool selection — which tools a server instance exposes.
 *
 * Pure module (no I/O). Semantics, fixed once at server startup:
 *
 *   selection = (categories ?? every category) minus excludeCategories
 *                                             minus excludeTools
 *
 * - No option at all returns `allTools` itself (same reference, same order).
 * - `categories` is the historical allow-list and stays lenient: an unknown
 *   name is ignored and reported in `warnings`. An empty result is NOT thrown
 *   here (library compatibility); call {@link assertNonEmptySelection} at the
 *   process boundary.
 * - `excludeCategories` / `excludeTools` are strict: an unknown name throws
 *   {@link ToolFilterError}. Tool names are validated against the COMPLETE
 *   registry, so excluding a tool that an allow-list already dropped is a no-op.
 * - Deduplicated by tool name; order follows the given categories (or the
 *   registry order), so the result is deterministic.
 *
 * @module lib/erpnext/tools/selection
 */

import { allTools, toolsByCategory } from "./mod.ts";
import type { ErpNextTool } from "./types.ts";
import { formatToolError } from "./errors.ts";

export const TOOL_FILTER_ERROR_CODE = "INVALID_TOOL_FILTER" as const;

/** Why a filter is invalid. Stable enum, parse `context.reason`, not prose. */
export const TOOL_FILTER_REASONS = [
  "UNKNOWN_CATEGORY",
  "UNKNOWN_TOOL",
  "MALFORMED_FLAG",
  "DUPLICATE_FLAG",
  "EMPTY_VALUE",
  "EMPTY_SELECTION",
] as const;

export type ToolFilterReason = typeof TOOL_FILTER_REASONS[number];

/** Prefix of the rendered message: the subject of the failure. */
const SUBJECT = "mcp-erpnext";

/**
 * Renders the common machine-readable-and-readable error shape:
 * `[<subject>] <CODE>: <message>. Recovery: <recovery>`
 */
export function formatToolFilterMessage(
  detail: string,
  recovery: string,
  subject: string = SUBJECT,
): string {
  return formatToolError(subject, TOOL_FILTER_ERROR_CODE, detail, recovery);
}

/** Startup-time failure of a tool filter (flag, env var or option). */
export class ToolFilterError extends Error {
  readonly code = TOOL_FILTER_ERROR_CODE;
  readonly reason: ToolFilterReason;
  readonly retryable = false;
  readonly context: Readonly<Record<string, unknown>>;
  readonly recovery: string;
  readonly detail: string;

  constructor(
    reason: ToolFilterReason,
    detail: string,
    options: { context?: Record<string, unknown>; recovery: string },
  ) {
    super(formatToolFilterMessage(detail, options.recovery));
    this.name = "ToolFilterError";
    this.reason = reason;
    this.detail = detail;
    this.recovery = options.recovery;
    this.context = Object.freeze({ ...(options.context ?? {}), reason });
  }
}

export function isToolFilterError(error: unknown): error is ToolFilterError {
  return error instanceof ToolFilterError;
}

/** Non-fatal counterpart of {@link ToolFilterError} (same shape, not thrown). */
export interface ToolFilterWarning {
  readonly code: typeof TOOL_FILTER_ERROR_CODE;
  readonly reason: ToolFilterReason;
  readonly message: string;
  readonly context: Readonly<Record<string, unknown>>;
  readonly recovery: string;
}

export interface ToolSelectionOptions {
  /** Allow-list of categories. Unknown names are ignored with a warning. */
  categories?: readonly string[];
  /** Categories to remove. Unknown names throw. */
  excludeCategories?: readonly string[];
  /** Tool names to remove. Unknown names throw. */
  excludeTools?: readonly string[];
}

export interface ToolSelection {
  readonly tools: ErpNextTool[];
  /** Deduplicated allow-list as given (undefined = every category). */
  readonly categories?: readonly string[];
  readonly excludedCategories: readonly string[];
  readonly excludedTools: readonly string[];
  readonly warnings: readonly ToolFilterWarning[];
}

export interface ToolRegistry {
  readonly toolsByCategory: Readonly<Record<string, readonly ErpNextTool[]>>;
  readonly allTools: ErpNextTool[];
}

const DEFAULT_REGISTRY: ToolRegistry = { toolsByCategory, allTools };

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function unknownCategoryDetail(
  unknown: readonly string[],
  valid: string[],
  ignored = false,
) {
  return `Unknown categor${unknown.length > 1 ? "ies" : "y"} ` +
    `${unknown.map((c) => `"${c}"`).join(", ")}` +
    `${ignored ? " (ignored)" : ""}; valid categories: ${valid.join(", ")}`;
}

const CATEGORY_RECOVERY =
  "use only valid category names (case-sensitive, comma-separated)";

/** Resolve the active tool list. Throws {@link ToolFilterError} on strict inputs. */
export function resolveToolSelection(
  options: ToolSelectionOptions = {},
  registry: ToolRegistry = DEFAULT_REGISTRY,
): ToolSelection {
  const { categories, excludeCategories, excludeTools } = options;

  if (
    categories === undefined && excludeCategories === undefined &&
    excludeTools === undefined
  ) {
    return {
      tools: registry.allTools,
      excludedCategories: [],
      excludedTools: [],
      warnings: [],
    };
  }

  const validCategories = Object.keys(registry.toolsByCategory);
  const validSet = new Set(validCategories);
  const warnings: ToolFilterWarning[] = [];

  const excludedCategories = unique(excludeCategories ?? []);
  const unknownExcluded = excludedCategories.filter((c) => !validSet.has(c));
  if (unknownExcluded.length > 0) {
    throw new ToolFilterError(
      "UNKNOWN_CATEGORY",
      unknownCategoryDetail(unknownExcluded, validCategories),
      {
        context: {
          option: "excludeCategories",
          received: unknownExcluded,
          valid: validCategories,
        },
        recovery: CATEGORY_RECOVERY,
      },
    );
  }

  const excludedTools = unique(excludeTools ?? []);
  const validToolNames = registry.allTools.map((t) => t.name);
  const toolNameSet = new Set(validToolNames);
  const unknownTools = excludedTools.filter((t) => !toolNameSet.has(t));
  if (unknownTools.length > 0) {
    throw new ToolFilterError(
      "UNKNOWN_TOOL",
      `Unknown tool${unknownTools.length > 1 ? "s" : ""} ` +
        `${unknownTools.slice(0, 5).map((t) => `"${t}"`).join(", ")}` +
        `${
          unknownTools.length > 5 ? `, and ${unknownTools.length - 5} more` : ""
        }`,
      {
        context: {
          option: "excludeTools",
          received: unknownTools,
          valid: validToolNames,
        },
        recovery:
          "use exact tool names such as erpnext_file_list (comma-separated); " +
          "see docs/tools.md or call tools/list for the complete list",
      },
    );
  }

  let base: readonly ErpNextTool[];
  let allowList: string[] | undefined;
  if (categories === undefined) {
    base = registry.allTools;
  } else {
    allowList = unique(categories);
    const unknown = allowList.filter((c) => !validSet.has(c));
    if (unknown.length > 0) {
      warnings.push({
        code: TOOL_FILTER_ERROR_CODE,
        reason: "UNKNOWN_CATEGORY",
        message: formatToolFilterMessage(
          unknownCategoryDetail(unknown, validCategories, true),
          CATEGORY_RECOVERY,
        ),
        context: Object.freeze({
          option: "categories",
          received: unknown,
          valid: validCategories,
          reason: "UNKNOWN_CATEGORY",
        }),
        recovery: CATEGORY_RECOVERY,
      });
    }
    // Only known categories: `toolsByCategory[c]` on a plain object would also
    // resolve prototype keys ("constructor", "__proto__", ...).
    base = allowList
      .filter((c) => validSet.has(c))
      .flatMap((c) => registry.toolsByCategory[c]);
  }

  const excludedCategorySet = new Set(excludedCategories);
  const excludedToolSet = new Set(excludedTools);
  const seen = new Set<string>();
  const tools: ErpNextTool[] = [];
  for (const tool of base) {
    if (seen.has(tool.name)) continue;
    seen.add(tool.name);
    if (excludedCategorySet.has(tool.category)) continue;
    if (excludedToolSet.has(tool.name)) continue;
    tools.push(tool);
  }

  return {
    tools,
    ...(allowList ? { categories: allowList } : {}),
    excludedCategories,
    excludedTools,
    warnings,
  };
}

/**
 * Process-boundary guard: a server with zero tools is never what anyone wants
 * (typo, or everything excluded). Not called by the library constructor.
 */
export function assertNonEmptySelection(
  selection: ToolSelection,
  registry: ToolRegistry = DEFAULT_REGISTRY,
): void {
  if (selection.tools.length > 0) return;
  throw new ToolFilterError(
    "EMPTY_SELECTION",
    "The tool selection is empty: no tool would be registered",
    {
      context: {
        categories: selection.categories ?? null,
        excludedCategories: selection.excludedCategories,
        excludedTools: selection.excludedTools,
        valid: Object.keys(registry.toolsByCategory),
      },
      recovery:
        "check --categories / --exclude-categories / --exclude-tools (and their ERPNEXT_* variables) so that at least one tool remains",
    },
  );
}
