#!/usr/bin/env bash
# Pre-commit hook — runs deno fmt/lint/check before allowing commit.
#
# Install:
#   ln -s ../../scripts/pre-commit.sh .git/hooks/pre-commit
#   chmod +x scripts/pre-commit.sh
#
# Or via deno task:
#   deno task hooks:install

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[pre-commit] deno fmt --check"
deno fmt --check

echo "[pre-commit] deno lint"
deno lint

echo "[pre-commit] deno check"
deno check mod.ts server.ts

echo "[pre-commit] OK"
