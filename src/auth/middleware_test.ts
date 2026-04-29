import { assertEquals } from "@std/assert";
import {
  type AuthConfig,
  loadAuthConfig,
  validateToken,
} from "./middleware.ts";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<AuthConfig> = {}): AuthConfig {
  return {
    tokens: new Set(["secret-token-1", "secret-token-2"]),
    ...overrides,
  };
}

// ── validateToken ─────────────────────────────────────────────────────────────

Deno.test("validateToken: accepts valid static token", async () => {
  const config = makeConfig();
  assertEquals(await validateToken("Bearer secret-token-1", config), true);
  assertEquals(await validateToken("Bearer secret-token-2", config), true);
});

Deno.test("validateToken: rejects unknown token", async () => {
  const config = makeConfig();
  assertEquals(await validateToken("Bearer wrong-token", config), false);
});

Deno.test("validateToken: rejects missing header", async () => {
  const config = makeConfig();
  assertEquals(await validateToken(null, config), false);
  assertEquals(await validateToken(undefined, config), false);
  assertEquals(await validateToken("", config), false);
});

Deno.test("validateToken: rejects non-Bearer scheme", async () => {
  const config = makeConfig();
  assertEquals(await validateToken("Basic secret-token-1", config), false);
  assertEquals(await validateToken("Token secret-token-1", config), false);
});

Deno.test("validateToken: is case-insensitive on 'Bearer' scheme", async () => {
  const config = makeConfig();
  assertEquals(await validateToken("bearer secret-token-1", config), true);
  assertEquals(await validateToken("BEARER secret-token-1", config), true);
});

Deno.test("validateToken: rejects malformed header (no space)", async () => {
  const config = makeConfig();
  assertEquals(await validateToken("secret-token-1", config), false);
});

Deno.test("validateToken: rejects empty token after Bearer", async () => {
  const config = makeConfig();
  assertEquals(await validateToken("Bearer ", config), false);
  assertEquals(await validateToken("Bearer", config), false);
});

// ── loadAuthConfig ────────────────────────────────────────────────────────────

Deno.test("loadAuthConfig: returns null when no env vars set", () => {
  using _ = withEnv({});
  assertEquals(loadAuthConfig(), null);
});

Deno.test("loadAuthConfig: reads single MCP_AUTH_TOKEN", () => {
  using _ = withEnv({ MCP_AUTH_TOKEN: "my-token" });
  const config = loadAuthConfig();
  assertEquals(config?.tokens.has("my-token"), true);
  assertEquals(config?.tokens.size, 1);
});

Deno.test("loadAuthConfig: reads MCP_AUTH_TOKENS comma-separated list", () => {
  using _ = withEnv({ MCP_AUTH_TOKENS: "token-a, token-b , token-c" });
  const config = loadAuthConfig();
  assertEquals(config?.tokens.has("token-a"), true);
  assertEquals(config?.tokens.has("token-b"), true);
  assertEquals(config?.tokens.has("token-c"), true);
  assertEquals(config?.tokens.size, 3);
});

Deno.test("loadAuthConfig: merges MCP_AUTH_TOKEN and MCP_AUTH_TOKENS", () => {
  using _ = withEnv({
    MCP_AUTH_TOKEN: "single",
    MCP_AUTH_TOKENS: "multi-1,multi-2",
  });
  const config = loadAuthConfig();
  assertEquals(config?.tokens.size, 3);
  assertEquals(config?.tokens.has("single"), true);
  assertEquals(config?.tokens.has("multi-1"), true);
  assertEquals(config?.tokens.has("multi-2"), true);
});

Deno.test("loadAuthConfig: reads OAuth JWKS config", () => {
  using _ = withEnv({
    MCP_OAUTH_JWKS_URL: "https://auth.example.com/.well-known/jwks.json",
    MCP_OAUTH_AUDIENCE: "mcp-erpnext",
    MCP_OAUTH_ISSUER: "https://auth.example.com",
  });
  const config = loadAuthConfig();
  assertEquals(
    config?.jwksUrl,
    "https://auth.example.com/.well-known/jwks.json",
  );
  assertEquals(config?.audience, "mcp-erpnext");
  assertEquals(config?.issuer, "https://auth.example.com");
});

Deno.test("loadAuthConfig: ignores blank tokens in list", () => {
  using _ = withEnv({ MCP_AUTH_TOKENS: "tok,,  ,tok2" });
  const config = loadAuthConfig();
  assertEquals(config?.tokens.size, 2);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

// Temporarily override Deno env vars for the duration of the test block.
function withEnv(vars: Record<string, string>): Disposable {
  const saved: Record<string, string | undefined> = {};
  // Clear all relevant keys first
  const relevantKeys = [
    "MCP_AUTH_TOKEN",
    "MCP_AUTH_TOKENS",
    "MCP_OAUTH_JWKS_URL",
    "MCP_OAUTH_AUDIENCE",
    "MCP_OAUTH_ISSUER",
  ];
  for (const key of relevantKeys) {
    saved[key] = Deno.env.get(key);
    Deno.env.delete(key);
  }
  // Set test values
  for (const [k, v] of Object.entries(vars)) {
    Deno.env.set(k, v);
  }
  return {
    [Symbol.dispose]() {
      for (const key of relevantKeys) {
        Deno.env.delete(key);
        if (saved[key] !== undefined) Deno.env.set(key, saved[key]!);
      }
    },
  };
}
