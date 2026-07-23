# OAuth Setup Guide for mcp-erpnext

This server supports two auth modes that can be used together:

| Mode                    | Best for                                              |
| ----------------------- | ----------------------------------------------------- |
| **Static Bearer token** | Same-network deployments (Docker, VPN, LAN)           |
| **OAuth 2.0 JWT**       | External/public access, team SSO, fine-grained scopes |

OAuth works with any provider that exposes a **JWKS endpoint** — Auth0,
Keycloak, Google, Authentik, Zitadel, Azure AD, Okta, etc.

---

## How it works

```
LibreChat  ──Bearer JWT──►  mcp-erpnext (port 7654)
                                  │
                          validates JWT against
                          provider's JWKS URL
                          (@casys/mcp-server's
                           createOIDCAuthProvider)
                                  │
                            ✓ valid → handle
                            ✗ invalid → 401
```

Token validation happens in-process — `@casys/mcp-server` fetches your
provider's public keys once and caches them. No credentials are stored — only
the token's signature and claims are verified.

The canonical Streamable HTTP endpoint is `/mcp`. Set `MCP_AUTH_RESOURCE` to
that exact public URL (for example, `https://mcp.example.com/mcp`). The server
also publishes the matching RFC 9728 metadata at
`/.well-known/oauth-protected-resource/mcp`; make sure a reverse proxy forwards
that path too.

---

## Environment variables

Add these to your `.env` file:

```env
# Required for OAuth
MCP_OAUTH_JWKS_URL=https://your-idp/.well-known/jwks.json
MCP_OAUTH_AUDIENCE=mcp-erpnext
MCP_OAUTH_ISSUER=https://your-idp

# Required for any auth mode — the exact public MCP endpoint URL (RFC 9728)
MCP_AUTH_RESOURCE=https://mcp.example.com/mcp

# You can keep static tokens alongside OAuth (both work simultaneously)
# MCP_AUTH_TOKEN=your-static-token
```

---

## Provider setup

### Option A — Auth0

1. Go to **Applications → APIs → Create API**
   - Name: `ERPNext MCP`
   - Identifier: `mcp-erpnext` ← this becomes your audience

2. Your JWKS URL is:
   ```
   https://YOUR_DOMAIN.auth0.com/.well-known/jwks.json
   ```

3. To issue tokens (for testing or service accounts), go to **Applications →
   Machine to Machine** and authorize the API.

4. `.env`:
   ```env
   MCP_OAUTH_JWKS_URL=https://YOUR_DOMAIN.auth0.com/.well-known/jwks.json
   MCP_OAUTH_AUDIENCE=mcp-erpnext
   MCP_OAUTH_ISSUER=https://YOUR_DOMAIN.auth0.com/
   MCP_AUTH_RESOURCE=https://mcp.example.com/mcp
   ```

---

### Option B — Keycloak (self-hosted)

1. Create a **Realm** (e.g. `erpnext`)

2. Create a **Client**:
   - Client ID: `mcp-erpnext`
   - Client Protocol: `openid-connect`
   - Access Type: `confidential`
   - Service Accounts: **Enabled**

3. Your JWKS URL is:
   ```
   https://keycloak.yourdomain.com/realms/erpnext/protocol/openid-connect/certs
   ```

4. `.env`:
   ```env
   MCP_OAUTH_JWKS_URL=https://keycloak.yourdomain.com/realms/erpnext/protocol/openid-connect/certs
   MCP_OAUTH_AUDIENCE=mcp-erpnext
   MCP_OAUTH_ISSUER=https://keycloak.yourdomain.com/realms/erpnext
   MCP_AUTH_RESOURCE=https://mcp.example.com/mcp
   ```

5. Get a token for testing (client credentials flow):
   ```bash
   curl -s -X POST \
     https://keycloak.yourdomain.com/realms/erpnext/protocol/openid-connect/token \
     -d "grant_type=client_credentials" \
     -d "client_id=mcp-erpnext" \
     -d "client_secret=YOUR_CLIENT_SECRET" \
     | jq -r .access_token
   ```

---

### Option C — Authentik (self-hosted, Docker-friendly)

1. Create a **Provider**: OAuth2/OpenID — Client Credentials flow
2. Create an **Application** bound to that provider
3. Your JWKS URL is:
   ```
   https://authentik.yourdomain.com/application/o/YOUR_APP_SLUG/jwks/
   ```

4. `.env`:
   ```env
   MCP_OAUTH_JWKS_URL=https://authentik.yourdomain.com/application/o/YOUR_APP_SLUG/jwks/
   MCP_OAUTH_AUDIENCE=mcp-erpnext
   MCP_OAUTH_ISSUER=https://authentik.yourdomain.com/application/o/YOUR_APP_SLUG/
   MCP_AUTH_RESOURCE=https://mcp.example.com/mcp
   ```

