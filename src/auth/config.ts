/**
 * MCP HTTP Authentication Configuration
 *
 * Reads auth settings from environment variables and builds an
 * `@casys/mcp-server` `AuthProvider` — static bearer tokens, OAuth 2.0 JWT
 * (JWKS), or both combined via `CompositeAuthProvider`.
 *
 *   1. Static bearer tokens  — MCP_AUTH_TOKEN or MCP_AUTH_TOKENS (comma-separated)
 *   2. OAuth 2.0 JWT (JWKS) — MCP_OAUTH_JWKS_URL + MCP_OAUTH_AUDIENCE + MCP_OAUTH_ISSUER
 *
 * Both modes also require MCP_AUTH_RESOURCE (an absolute URL identifying this
 * server, per RFC 9728) — the framework's auth providers need it to emit
 * Protected Resource Metadata.
 *
 * @module lib/erpnext/src/auth/config
 */

import {
  type AuthProvider,
  createOIDCAuthProvider,
  createStaticTokenAuthProvider,
} from "@casys/mcp-server";
import { env } from "../runtime.ts";
import { CompositeAuthProvider } from "./composite-provider.ts";

// ── Config ───────────────────────────────────────────────────────────────────

export interface AuthConfig {
  /** Set of valid static bearer tokens. */
  tokens: Set<string>;
  /** RFC 9728 resource identifier for this server (its own public URL). */
  resource?: string;
  /** JWKS endpoint URL for OAuth JWT validation. */
  jwksUrl?: string;
  /** Expected `aud` claim value. */
  audience?: string;
  /** Expected `iss` claim value / OIDC issuer. */
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

  const resource = env("MCP_AUTH_RESOURCE");

  return {
    tokens,
    resource: resource?.trim() ? unquote(resource.trim()) : undefined,
    jwksUrl: jwksUrl?.trim() ? unquote(jwksUrl.trim()) : undefined,
    audience: env("MCP_OAUTH_AUDIENCE")?.trim(),
    issuer: env("MCP_OAUTH_ISSUER")?.trim(),
  };
}

// ── Provider construction ────────────────────────────────────────────────────

/**
 * Build the `AuthProvider` `server.ts` passes to `McpApp`. Throws with a
 * targeted message if a mode is partially configured (e.g. a JWKS URL without
 * an issuer) rather than silently accepting requests it can't actually verify.
 */
export function buildAuthProvider(config: AuthConfig): AuthProvider {
  const providers: AuthProvider[] = [];

  if (config.tokens.size > 0) {
    if (!config.resource) {
      throw new Error(
        "[mcp-erpnext] MCP_AUTH_RESOURCE is required alongside MCP_AUTH_TOKEN(S) " +
          "— set it to this server's public URL, e.g. https://mcp.example.com",
      );
    }
    providers.push(
      createStaticTokenAuthProvider([...config.tokens], {
        resource: config.resource,
      }),
    );
  }

  if (config.jwksUrl) {
    if (!config.issuer) {
      throw new Error(
        "[mcp-erpnext] MCP_OAUTH_ISSUER is required alongside MCP_OAUTH_JWKS_URL",
      );
    }
    if (!config.audience) {
      throw new Error(
        "[mcp-erpnext] MCP_OAUTH_AUDIENCE is required alongside MCP_OAUTH_JWKS_URL",
      );
    }
    if (!config.resource) {
      throw new Error(
        "[mcp-erpnext] MCP_AUTH_RESOURCE is required alongside MCP_OAUTH_JWKS_URL",
      );
    }
    providers.push(
      createOIDCAuthProvider({
        issuer: config.issuer,
        audience: config.audience,
        jwksUri: config.jwksUrl,
        resource: config.resource,
      }),
    );
  }

  return providers.length === 1
    ? providers[0]
    : new CompositeAuthProvider(providers);
}
