/**
 * Frappe REST API Client
 *
 * Zero-dependency HTTP client for the Frappe/ERPNext REST API.
 * Supports API Key + API Secret authentication.
 *
 * API Reference:
 *   GET  /api/resource/{doctype}              → list documents
 *   GET  /api/resource/{doctype}/{name}       → get single document
 *   POST /api/resource/{doctype}              → create document
 *   PUT  /api/resource/{doctype}/{name}       → update document
 *   DELETE /api/resource/{doctype}/{name}     → delete document
 *   POST /api/method/{method}                 → call whitelisted method
 *
 * Authentication:
 *   Authorization: token {api_key}:{api_secret}
 *   Or token-based: Authorization: Bearer {token}
 *
 * @module lib/erpnext/api/frappe-client
 */

import type {
  FrappeDoc,
  FrappeDocResponse,
  FrappeListOptions,
  FrappeListResponse,
  FrappeMethodResponse,
} from "./types.ts";
import { env } from "../runtime.ts";
import type { Cache } from "../cache/types.ts";
import { MemoryCache } from "../cache/memory.ts";
import { getCache, getCacheTtlMs } from "../cache/cache.ts";

/** Deterministic JSON.stringify — sorts object keys so equivalent options produce the same cache key. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${
      keys
        .map((k) =>
          `${JSON.stringify(k)}:${
            stableStringify((value as Record<string, unknown>)[k])
          }`
        )
        .join(",")
    }}`;
  }
  return JSON.stringify(value);
}

export interface FrappeClientConfig {
  /** ERPNext base URL, e.g. http://localhost:8000 */
  baseUrl: string;
  /** API Key from ERPNext user settings */
  apiKey: string;
  /** API Secret from ERPNext user settings */
  apiSecret: string;
  /** Request timeout in ms. Default: 30000 */
  timeoutMs?: number;
  /**
   * Number of retry attempts on retryable failures (default: 3).
   * Set to 0 to disable retries entirely.
   */
  retries?: number;
  /**
   * HTTP status codes considered transient and worth retrying.
   * Default: [408, 429, 502, 503, 504]. Network errors (status 0) are always
   * retried regardless of this list.
   */
  retryStatuses?: number[];
  /**
   * Initial backoff delay in ms; doubled on each subsequent attempt
   * (200, 400, 800, …). A `Retry-After` response header overrides this.
   * Default: 200.
   */
  retryBackoffMs?: number;
  /**
   * HTTP methods eligible for retry. Default: ["GET"] — non-idempotent
   * methods are not retried automatically since the server may have already
   * applied the change.
   */
  retryMethods?: string[];
  /**
   * Cache used for list()/get() reads. Defaults to a fresh, unshared
   * MemoryCache per client instance — NOT the app-wide singleton — so
   * multiple FrappeClient instances (e.g. one per test) never leak cached
   * data into each other. Pass `getCache()` explicitly to share the
   * app-wide cache (see getFrappeClient()).
   */
  cache?: Cache;
}

const DEFAULT_RETRY_STATUSES = [408, 429, 502, 503, 504];
const DEFAULT_RETRY_METHODS = ["GET"];

/**
 * Error thrown when a Frappe REST API request fails.
 *
 * Carries the HTTP status code and the raw response body for programmatic
 * error handling (e.g. retries on 429, user-facing messages from `exc_type`).
 *
 * @example
 * ```ts
 * try {
 *   await client.get("Sales Order", "SO-00001");
 * } catch (e) {
 *   if (e instanceof FrappeAPIError && e.status === 404) {
 *     console.log("Document not found");
 *   }
 * }
 * ```
 */
export class FrappeAPIError extends Error {
  /**
   * @param message - Human-readable error description
   * @param status - HTTP status code (0 for network errors, 408 for timeouts)
   * @param body - Raw response body (parsed JSON object or plain text string)
   * @param retryAfterMs - When the server sent a `Retry-After` header on a
   *                      retryable status (typically 429), the parsed delay
   *                      in ms. Used by the retry loop; absent otherwise.
   */
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
    public readonly retryAfterMs?: number,
  ) {
    super(`[FrappeClient] ${message} (HTTP ${status})`);
    this.name = "FrappeAPIError";
  }
}

