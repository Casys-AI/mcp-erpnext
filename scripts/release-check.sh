#!/usr/bin/env bash
# Local release preflight. It validates the same surfaces that publish depends on,
# without publishing anything.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[release-check] deno fmt --check"
deno fmt --check

echo "[release-check] deno lint"
deno lint

echo "[release-check] deno task check"
deno task check

echo "[release-check] deno test --allow-all src/"
deno test --allow-all src/

echo "[release-check] npm ci && npm run build (src/ui)"
(
  cd src/ui
  npm ci
  npm run build
)

echo "[release-check] scripts/build-node.sh"
bash scripts/build-node.sh

echo "[release-check] OK"
