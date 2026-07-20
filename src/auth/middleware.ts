/**
 * MCP HTTP Authentication Layer
 *
 * Supports two auth modes (combinable):
 *   1. Static bearer tokens  — MCP_AUTH_TOKEN or MCP_AUTH_TOKENS (comma-separated)
 *   2. OAuth 2.0 JWT (JWKS) — MCP_OAUTH_JWKS_URL + optional MCP_OAUTH_AUDIENCE / MCP_OAUTH_ISSUER
 *
 * Both modes validate the standard `Authorization: Bearer <token>` header.
 *
 * @module lib/erpnext/src/auth/middleware
 */

import { createRemoteJWKSet, jwtVerify } from "jose";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { env } from "../runtime.ts";

// ── Config ───────────────────────────────────────────────────────────────────

export interface AuthConfig {
  /** Set of valid static bearer tokens. O(1) lookup. */
  tokens: Set<string>;
  /** JWKS endpoint URL for OAuth JWT validation. */
  jwksUrl?: string;
  /** Expected `aud` claim value (optional). */
  audience?: string;
  /** Expected `iss` claim value (optional). */
  issuer?: string;
}

/**
 * Strip a single layer of matching surrounding quotes (single or double).
 * `env_file:` parsing is inconsistent across Docker Compose versions about
 * whether quotes in `KEY="value"` are stripped or kept as literal characters
 * — stripping them here ourselves makes auth config immune to that either way.
 */
function unquote(value: string): string {
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

/**
 * Read auth config from environment variables.
 * Returns null if no auth is configured (HTTP mode will warn).
 */
export function loadAuthConfig(): AuthConfig | null {
  const single = env("MCP_AUTH_TOKEN");
  const multi = env("MCP_AUTH_TOKENS");
  const jwksUrl = env("MCP_OAUTH_JWKS_URL");

  const tokens = new Set<string>();
  if (single?.trim()) tokens.add(unquote(single.trim()));
  if (multi) {
    for (const t of multi.split(",")) {
      const trimmed = t.trim();
      if (trimmed) tokens.add(unquote(trimmed));
    }
  }

  if (tokens.size === 0 && !jwksUrl) return null;

  return {
    tokens,
    jwksUrl: jwksUrl?.trim() ? unquote(jwksUrl.trim()) : undefined,
    audience: env("MCP_OAUTH_AUDIENCE")?.trim(),
    issuer: env("MCP_OAUTH_ISSUER")?.trim(),
  };
}

// ── Validation ───────────────────────────────────────────────────────────────

// Cache JWKS fetcher per URL to avoid re-creating on every request.
const jwksSets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJWKS(url: string): ReturnType<typeof createRemoteJWKSet> {
  if (!jwksSets.has(url)) {
    jwksSets.set(url, createRemoteJWKSet(new URL(url)));
  }
  return jwksSets.get(url)!;
}

/**
 * Validate an Authorization header value against the auth config.
 * Accepts `Bearer <token>` where token is either a static secret or a signed JWT.
 */
export async function validateToken(
  authHeader: string | null | undefined,
  config: AuthConfig,
): Promise<boolean> {
  if (!authHeader) return false;

  const spaceIdx = authHeader.indexOf(" ");
  if (spaceIdx === -1) return false;
  const scheme = authHeader.slice(0, spaceIdx).toLowerCase();
  const token = authHeader.slice(spaceIdx + 1).trim();

  if (scheme !== "bearer" || !token) return false;

  // 1. Static token check (O(1))
  if (config.tokens.has(token)) return true;

  // 2. OAuth JWT validation via JWKS
  if (config.jwksUrl) {
    try {
      const JWKS = getJWKS(config.jwksUrl);
      await jwtVerify(token, JWKS, {
        ...(config.audience ? { audience: config.audience } : {}),
        ...(config.issuer ? { issuer: config.issuer } : {}),
      });
      return true;
    } catch {
      // Invalid/expired JWT — fall through
    }
  }

  return false;
}

// ── Hono proxy app ───────────────────────────────────────────────────────────

/**
 * Build a Hono app that:
 *   1. Handles CORS preflight
 *   2. Validates Bearer auth on every request
 *   3. Proxies authenticated requests to the internal MCP server port
 */
export function createAuthProxyApp(
  config: AuthConfig,
  internalPort: number,
): Hono {
  const app = new Hono();

  app.use("*", cors());

  // Auth guard — /health is exempt so Docker/orchestrator healthchecks (which
  // don't and shouldn't send credentials) still work; it's still proxied
  // through to the internal server below, so it reflects real backend health.
  app.use("*", async (c, next) => {
    if (c.req.path === "/health") return next();
    const authHeader = c.req.header("authorization");
    const ok = await validateToken(authHeader, config);
    if (!ok) {
      return c.json(
        {
          error: "Unauthorized",
          message: "Valid Authorization: Bearer <token> required",
        },
        401,
        { "WWW-Authenticate": 'Bearer realm="mcp-erpnext"' },
      );
    }
    await next();
  });

  // Reverse proxy — forward to internal MCP server on loopback
  app.all("*", async (c) => {
    const url = new URL(c.req.url);
    const targetUrl =
      `http://127.0.0.1:${internalPort}${url.pathname}${url.search}`;

    // Rebuild headers, replacing host so the internal server sees the right origin
    const headers = new Headers(c.req.raw.headers);
    headers.set("host", `127.0.0.1:${internalPort}`);
    // Strip incoming Authorization so internal server doesn't see credentials
    headers.delete("authorization");

    const proxyReq = new Request(targetUrl, {
      method: c.req.method,
      headers,
      body: c.req.raw.body,
      // Required in some runtimes for streaming POST bodies
      // @ts-ignore: duplex is non-standard but needed in Node 20
      duplex: "half",
    });

    return fetch(proxyReq);
  });

  return app;
}
