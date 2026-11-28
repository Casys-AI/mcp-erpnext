/**
 * Machine-readable errors of the Code Mode `execute` tool.
 *
 * Same wire contract as `ToolInputError` (`src/tools/errors.ts`): the message
 * is what reaches the agent and the viewers, so it carries the code and the
 * recovery itself, parseable with `parseToolInputError`.
 *
 *     [execute] <CODE>: <detail>. Recovery: <recovery>
 *
 * @module lib/erpnext/code-mode/errors
 */

import { formatToolError, parseToolInputError } from "../tools/errors.ts";

export const CODE_MODE_ERROR_CODES = [
  /** The program made more ERP calls than one execution allows. */
  "CALL_LIMIT",
  /** The program ran past its CPU or wall-clock budget. */
  "PROGRAM_TIMEOUT",
  /** `erp.call` named an operation that is not in `erp.catalog`. */
  "UNKNOWN_OPERATION",
  /** The program threw, or let an ERP error escape. */
  "PROGRAM_FAILED",
  /** The program finished while ERP calls it started were still unawaited. */
  "UNAWAITED_CALLS",
  /** The user declined a write; earlier approved writes may stand. */
  "CHANGE_CANCELLED",
  /** An approved write completed, then the program or its views failed. */
  "WRITE_APPLIED_THEN_FAILED",
] as const;

export type CodeModeErrorCode = typeof CODE_MODE_ERROR_CODES[number];

/** Render one Code Mode error in the shared `[tool] CODE:` format. */
export function codeModeMessage(
  code: CodeModeErrorCode,
  detail: string,
  recovery: string,
): string {
  return formatToolError("execute", code, detail, recovery, true);
}

/**
 * True when a message already follows the full `[tool] CODE: …. Recovery: …`
 * contract, so it can reach the agent unchanged.
 */
export function isCodedMessage(message: string): boolean {
  return parseToolInputError(message) !== null;
}

const MAX_DETAIL = 400;

/** Bound text taken from a program or a record before it reaches the agent. */
export function bounded(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > MAX_DETAIL ? `${flat.slice(0, MAX_DETAIL - 1)}…` : flat;
}

/**
 * Summarise a failure as `CODE: detail` (or its bounded text) for use inside
 * another error's detail. Its own recovery is dropped on purpose: the outer
 * error states the only safe next step.
 */
export function describeCause(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  const parsed = parseToolInputError(text);
  return bounded(parsed ? `${parsed.code}: ${parsed.message}` : text);
}

export class CodeModeError extends Error {
  readonly code: CodeModeErrorCode;
  /** What went wrong, without the `[execute] CODE:` prefix or the recovery. */
  readonly detail: string;
  readonly recovery: string;
  readonly context: Readonly<Record<string, unknown>>;

  constructor(
    code: CodeModeErrorCode,
    detail: string,
    options: { recovery: string; context?: Record<string, unknown> },
  ) {
    super(codeModeMessage(code, detail, options.recovery));
    this.name = "CodeModeError";
    this.code = code;
    this.detail = detail;
    this.recovery = options.recovery;
    this.context = Object.freeze({ ...(options.context ?? {}) });
  }
}
