# Contributing to mcp-erpnext

Thanks for your interest in improving `@casys/mcp-erpnext`! This guide covers
how to get set up and what we expect from a contribution. For the full
architecture and conventions, see [`AGENTS.md`](AGENTS.md).

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

# Install git hooks (runs fmt + lint + type-check before each commit)
deno task hooks:install

# Run the test suite
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
node build-all.mjs        # build all viewers
npm run dev:kanban        # dev a single viewer with HMR
```

## Before you open a pull request

Run the same checks CI runs:

```bash
deno fmt          # format (or `deno fmt --check` to verify)
deno lint         # lint
deno task check   # type check
deno task test    # tests
```

Or run the full local release preflight (no publish):

```bash
deno task release:check
```

## Conventions

- **Commits** follow [Conventional Commits](https://www.conventionalcommits.org)
  (`feat:`, `fix:`, `docs:`, `chore:`, …) — the CHANGELOG is generated from
  them.
- **Tools** are grouped one file per category under `src/tools/`. New tools must
  be registered in `src/tools/mod.ts` and carry the right `ToolAnnotations`
  (`readOnlyHint` / `destructiveHint`).
- **Tests** are colocated with source (`foo.ts` / `foo_test.ts`).
- Keep server-side deps in `deno.json`'s import map; keep UI-only deps in
  `src/ui/package.json`.
- File references in PR descriptions and issues should be repo-root relative
  (e.g. `src/tools/sales.ts:42`).

## Reporting bugs & requesting features

Use the
[issue templates](https://github.com/Casys-AI/mcp-erpnext/issues/new/choose).
For security issues, follow [`SECURITY.md`](SECURITY.md) — **do not** open a
public issue.

## License

By contributing, you agree that your contributions are licensed under the
project's [MIT License](LICENSE).
