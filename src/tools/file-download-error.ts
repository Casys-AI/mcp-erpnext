/**
 * Machine-readable `erpnext_file_download` failures.
 *
 * The tool returns file bytes as base64 inside one embedded resource. Those
 * bytes must only ever reach an MCP Apps host (the viewer's `downloadFile`
 * channel), never a model context. Refusals are typed so callers can branch on
 * `code` instead of parsing prose.
 *
 * The rendered `message` follows the repository-wide shape
 * `[<tool>] <CODE>: <message>. Recovery: <recovery>`, so the code and the
 * recovery survive `toolErrorMapper` (which only forwards `error.message`).
 */

import { formatToolError } from "./errors.ts";

export const FILE_DOWNLOAD_ERROR_CODES = ["APP_CONTEXT_REQUIRED"] as const;

export type FileDownloadErrorCode = typeof FILE_DOWNLOAD_ERROR_CODES[number];

export const FILE_DOWNLOAD_TOOL_NAME = "erpnext_file_download";

export class FileDownloadError extends Error {
  readonly code: FileDownloadErrorCode;
  readonly detail: string;
  readonly retryable: boolean;
  readonly context: Readonly<Record<string, unknown>>;
  readonly recovery: string;

  constructor(
    code: FileDownloadErrorCode,
    detail: string,
    options: {
      retryable?: boolean;
      context?: Record<string, unknown>;
      recovery: string;
    },
  ) {
    super(
      formatToolError(FILE_DOWNLOAD_TOOL_NAME, code, detail, options.recovery),
    );
    this.name = "FileDownloadError";
    this.code = code;
    this.detail = detail;
    this.retryable = options.retryable === true;
    this.context = Object.freeze({ ...(options.context ?? {}) });
    this.recovery = options.recovery;
  }
}

export function isFileDownloadError(
  error: unknown,
): error is FileDownloadError {
  return error instanceof FileDownloadError;
}
