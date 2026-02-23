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

export interface FrappeClientConfig {
  /** ERPNext base URL, e.g. http://localhost:8000 */
  baseUrl: string;
  /** API Key from ERPNext user settings */
  apiKey: string;
  /** API Secret from ERPNext user settings */
  apiSecret: string;
  /** Request timeout in ms. Default: 30000 */
  timeoutMs?: number;
}

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
   */
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`[FrappeClient] ${message} (HTTP ${status})`);
    this.name = "FrappeAPIError";
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

  constructor(config: FrappeClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.authHeader = `token ${config.apiKey}:${config.apiSecret}`;
    this.timeoutMs = config.timeoutMs ?? 30_000;
  }

  // ── Private HTTP helpers ────────────────────────────────────────────────────

  private buildHeaders(): HeadersInit {
    return {
      "Authorization": this.authHeader,
      "Accept": "application/json",
      "Content-Type": "application/json",
    };
  }

  private async request<T>(
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

    let responseBody: unknown;
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      responseBody = await response.json();
    } else {
      responseBody = await response.text();
    }

    if (!response.ok) {
      const msg = typeof responseBody === "object" && responseBody !== null
        ? ((responseBody as Record<string, unknown>).message as string) ??
          ((responseBody as Record<string, unknown>).exc_type as string) ??
          response.statusText
        : response.statusText;
      throw new FrappeAPIError(
        `${method} ${path} failed: ${msg}`,
        response.status,
        responseBody,
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
    return res.data ?? [];
  }

  /**
   * Get a single document by name.
   * GET /api/resource/{doctype}/{name}
   */
  async get<T extends FrappeDoc = FrappeDoc>(
    doctype: string,
    name: string,
  ): Promise<T> {
    const res = await this.request<FrappeDocResponse<T>>(
      "GET",
      `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`,
    );
    return res.data;
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
      `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`,
      { data },
    );
    return res.data;
  }

  /**
   * Delete a document.
   * DELETE /api/resource/{doctype}/{name}
   */
  async delete(doctype: string, name: string): Promise<void> {
    await this.request<unknown>(
      "DELETE",
      `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`,
    );
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

  _client = new FrappeClient({ baseUrl: url, apiKey, apiSecret });
  return _client;
}

/** Override the singleton (useful for tests or dependency injection) */
export function setFrappeClient(client: FrappeClient): void {
  _client = client;
}
