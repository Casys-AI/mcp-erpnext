/**
 * Machine-readable Buy capture failures.
 *
 * Incomplete or inconsistent captures never yield a usable chiffrage.
 * `retryable` is true only for repeated-read races, never for unsupported
 * input or missing sources.
 */

export const BUY_CAPTURE_ERROR_CODES = [
  "BUY_CAPTURE_CALLER_AUTHORITY_REJECTED",
  "BUY_CAPTURE_UNSUPPORTED_DOCTYPE",
  "BUY_CAPTURE_UNSUPPORTED_FIELD",
  "BUY_CAPTURE_MISSING_SOURCE",
  "BUY_CAPTURE_IDENTITY_MISMATCH",
  "BUY_CAPTURE_INCONSISTENT",
  "BUY_CAPTURE_BOUNDS_EXCEEDED",
  "BUY_CAPTURE_EXPECTED_MODIFIED_MISMATCH",
  "BUY_CAPTURE_INVALID_INPUT",
  "BUY_CAPTURE_INVALID_PROJECTION",
] as const;

export type BuyCaptureErrorCode = typeof BUY_CAPTURE_ERROR_CODES[number];

export class BuyCaptureError extends Error {
  readonly code: BuyCaptureErrorCode;
  readonly retryable: boolean;
  readonly context: Readonly<Record<string, unknown>>;
  readonly recovery: string;

  constructor(
    code: BuyCaptureErrorCode,
    message: string,
    options: {
      retryable?: boolean;
      context?: Record<string, unknown>;
      recovery: string;
    },
  ) {
    super(message);
    this.name = "BuyCaptureError";
    this.code = code;
    this.retryable = options.retryable === true;
    this.context = Object.freeze({ ...(options.context ?? {}) });
    this.recovery = options.recovery;
  }
}

export function isBuyCaptureError(error: unknown): error is BuyCaptureError {
  return error instanceof BuyCaptureError;
}
