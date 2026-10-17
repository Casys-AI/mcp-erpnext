# Environment Variables

Read timing depends on the subsystem, which matters when diagnosing a failure:

- **ERPNext connection and file-limit variables** are read when the singleton
  ERPNext client is first created. This is normally the first tool call, but a
  configured cache warm-up can create it during startup.
- **HTTP authentication, MRTR and tool selection variables** are read at process
  startup.
- **Cache variables are lazy:** `MCP_CACHE_ENABLED` is read when the cache
  singleton is first created, while `MCP_CACHE_TTL_MS` is read for each Frappe
  document/list cache insertion. `MCP_CACHE_WARM_TOOLS` is read during startup.

Invalid-value behaviour is documented per variable below; there is no global
fallback rule.

---

## ERPNext connection

Always required, regardless of transport (stdio or HTTP).

| Variable                     | Type                     | Default             | Required | Notes                                                                                                                                                                                                             |
| ---------------------------- | ------------------------ | ------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ERPNEXT_URL`                | string (URL)             | —                   | **Yes**  | Base URL of the ERPNext instance, e.g. `http://localhost:8000`. No trailing slash.                                                                                                                                |
| `ERPNEXT_API_KEY`            | string                   | —                   | **Yes**  | API key from ERPNext User Settings → API Access.                                                                                                                                                                  |
| `ERPNEXT_API_SECRET`         | string                   | —                   | **Yes**  | API secret paired with the key above.                                                                                                                                                                             |
| `ERPNEXT_MAX_UPLOAD_BYTES`   | positive integer         | `10485760` (10 MiB) | No       | Upper bound in decoded bytes for file uploads. Missing or blank uses the default; an invalid value fails client creation.                                                                                         |
| `ERPNEXT_MAX_DOWNLOAD_BYTES` | positive integer         | `10485760` (10 MiB) | No       | Upper bound in bytes for attachment downloads. Missing or blank uses the default; an invalid value fails client creation.                                                                                         |
| `ERPNEXT_METHOD_ALLOWLIST`   | string (comma-separated) | — (deny-by-default) | No       | Gates `erpnext_method_call`. Each entry is an exact dotted method path or a `prefix.*` wildcard; `*` allows any method. Unset or blank means no method is callable. Read per call, not cached at client creation. |

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

## Tool selection

Chooses which tools the server exposes. Read once at process startup: the list
is fixed for the lifetime of the process (it is also what the one-hour public
`tools/list` cache hint describes), so a change needs a restart. Each variable
has a CLI flag with the same meaning.

