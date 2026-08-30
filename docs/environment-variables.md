# Environment Variables

Read at two different moments, which matters when diagnosing a failure:

- **ERPNext connection variables** are read lazily, on the first tool call. The
  server starts and lists its tools without them; the failure surfaces when a
  tool first needs the client.
- **Everything else** is read at process startup.

Where a value is unrecognised, the listed default applies. The three ERPNext
connection variables are the exception — a missing one throws, rather than
falling back.

---

## ERPNext connection

Always required, regardless of transport (stdio or HTTP).

| Variable                   | Type                     | Default             | Required | Notes                                                                                                                                                                                                             |
| -------------------------- | ------------------------ | ------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ERPNEXT_URL`              | string (URL)             | —                   | **Yes**  | Base URL of the ERPNext instance, e.g. `http://localhost:8000`. No trailing slash.                                                                                                                                |
| `ERPNEXT_API_KEY`          | string                   | —                   | **Yes**  | API key from ERPNext User Settings → API Access.                                                                                                                                                                  |
| `ERPNEXT_API_SECRET`       | string                   | —                   | **Yes**  | API secret paired with the key above.                                                                                                                                                                             |
| `ERPNEXT_MAX_UPLOAD_BYTES` | non-negative integer     | `10485760` (10 MiB) | No       | Upper bound in bytes for file uploads. Must be a positive integer; invalid or missing values fall back to the default.                                                                                            |
| `ERPNEXT_METHOD_ALLOWLIST` | string (comma-separated) | — (deny-by-default) | No       | Gates `erpnext_method_call`. Each entry is an exact dotted method path or a `prefix.*` wildcard; `*` allows any method. Unset or blank means no method is callable. Read per call, not cached at client creation. |

---

## MRTR — signed link disambiguation

| Variable               | Type                            | Default | Required | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------- | ------------------------------- | ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MCP_MRTR_SIGNING_KEY` | string (64 lowercase hex chars) | —       | No       | Enables MRTR (Multi-Record Type Resolution). Without it, ambiguous link-field values abort with a list of candidates. With it, the server issues a signed retry token the client can replay to select a candidate; the client must declare `elicitation` support. In multi-instance deployments a shared atomic replay store must be configured — see `docs/concepts.md`. The value must match `/^[0-9a-f]{64}$/`; a key that fails validation causes the server to throw on startup. |

---

## HTTP authentication

Applies only when running in HTTP transport mode. These variables are ignored by
stdio deployments.

`MCP_AUTH_RESOURCE` is required whenever any other variable in this group is
set.

| Variable             | Type                     | Default | Required | Notes                                                                                                                                                                               |
| -------------------- | ------------------------ | ------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MCP_AUTH_TOKEN`     | string                   | —       | No       | Single static bearer token accepted on HTTP requests.                                                                                                                               |
| `MCP_AUTH_TOKENS`    | string (comma-separated) | —       | No       | Multiple static bearer tokens, parsed by splitting on commas. Combined with `MCP_AUTH_TOKEN` if both are set.                                                                       |
| `MCP_OAUTH_JWKS_URL` | string (URL)             | —       | No       | JWKS endpoint for OAuth 2.0 JWT validation. When set, `MCP_OAUTH_ISSUER`, `MCP_OAUTH_AUDIENCE`, and `MCP_AUTH_RESOURCE` are all required.                                           |
| `MCP_OAUTH_AUDIENCE` | string                   | —       | No       | Expected `aud` claim in incoming JWTs. Required alongside `MCP_OAUTH_JWKS_URL`.                                                                                                     |
| `MCP_OAUTH_ISSUER`   | string                   | —       | No       | Expected `iss` claim / OIDC issuer. Required alongside `MCP_OAUTH_JWKS_URL`.                                                                                                        |
| `MCP_AUTH_RESOURCE`  | string (URL)             | —       | No       | Public URL of this server's MCP endpoint (e.g. `https://mcp.example.com/mcp`), used to emit RFC 9728 Protected Resource Metadata. Required whenever any auth variable above is set. |

---

## ERPNext data cache

| Variable               | Type                                | Default            | Required | Notes                                                                                                                                                                                                                                                                                         |
| ---------------------- | ----------------------------------- | ------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MCP_CACHE_ENABLED`    | `"true"` \| `"false"`               | `"true"` (enabled) | No       | Set to `"false"` to disable in-process caching entirely. Any value other than the string `"false"` is treated as enabled.                                                                                                                                                                     |
| `MCP_CACHE_TTL_MS`     | non-negative integer                | `15000`            | No       | Default time-to-live in milliseconds for cached ERPNext responses. `0` is valid and causes entries to expire immediately (cache overhead still applies; prefer `MCP_CACHE_ENABLED=false` to skip caching altogether). Non-numeric or negative values are logged and fall back to the default. |
| `MCP_CACHE_WARM_TOOLS` | string (comma-separated tool names) | —                  | No       | List of read-only tool names to invoke at startup so their responses are pre-cached. Only tools annotated `readOnlyHint: true` are accepted; non-read-only or unknown names are skipped with a log message and do not abort startup. Unset or empty disables warming.                         |

---

<!-- Maintainer source references (not user-facing):
  ERPNEXT_URL / ERPNEXT_API_KEY / ERPNEXT_API_SECRET / ERPNEXT_MAX_UPLOAD_BYTES:
    src/api/frappe-client.ts (DEFAULT_MAX_UPLOAD_BYTES, getFrappeClient)
  ERPNEXT_METHOD_ALLOWLIST:
    src/tools/method-allowlist.ts (loadMethodAllowlist, isMethodAllowed)
  MCP_MRTR_SIGNING_KEY:
    src/mrtr/config.ts:23-32 (loadMrtrConfig, regex validation)
  MCP_AUTH_TOKEN / MCP_AUTH_TOKENS / MCP_OAUTH_JWKS_URL:
    src/auth/config.ts:68-70 (loadAuthConfig)
  MCP_OAUTH_AUDIENCE / MCP_OAUTH_ISSUER / MCP_AUTH_RESOURCE:
    src/auth/config.ts:84-88 (loadAuthConfig return)
  MCP_CACHE_ENABLED / MCP_CACHE_TTL_MS:
    src/cache/cache.ts:22 (DEFAULT_CACHE_TTL_MS), :27 (getCacheTtlMs), :45 (getCache)
  MCP_CACHE_WARM_TOOLS:
    src/cache/warm.ts:27 (warmCache)
-->
