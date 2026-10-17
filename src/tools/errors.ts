/**
 * Machine-readable tool input errors.
 *
 * The MCP server forwards only `error.message` to the client, and the UI
 * viewers print that text as-is (see `src/ui/shared/jumps.ts`). So the message
 * itself is the contract: readable by a human, parseable by an agent.
 *
 *     [<tool>] <CODE>: <message>. Recovery: <recovery>
 *
 * `code`, `context`, `recovery` and `retryable` stay available as typed fields
 * for in-process callers and tests. Same shape as `BuyCaptureError`
 * (`src/buy/errors.ts`).
 *
 * @module lib/erpnext/tools/errors
 */

export const TOOL_INPUT_ERROR_CODES = [
  /** A required argument is missing or has the wrong type. */
  "INVALID_INPUT",
  /** An entry of a Frappe `filters` array is malformed. */
  "INVALID_FILTER",
  /** `limit` / `offset` are invalid alone or in combination. */
  "INVALID_PAGINATION",
] as const;

export type ToolInputErrorCode = typeof TOOL_INPUT_ERROR_CODES[number];

export class ToolInputError extends Error {
  readonly tool: string;
  readonly code: ToolInputErrorCode;
  /** What was wrong, without the `[tool] CODE:` prefix or the recovery hint. */
  readonly detail: string;
  readonly recovery: string;
  /** Always false for input errors unless stated: resending the same call fails again. */
  readonly retryable: boolean;
  readonly context: Readonly<Record<string, unknown>>;

  constructor(
    tool: string,
    code: ToolInputErrorCode,
    detail: string,
    options: {
      recovery: string;
      context?: Record<string, unknown>;
      retryable?: boolean;
    },
  ) {
    super(formatToolInputError(tool, code, detail, options.recovery));
    this.name = "ToolInputError";
    this.tool = tool;
    this.code = code;
    this.detail = detail;
    this.recovery = options.recovery;
    this.retryable = options.retryable === true;
    this.context = Object.freeze({ ...(options.context ?? {}) });
  }
}

export function isToolInputError(error: unknown): error is ToolInputError {
  return error instanceof ToolInputError;
}

function sentence(text: string): string {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/** Shared prose format; existing callers keep their recovery punctuation. */
export function formatToolError(
  subject: string,
  code: string,
  detail: string,
  recovery: string,
  closeRecoverySentence = false,
): string {
  return `[${subject}] ${code}: ${
    detail.trim().replace(/[.!?]$/, "")
  }. Recovery: ${closeRecoverySentence ? sentence(recovery) : recovery}`;
}

/** Renders `[<tool>] <CODE>: <message>. Recovery: <recovery>`. */
export function formatToolInputError(
  tool: string,
  code: ToolInputErrorCode,
  detail: string,
  recovery: string,
): string {
  return formatToolError(tool, code, detail, recovery, true);
}

export interface ParsedToolInputError {
  tool: string;
  code: string;
  message: string;
  recovery: string;
}

const RENDERED_PATTERN =
  /^\[([^\]]+)\] ([A-Z][A-Z0-9_]*): (.*)\. Recovery: (.*)$/s;

/** Inverse of `formatToolInputError`; `null` for any other error text. */
export function parseToolInputError(
  text: string,
): ParsedToolInputError | null {
  const match = RENDERED_PATTERN.exec(text);
  if (!match) return null;
  return {
    tool: match[1],
    code: match[2],
    message: match[3],
    recovery: match[4],
  };
}