| Variable                     | CLI flag                 | Type                     | Default          | Notes                                                                                                                                                                                                                 |
| ---------------------------- | ------------------------ | ------------------------ | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ERPNEXT_CATEGORIES`         | `--categories=a,b`       | string (comma-separated) | — (all)          | Allow-list of categories. An unknown name is ignored with a warning on stderr; the server fails only if nothing is left.                                                                                              |
| `ERPNEXT_EXCLUDE_CATEGORIES` | `--exclude-categories=a` | string (comma-separated) | — (none removed) | Categories removed from the selection. An unknown name fails startup.                                                                                                                                                 |
| `ERPNEXT_EXCLUDE_TOOLS`      | `--exclude-tools=x,y`    | string (comma-separated) | — (none removed) | Exact tool names removed from the selection (for example `erpnext_file_list`). An unknown name fails startup. Names are checked against every tool, so excluding one that `--categories` already dropped is harmless. |

Valid categories: `sales`, `inventory`, `accounting`, `hr`, `project`,
`purchasing`, `delivery`, `manufacturing`, `crm`, `assets`, `operations`,
`setup`, `analytics`, `kanban`, `buy`. Tool names are listed in
[tools.md](tools.md).

Semantics: **selection = (categories, or all) minus excluded categories minus
excluded tools.** With no flag and no variable, every tool is exposed, exactly
as before.

Rules:

- **CLI over environment, per option.** `--exclude-tools=...` overrides
  `ERPNEXT_EXCLUDE_TOOLS` but leaves `ERPNEXT_EXCLUDE_CATEGORIES` in force.
- **A blank or missing variable is "not set"** (same convention as
  `ERPNEXT_METHOD_ALLOWLIST`). A variable that holds only separators (`,`) is an
  error.
- **Malformed exclusion flags fail; they are never ignored.**
  `--exclude-tools foo` (no `=`), `--exclude-tools=` (empty), or repeating
  `--exclude-categories` / `--exclude-tools` stops the server, because a
  silently ignored exclusion would leave the tool exposed. Repeating
  `--categories` keeps its historical behaviour (first occurrence wins) with a
  warning. A bare `--categories` or `--categories sales` is ignored with a
  warning for compatibility; use `--categories=sales`. `--categories=` is an
  error.
- **Final selection empty** (for example `--categories=slaes`, or every category
  excluded) fails startup instead of serving zero tools.
- **Excluded tools are really gone:** absent from `tools/list`, refused on
  `tools/call`, never run by `MCP_CACHE_WARM_TOOLS`, and the viewers hide the
  matching actions (they follow the tools the server actually exposes).
- The Buy Evidence viewer resources stay registered even without
  `erpnext_buy_capture`; the viewer shows recorded sessions and does not call
  live tools.

Errors go to stderr (never stdout, which carries the protocol in stdio mode),
exit code 1, in a readable and parseable form, followed by a JSON line with the
machine-readable context:

```text
[mcp-erpnext] INVALID_TOOL_FILTER: Unknown category "slaes"; valid categories: sales, inventory, ... Recovery: use only valid category names (case-sensitive, comma-separated)
[mcp-erpnext] {"code":"INVALID_TOOL_FILTER","context":{"option":"excludeCategories","received":["slaes"],"valid":[...],"reason":"UNKNOWN_CATEGORY"},"recovery":"..."}
```

`context.reason` is one of `UNKNOWN_CATEGORY`, `UNKNOWN_TOOL`, `MALFORMED_FLAG`,
`DUPLICATE_FLAG`, `EMPTY_VALUE`, `EMPTY_SELECTION`.

Examples:

```bash
# Everything except the Buy capture tool
ERPNEXT_EXCLUDE_CATEGORIES=buy npx -y @casys/mcp-erpnext

# Disable attachments only (keeps doc_get, doc_list, doc_submit, ...)
npx -y @casys/mcp-erpnext \
  --exclude-tools=erpnext_file_list,erpnext_file_upload,erpnext_file_download

# Docker: no need to override the CMD
docker run -e ERPNEXT_EXCLUDE_CATEGORIES=buy,operations ...
```

Excluding only `erpnext_file_list` hides the attachment UI, but leaves
`erpnext_file_upload` visible to the model: exclude the three file tools
together to disable attachments.

---

## ERPNext data cache

| Variable               | Type                                | Default            | Required | Notes                                                                                                                                                                                                                                                                                                                |
| ---------------------- | ----------------------------------- | ------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MCP_CACHE_ENABLED`    | `"true"` \| `"false"`               | `"true"` (enabled) | No       | Set to `"false"` to disable in-process caching entirely. Any value other than the string `"false"` is treated as enabled.                                                                                                                                                                                            |
| `MCP_CACHE_TTL_MS`     | non-negative integer                | `15000`            | No       | Default time-to-live in milliseconds for cached ERPNext responses. `0` is valid and causes entries to expire immediately (cache overhead still applies; prefer `MCP_CACHE_ENABLED=false` to skip caching altogether). Non-numeric or negative values are logged and fall back to the default.                        |
| `MCP_CACHE_WARM_TOOLS` | string (comma-separated tool names) | —                  | No       | List of read-only tool names to invoke at startup so their responses are pre-cached. Only tools annotated `readOnlyHint: true` are accepted; non-read-only, unknown, or excluded ([Tool selection](#tool-selection)) names are skipped with a log message and do not abort startup. Unset or empty disables warming. |

---

<!-- Maintainer source references (not user-facing):
  ERPNEXT_URL / ERPNEXT_API_KEY / ERPNEXT_API_SECRET /
  ERPNEXT_MAX_UPLOAD_BYTES / ERPNEXT_MAX_DOWNLOAD_BYTES:
    src/api/frappe-client.ts (file limits and getFrappeClient)
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
    src/cache/warm.ts (warmCache, resolves names in the active selection)
  ERPNEXT_CATEGORIES / ERPNEXT_EXCLUDE_CATEGORIES / ERPNEXT_EXCLUDE_TOOLS:
    src/tools/selection-config.ts (readSelectionConfig),
    src/tools/selection.ts (resolveToolSelection)
-->
