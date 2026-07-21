# Contributing to @casys/mcp-erpnext

Thanks for your interest in improving `@casys/mcp-erpnext`! 🙌 Contributions of
every size are welcome — a bug report, a new tool, a doc fix, a UI viewer.

This guide gets you set up and covers what we expect from a contribution. For
the full architecture and conventions, see [`AGENTS.md`](AGENTS.md).

## Ways to contribute

- **Report a bug** — use the
  [issue templates](https://github.com/Casys-AI/mcp-erpnext/issues/new/choose)
  (include repro steps and your ERPNext version).
- **Add or improve a tool** — the 120+ tools live in `src/tools/`, by category.
- **Add a UI viewer** — interactive MCP App views under `src/ui/`.
- **Improve docs** — README, guides, or AGENTS.md.

## Prerequisites

- [Deno](https://deno.com) 2.x (primary runtime and toolchain).
- [Node.js](https://nodejs.org) >= 20 (only for building the UI viewers).
- An ERPNext / Frappe instance for end-to-end testing (self-hosted or
  [ERPNext Cloud](https://frappecloud.com)). Generate an API key/secret as
  described in the [README](README.md#prerequisites).

## Getting started

```bash
git clone https://github.com/Casys-AI/mcp-erpnext.git
cd mcp-erpnext

# Run the test suite (no ERPNext instance needed — tests mock the client)
deno task test

# Type check
deno task check

# Start the HTTP server for local dev
ERPNEXT_URL=... ERPNEXT_API_KEY=... ERPNEXT_API_SECRET=... deno task serve
```

UI viewers live under `src/ui/` and use Vite/React:

```bash
cd src/ui
npm install
node build-all.mjs     # build all viewers
npm run dev:kanban     # dev a single viewer with HMR
```

Optional: `deno task hooks:install` installs a pre-commit hook that runs fmt +
lint + type-check locally.

## Before you open a pull request

Run the same checks CI runs:

```bash
deno fmt          # format (or `deno fmt --check` to verify)
deno lint         # lint
deno task check   # type check
deno task test    # tests
```

Or the full local release preflight (no publish): `deno task release:check`.

## The non-negotiables

A few rules that keep the codebase consistent — full detail in
[AGENTS.md → Coding Style](AGENTS.md#coding-style--naming-conventions):

- **Deno-flavored TypeScript.** Server-side imports use `.ts` extensions;
  external deps go through the import map in `deno.json`. Prefer strict typing —
  avoid `any`.
- **Never use `Deno.*` / `node:*` directly** in source — import runtime APIs
  from `./runtime.ts`. The project is dual-runtime (Deno + Node); the adapters
  are the only place that touches the platform.
- **No silent fallbacks.** All errors throw `FrappeAPIError`; don't add
  `try/catch` that swallows or hides errors
  ([Security & Configuration](AGENTS.md#security--configuration)).
- **Tool naming:** `erpnext_{entity}_{operation}` (snake_case, always
  `erpnext_`-prefixed). Register new tools in `src/tools/mod.ts` with the right
  `ToolAnnotations` (`readOnlyHint` / `destructiveHint`).
- **Tests are required.** A new tool needs at least one happy-path test and one
  error test, colocated as `foo.ts` / `foo_test.ts`. Tests mock `FrappeClient` —
  never hit a real ERPNext instance in the suite
  ([Testing Guidelines](AGENTS.md#testing-guidelines)).

## Commits & pull requests

- **Conventional commits** (`feat:`, `fix:`, `docs:`, `chore:`, …) — the
  CHANGELOG is generated from them.
- **Keep PRs focused** — group related changes, don't bundle unrelated
  refactors. User-facing changes go in the CHANGELOG.
- Use repo-root-relative file references in descriptions and issues (e.g.
  `src/tools/sales.ts:42`).
- A short _what_ and _why_ goes a long way. Maintainers review promptly and are
  happy to pair — open a draft PR early if you'd like feedback.

## Built on @casys/mcp-server

This server runs on
**[@casys/mcp-server](https://github.com/Casys-AI/mcp-server)**, the MCP
framework that handles concurrency, auth, MCP Apps, and observability. If a
change is about server / auth / transport plumbing rather than ERPNext tools, it
may belong there instead — happy to help figure out which repo fits.

## Reporting security issues

For security issues, follow [`SECURITY.md`](SECURITY.md) — **do not** open a
public issue.

## License

By contributing, you agree that your contributions are licensed under the
project's [MIT License](LICENSE).
