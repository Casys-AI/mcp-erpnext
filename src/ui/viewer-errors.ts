/**
 * Machine-readable failures when reading a remote (JSR) MCP Apps viewer.
 *
 * Wire format: `@casys/mcp-server` relays a plain `Error` thrown by a
 * resource handler as JSON-RPC `-32603` carrying ONLY `error.message`. So the
 * message of a {@link ViewerResourceError} is itself a compact JSON string:
 *
 *     {"code":"VIEWER_REMOTE_TIMEOUT","message":"...","retryable":true,
 *      "context":{"url":"...","host":"jsr.io:443","timeoutMs":15000},
 *      "recovery":"..."}
 *
 * Agents parse `code` (closed list below), never the prose. `context` is
 * bounded (url, host, status, timeoutMs) and never carries a response body.
 * `code`, `retryable`, `context` and `recovery` are also typed properties.
 *
 * This JSON-in-message shape is the wire convention for viewer resource reads.
 */

export const VIEWER_RESOURCE_ERROR_CODES = [
  "VIEWER_REMOTE_PERMISSION_DENIED",
  "VIEWER_REMOTE_TIMEOUT",
  "VIEWER_REMOTE_HTTP_ERROR",
  "VIEWER_REMOTE_NETWORK_ERROR",
] as const;

export type ViewerResourceErrorCode =
  typeof VIEWER_RESOURCE_ERROR_CODES[number];

export interface ViewerResourceErrorContext {
  readonly url: string;
  /** `hostname:port` actually contacted (port always explicit). */
  readonly host: string;
  readonly status?: number;
  readonly timeoutMs?: number;
}

export class ViewerResourceError extends Error {
  readonly code: ViewerResourceErrorCode;
  readonly retryable: boolean;
  readonly context: Readonly<ViewerResourceErrorContext>;
  readonly recovery: string;

  constructor(
    code: ViewerResourceErrorCode,
    detail: string,
    options: {
      retryable?: boolean;
      context: ViewerResourceErrorContext;
      recovery: string;
    },
  ) {
    const retryable = options.retryable === true;
    const context = Object.freeze({ ...options.context });
    super(JSON.stringify({
      code,
      message: detail,
      retryable,
      context,
      recovery: options.recovery,
    }));
    this.name = "ViewerResourceError";
    this.code = code;
    this.retryable = retryable;
    this.context = context;
    this.recovery = options.recovery;
  }
}

export function isViewerResourceError(
  error: unknown,
): error is ViewerResourceError {
  return error instanceof ViewerResourceError;
}