---

### Option D — Google (for Google Workspace teams)

Google's JWKS URL is public:

```
https://www.googleapis.com/oauth2/v3/certs
```

1. Go to **Google Cloud Console → APIs & Services → Credentials → Create OAuth
   2.0 Client ID** (type: Web application)

2. `.env`:
   ```env
   MCP_OAUTH_JWKS_URL=https://www.googleapis.com/oauth2/v3/certs
   MCP_OAUTH_AUDIENCE=YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com
   MCP_OAUTH_ISSUER=https://accounts.google.com
   MCP_AUTH_RESOURCE=https://mcp.example.com/mcp
   ```

> **Note**: Google issues short-lived tokens. This works for user-delegated
> access but not for automated/service-account flows.

---

## Deploy

```bash
# 1. Update .env with the OAuth vars above

# 2. Rebuild and restart
docker compose up -d --build

# 3. Check logs to confirm OAuth is active
docker compose logs mcp-erpnext --tail=20
# Should show:
# [mcp-erpnext] Auth: OAuth JWT JWKS (https://...)
```

---

## Test OAuth is working

```bash
# Step 1 — get a JWT from your provider (example: client credentials)
TOKEN=$(curl -s -X POST https://YOUR_IDP/token \
  -d "grant_type=client_credentials&client_id=mcp-erpnext&client_secret=SECRET" \
  | jq -r .access_token)

# Step 2 — call the MCP server with it
curl -s http://localhost:7654/mcp \
  -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"initialize","id":1,"params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}'

# Step 3 — confirm 401 without token
curl -sv http://localhost:7654/mcp -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"ping","id":1}'
# Expect: HTTP 401 + WWW-Authenticate: Bearer resource_metadata="…", error="missing_token"
```

---

## LibreChat configuration

LibreChat sends the token in the `Authorization` header. You have two options:

### Static token (recommended for same-network Docker)

```yaml
# librechat.yml
mcpServers:
  erpnext:
    type: streamable-http
    url: http://mcp-erpnext:7654/mcp
    title: "ERPNext"
    timeout: 60000
    initTimeout: 20000
    serverInstructions: true
    headers:
      Authorization: "Bearer YOUR_STATIC_TOKEN"
```

### OAuth — service account JWT (for external IdPs)

Issue a long-lived service account token from your IdP and treat it like a
static token in LibreChat:

```yaml
mcpServers:
  erpnext:
    type: streamable-http
    url: http://mcp-erpnext:7654/mcp
    title: "ERPNext"
    timeout: 60000
    initTimeout: 20000
    serverInstructions: true
    headers:
      Authorization: "Bearer SERVICE_ACCOUNT_JWT_FROM_YOUR_IDP"
```

> LibreChat does not currently support automatic OAuth token refresh for MCP
> connections. Use a service account with a long-lived token or rotate it via
> your CI/CD pipeline.

---

## Mixing both auth modes

Both modes are active simultaneously if you set both sets of env vars:

```env
# Static token for LibreChat / internal tooling
MCP_AUTH_TOKEN=my-static-secret

# OAuth JWT for external clients / user-level access
MCP_OAUTH_JWKS_URL=https://your-idp/.well-known/jwks.json
MCP_OAUTH_AUDIENCE=mcp-erpnext
MCP_OAUTH_ISSUER=https://your-idp

# Required either way
MCP_AUTH_RESOURCE=https://mcp.example.com/mcp
```

A request is accepted if it passes **either** check — internally,
`CompositeAuthProvider` tries the static-token provider first, then falls back
to the OAuth JWT provider.

---

## Troubleshooting

| Symptom                                        | Likely cause                        | Fix                                                                                                                   |
| ---------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `401` with a valid-looking token               | Wrong audience or issuer claim      | Check `MCP_OAUTH_AUDIENCE` matches the `aud` claim in the JWT (decode at jwt.io)                                      |
| `401` with `JWTExpired` in logs                | Token has expired                   | Re-issue a fresh token; for service accounts use a longer expiry                                                      |
| `401` on every request                         | JWKS URL unreachable from container | Run `docker exec mcp-erpnext deno eval "console.log((await fetch('YOUR_JWKS_URL')).status)"` to verify network access |
| Startup throws `MCP_AUTH_RESOURCE is required` | Resource URL missing                | Set `MCP_AUTH_RESOURCE` to the exact public MCP endpoint URL (normally `https://host/mcp`) — required for both modes  |
| Server logs show no auth mode                  | Env vars not loaded                 | Check `.env` file path and `docker compose logs` for startup message                                                  |
| Both static + OAuth returning 401              | Whitespace in token                 | Trim leading/trailing spaces in `.env` values                                                                         |
