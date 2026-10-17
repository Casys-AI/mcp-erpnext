#!/usr/bin/env bash
# Local release preflight. It validates the same surfaces that publish depends on,
# without publishing anything.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[release-check] release guard (versions, tag channel, latest never moves backwards)"
# Same script as publish.yml. Set RELEASE_NPM_DIST_TAG=maintenance to preflight
# a backport. Stable versions query the npm registry (network required).
RELEASE_VERSION="$(node -p "JSON.parse(require('node:fs').readFileSync('deno.json', 'utf8')).version")"
node scripts/release-guard.mjs release \
  --ref "refs/tags/v$RELEASE_VERSION" \
  --requested-tag "${RELEASE_NPM_DIST_TAG:-auto}"

echo "[release-check] deno fmt --check"
deno fmt --check

echo "[release-check] deno lint"
deno lint

echo "[release-check] deno task check"
deno task check

echo "[release-check] npm ci && npm run build (src/ui)"
(
  cd src/ui
  npm ci
  npm run build
)

echo "[release-check] deno test --allow-all src/"
deno test --allow-all src/

echo "[release-check] release script tests (guard + third-party notices)"
deno task test:scripts

echo "[release-check] built Buy App bundle"
deno task check:buy-evidence-bundle

echo "[release-check] JSR package contents (deno publish --dry-run)"
deno publish --dry-run --allow-dirty

echo "[release-check] immutable Buy App session tests"
deno task test:buy-evidence-app

echo "[release-check] scripts/build-node.sh"
bash scripts/build-node.sh

echo "[release-check] THIRD_PARTY_NOTICES.txt matches the built bundles"
# Reads src/ui/.build-meta (UI build above) and dist-node/esbuild-metafile.json
# (build-node.sh above). Drift: node scripts/third-party-notices.mjs --write
node scripts/third-party-notices.mjs --check

echo "[release-check] OK"
