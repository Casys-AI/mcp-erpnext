# Security Policy

## Supported versions

Security fixes are released for the latest published version. We recommend
always running the most recent release of `@casys/mcp-erpnext`.

| Version | Supported          |
| ------- | ------------------ |
| 2.x     | :white_check_mark: |
| < 2.0   | :x:                |

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

Report them privately via GitHub's
[private vulnerability reporting](https://github.com/Casys-AI/mcp-erpnext/security/advisories/new)
(Security tab → "Report a vulnerability"). We aim to acknowledge reports within
72 hours and to ship a fix or mitigation as quickly as the severity warrants.

When reporting, please include:

- A description of the issue and its impact.
- Steps to reproduce (a minimal repro is ideal).
- Affected version(s) and environment (self-hosted vs ERPNext Cloud).

## Handling of credentials

This server connects to your ERPNext instance using an **API key / API secret**
pair supplied through environment variables (`ERPNEXT_API_KEY`,
`ERPNEXT_API_SECRET`). Please keep the following in mind:

- Credentials are read from the environment and sent only to the configured
  `ERPNEXT_URL`. They are **never** logged or persisted by this server.
- Scope the ERPNext API user to the minimum roles required for your use case.
- Never commit credentials. The repository ships a `.gitignore` and expects
  secrets to live in your MCP client config or a local, untracked `.env`.
- In HTTP mode, terminate TLS in front of the server and restrict network access
  — the server trusts its environment for authentication.

If you discover credentials being leaked, logged, or transmitted anywhere other
than the configured ERPNext instance, treat it as a security issue and report it
via the channel above.