/**
 * Parse a `Retry-After` header value. The HTTP spec accepts either a number of
 * seconds (`"120"`) or an HTTP-date (`"Wed, 21 Oct 2026 07:28:00 GMT"`).
 * Returns the delay in ms, or `undefined` if the value can't be parsed.
 */
function parseRetryAfter(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }
  const date = Date.parse(trimmed);
  if (Number.isFinite(date)) {
    return Math.max(0, date - Date.now());
  }
  return undefined;
}

/**
 * Extract human-readable messages from Frappe's `_server_messages` field.
 * Frappe returns a JSON-encoded array of JSON-encoded strings, each containing a `message` field.
 * Returns a concatenated string of all messages, or undefined if parsing fails.
 */
function extractServerMessages(raw: unknown): string | undefined {
  if (!raw || typeof raw !== "string") return undefined;
  try {
    const outer = JSON.parse(raw);
    if (!Array.isArray(outer)) return undefined;
    const msgs: string[] = [];
    for (const item of outer) {
      try {
        const inner = JSON.parse(item);
        if (typeof inner === "object" && inner?.message) {
          msgs.push(inner.message);
        } else if (typeof inner === "string") {
          msgs.push(inner);
        }
      } catch {
        if (typeof item === "string") msgs.push(item);
      }
    }
    return msgs.length > 0 ? msgs.join("; ") : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Frappe REST API client.
 * Follows no-silent-fallbacks policy — throws FrappeAPIError on any HTTP error.
 */
export class FrappeClient {
  private baseUrl: string;
  private authHeader: string;
  private timeoutMs: number;
  private retries: number;
  private retryStatuses: number[];
  private retryBackoffMs: number;
  private retryMethods: string[];
  private cache: Cache;

  constructor(config: FrappeClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.authHeader = `token ${config.apiKey}:${config.apiSecret}`;
    this.timeoutMs = config.timeoutMs ?? 30_000;
    this.retries = config.retries ?? 3;
    this.retryStatuses = config.retryStatuses ?? DEFAULT_RETRY_STATUSES;
    this.retryBackoffMs = config.retryBackoffMs ?? 200;
    this.retryMethods = config.retryMethods ?? DEFAULT_RETRY_METHODS;
    this.cache = config.cache ?? new MemoryCache();
  }

  // ── Private HTTP helpers ────────────────────────────────────────────────────

  private buildHeaders(): HeadersInit {
    return {
      "Authorization": this.authHeader,
      "Accept": "application/json",
      "Content-Type": "application/json",
    };
  }

  /**
   * Decide whether an error is worth retrying.
   * Network errors (status 0) and timeouts (status 408) are always retryable;
   * other statuses are checked against `retryStatuses`.
   */
  private isRetryable(err: unknown, method: string): boolean {
    if (!this.retryMethods.includes(method)) return false;
    if (!(err instanceof FrappeAPIError)) return false;
    if (err.status === 0) return true;
    return this.retryStatuses.includes(err.status);
  }

  /** Compute the backoff delay for a given attempt (0-indexed). */
  private computeBackoff(attempt: number, err: unknown): number {
    if (
      err instanceof FrappeAPIError && err.retryAfterMs !== undefined
    ) {
      return err.retryAfterMs;
    }
    return this.retryBackoffMs * 2 ** attempt;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        return await this.requestOnce<T>(method, path, body);
      } catch (err) {
        lastError = err;
        if (
          attempt === this.retries || !this.isRetryable(err, method)
        ) {
          throw err;
        }
        const delay = this.computeBackoff(attempt, err);
        if (delay > 0) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    // Defensive: the loop above either returns or throws.
    throw lastError;
  }

  private async requestOnce<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: this.buildHeaders(),
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === "AbortError") {
        throw new FrappeAPIError(
          `Request timed out after ${this.timeoutMs}ms: ${method} ${path}`,
          408,
          null,
        );
      }
      throw new FrappeAPIError(
        `Network error on ${method} ${path}: ${(err as Error).message}`,
        0,
        null,
      );
    }
    clearTimeout(timer);

    // Read the body once as text, then attempt JSON parsing only if appropriate.
    // Reading via response.text() first lets us recover gracefully when the
    // server lies about content-type (e.g. HTML error pages with JSON CT).
    const rawText = await response.text();
    const contentType = response.headers.get("content-type") ?? "";
    let responseBody: unknown = rawText;
    if (contentType.includes("application/json") && rawText.length > 0) {
      try {
        responseBody = JSON.parse(rawText);
      } catch {
        // Server sent invalid JSON despite the content-type — keep the raw
        // text so the FrappeAPIError carries something useful instead of
        // crashing the whole request.
        responseBody = rawText;
      }
    }

    if (!response.ok) {
      let msg = response.statusText;
      if (typeof responseBody === "object" && responseBody !== null) {
        const rb = responseBody as Record<string, unknown>;
        const excType = rb.exc_type as string | undefined;
        const baseMsg = (rb.message as string) ?? excType ??
          response.statusText;

        // Parse _server_messages — Frappe returns a JSON-encoded array of JSON-encoded strings
        // e.g. "[\"{ \\\"message\\\": \\\"Row #1: Warehouse is required\\\" }\"]"
        const serverDetails = extractServerMessages(rb._server_messages);
        msg = serverDetails ? `${baseMsg}: ${serverDetails}` : baseMsg;
      } else if (typeof responseBody === "string" && responseBody.length > 0) {
        // Truncate raw HTML / text bodies so error messages stay readable.
        msg = responseBody.slice(0, 200);
      }
      const retryAfterMs = parseRetryAfter(
        response.headers.get("retry-after"),
      );
      throw new FrappeAPIError(
        `${method} ${path} failed: ${msg}`,
        response.status,
        responseBody,
        retryAfterMs,
      );
    }

    return responseBody as T;
  }

  // ── Resource CRUD ───────────────────────────────────────────────────────────

  /**
   * List documents of a DocType.
   * Frappe list API: GET /api/resource/{doctype}?fields=...&filters=...
   */
  async list<T extends FrappeDoc = FrappeDoc>(
    doctype: string,
    options: FrappeListOptions = {},
  ): Promise<T[]> {
    const cacheKey = `list:${doctype}:${stableStringify(options)}`;
    const cached = this.cache.get<T[]>(cacheKey);
    if (cached !== undefined) return cached;

    const params = new URLSearchParams();

    if (options.fields && options.fields.length > 0) {
      params.set("fields", JSON.stringify(options.fields));
    }
    if (options.filters && options.filters.length > 0) {
      params.set("filters", JSON.stringify(options.filters));
    }
    if (options.order_by) {
      params.set("order_by", options.order_by);
    }
    if (options.limit !== undefined) {
      params.set("limit", String(options.limit));
    }
    if (options.limit_start !== undefined) {
      params.set("limit_start", String(options.limit_start));
    }
    params.set("as_dict", "1");

    const query = params.toString() ? `?${params.toString()}` : "";
    const res = await this.request<FrappeListResponse<T>>(
      "GET",
      `/api/resource/${encodeURIComponent(doctype)}${query}`,
    );
    const docs = res.data ?? [];
    this.cache.set(cacheKey, docs, getCacheTtlMs());
    return docs;
  }

  /**
   * Get a single document by name.
   * GET /api/resource/{doctype}/{name}
   *
   * Pass `{ skipCache: true }` to force a fresh read — required before any
   * operation relying on the doc's `modified` timestamp for optimistic
   * locking (see erpnext_doc_submit/erpnext_doc_cancel in operations.ts).
   * The fresh result still refreshes the cache for subsequent normal reads.
   */
  async get<T extends FrappeDoc = FrappeDoc>(
    doctype: string,
    name: string,
    opts: { skipCache?: boolean } = {},
  ): Promise<T> {
    const cacheKey = `get:${doctype}:${name}`;
    if (!opts.skipCache) {
      const cached = this.cache.get<T>(cacheKey);
      if (cached !== undefined) return cached;
    }

    const res = await this.request<FrappeDocResponse<T>>(
      "GET",
      `/api/resource/${encodeURIComponent(doctype)}/${
        encodeURIComponent(name)
      }`,
    );
    this.cache.set(cacheKey, res.data, getCacheTtlMs());
    return res.data;
  }

  /**
   * Clear cached entries for a doctype (list results) and, if `name` is
   * given, the cached single-document read too. Called automatically after
   * create/update/delete; call explicitly after any mutation that bypasses
   * those methods (e.g. frappe.client.submit/cancel via callMethod).
   */
  invalidate(doctype: string, name?: string): void {
    this.cache.deleteByPrefix(`list:${doctype}:`);
    if (name) this.cache.delete(`get:${doctype}:${name}`);
  }

  /**
   * Create a new document.
   * POST /api/resource/{doctype}
   */
  async create<T extends FrappeDoc = FrappeDoc>(
    doctype: string,
    data: Partial<T>,
  ): Promise<T> {
    const res = await this.request<FrappeDocResponse<T>>(
      "POST",
      `/api/resource/${encodeURIComponent(doctype)}`,
      { data: { ...data, doctype } },
    );
    this.invalidate(doctype, res.data.name as string | undefined);
    return res.data;
  }

  /**
   * Update an existing document (partial update).
   * PUT /api/resource/{doctype}/{name}
   */
  async update<T extends FrappeDoc = FrappeDoc>(
    doctype: string,
    name: string,
    data: Partial<T>,
  ): Promise<T> {
    const res = await this.request<FrappeDocResponse<T>>(
      "PUT",
      `/api/resource/${encodeURIComponent(doctype)}/${
        encodeURIComponent(name)
      }`,
      { data },
    );
    this.invalidate(doctype, name);
    return res.data;
  }

  /**
   * Delete a document.
   * DELETE /api/resource/{doctype}/{name}
   */
  async delete(doctype: string, name: string): Promise<void> {
    await this.request<unknown>(
      "DELETE",
      `/api/resource/${encodeURIComponent(doctype)}/${
        encodeURIComponent(name)
      }`,
    );
    this.invalidate(doctype, name);
  }

  /**
   * Call a whitelisted Frappe method.
   * POST /api/method/{method}
   */
  async callMethod<T = unknown>(
    method: string,
    args: Record<string, unknown> = {},
  ): Promise<T> {
    const res = await this.request<FrappeMethodResponse<T>>(
      "POST",
      `/api/method/${method}`,
      args,
    );
    return res.message;
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────

let _client: FrappeClient | null = null;

/**
 * Get (or lazily create) the singleton FrappeClient.
 * Reads config from environment variables.
 *
 * Follows no-silent-fallbacks: throws if ERPNEXT_URL / ERPNEXT_API_KEY / ERPNEXT_API_SECRET
 * are not set.
 */
export function getFrappeClient(): FrappeClient {
  if (_client) return _client;

  const url = env("ERPNEXT_URL");
  const apiKey = env("ERPNEXT_API_KEY");
  const apiSecret = env("ERPNEXT_API_SECRET");

  if (!url) {
    throw new Error(
      "[lib/erpnext] ERPNEXT_URL is required. " +
        "Set it to your ERPNext instance URL, e.g. http://localhost:8000",
    );
  }
  if (!apiKey || !apiSecret) {
    throw new Error(
      "[lib/erpnext] ERPNEXT_API_KEY and ERPNEXT_API_SECRET are required. " +
        "Generate them in ERPNext: User Settings → API Access.",
    );
  }

  _client = new FrappeClient({
    baseUrl: url,
    apiKey,
    apiSecret,
    cache: getCache(),
  });
  return _client;
}

/** Override the singleton (useful for tests or dependency injection) */
export function setFrappeClient(client: FrappeClient): void {
  _client = client;
}
