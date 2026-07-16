#!/usr/bin/env bash
# Build @casys/mcp-erpnext for Node.js distribution
#
# What this does:
# 1. Copies src/ and server.ts to dist-node/
#    (runtime selection is handled at load time by src/runtime.ts, which
#    picks runtime.deno.ts or runtime.node.ts — no build-time swap)
# 2. Strips .ts extensions from relative imports (Node ESM convention)
# 3. Installs the Node build dependencies in dist-node/
#    (@casys/mcp-server comes from npm — its own npm build — not from a
#    re-bundle of its Deno/JSR source)
# 4. Produces a publishable npm package in dist-node/bin/
#
# Usage:
#   cd lib/erpnext && ./scripts/build-node.sh
#
# Output: dist-node/ ready for npm publish
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist-node"
VERSION="$(grep '"version"' "$ROOT_DIR/deno.json" | sed 's/.*"version": *"\([^"]*\)".*/\1/')"
MCP_SERVER_VERSION="$(grep '"@casys/mcp-server"' "$ROOT_DIR/deno.json" | sed 's/.*"@casys\/mcp-server": *"jsr:@casys\/mcp-server@\([^"]*\)".*/\1/')"

echo "[build-node] Building Node.js distribution for @casys/mcp-erpnext..."

# Clean
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

# Copy source files (exclude tests and UI source)
cp -r "$ROOT_DIR/src" "$DIST_DIR/src"
cp "$ROOT_DIR/server.ts" "$DIST_DIR/server.ts"
cp "$ROOT_DIR/mod.ts" "$DIST_DIR/mod.ts" 2>/dev/null || true

# Remove test files, UI source dirs (keep dist/), and node_modules from dist
find "$DIST_DIR" -name "*_test.ts" -o -name "*.test.ts" -o -name "*.bench.ts" | xargs rm -f 2>/dev/null || true
rm -rf "$DIST_DIR/src/ui/node_modules" 2>/dev/null || true
# Keep src/ui/dist/ (built HTML) but remove source viewer folders
find "$DIST_DIR/src/ui" -maxdepth 1 -type d ! -name "ui" ! -name "dist" ! -name "shared" ! -name "node_modules" -exec rm -rf {} + 2>/dev/null || true
rm -f "$DIST_DIR/src/ui/build-all.mjs" "$DIST_DIR/src/ui/vite.single.config.mjs" "$DIST_DIR/src/ui/package.json" "$DIST_DIR/src/ui/package-lock.json" 2>/dev/null || true

# Strip .ts extensions from relative imports → .js (Node ESM)
find "$DIST_DIR" -name "*.ts" -exec perl -pi -e \
  's/from "(\.[^"]*)\.ts"/from "$1.js"/g; s/import\("(\.[^"]*)\.ts"\)/import("$1.js")/g' \
  {} +

# Generate package.json for the intermediate Node workspace
cat > "$DIST_DIR/package.json" <<PKGJSON
{
  "name": "@casys/mcp-erpnext-build",
  "private": true,
  "version": "$VERSION",
  "description": "Intermediate build workspace for @casys/mcp-erpnext",
  "type": "module",
  "main": "server.ts",
  "types": "server.ts",
  "scripts": {
    "start": "tsx server.ts",
    "serve": "tsx server.ts --http --port=3012"
  },
  "dependencies": {},
  "devDependencies": {
    "esbuild": "^0.25.12",
    "tsx": "^4.20.6",
    "typescript": "^5.9.2"
  },
  "engines": {
    "node": ">=20.0.0"
  },
  "license": "MIT"
}
PKGJSON

# Copy README into the intermediate workspace
cp "$ROOT_DIR/README.md" "$DIST_DIR/README.md" 2>/dev/null || true

pushd "$DIST_DIR" >/dev/null
npm install --no-fund --no-audit
# Install @casys/mcp-server from npm: its npm build ships the same runtime
# selector as the JSR source, so the bundle stays Node-clean (no Deno.*).
# MCP_SERVER_OVERRIDE lets CI/local builds point at a tarball for pre-release
# end-to-end validation.
npm install --no-fund --no-audit "${MCP_SERVER_OVERRIDE:-@casys/mcp-server@$MCP_SERVER_VERSION}"
# Fail fast if npm resolved a version older than 0.21.1 — the first release
# whose npm build is fully Node-clean (runtime selector + launcher). An older
# resolution would silently re-embed Deno.* calls in the published bundle.
node -e '
  const v = require("@casys/mcp-server/package.json").version;
  const [ma, mi, pa] = v.split(".").map(Number);
  if (ma === 0 && (mi < 21 || (mi === 21 && pa < 1))) {
    console.error(`[build-node] @casys/mcp-server ${v} predates the runtime-selector fix (need >=0.21.1)`);
    process.exit(1);
  }
  console.log(`[build-node] @casys/mcp-server ${v} OK (>=0.21.1)`);
'
./node_modules/.bin/esbuild server.ts \
  --bundle \
  --platform=node \
  --target=node20 \
  --format=esm \
  --outfile=bin/mcp-erpnext.mjs \
  --external:node:* \
  --banner:js='import { createRequire } from "node:module"; const require = createRequire(import.meta.url);'
tmp_shebang="$(mktemp)"
printf '#!/usr/bin/env node\n' > "$tmp_shebang"
cat bin/mcp-erpnext.mjs >> "$tmp_shebang"
mv "$tmp_shebang" bin/mcp-erpnext.mjs
chmod +x bin/mcp-erpnext.mjs
cp -r src/ui/dist bin/ui-dist
cp README.md bin/README.md 2>/dev/null || cp ../README.md bin/README.md 2>/dev/null || true

cat > bin/package.json <<PKGJSON
{
  "name": "@casys/mcp-erpnext",
  "version": "$VERSION",
  "description": "MCP server for ERPNext with interactive UI viewers",
  "type": "module",
  "bin": {
    "mcp-erpnext": "mcp-erpnext.mjs"
  },
  "files": [
    "mcp-erpnext.mjs",
    "ui-dist/**/*",
    "README.md"
  ],
  "keywords": [
    "mcp",
    "erpnext",
    "frappe",
    "erp",
    "model-context-protocol",
    "claude",
    "ai",
    "tools"
  ],
  "engines": {
    "node": ">=20.0.0"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/Casys-AI/mcp-erpnext"
  },
  "license": "MIT"
}
PKGJSON
popd >/dev/null

echo "[build-node] Done! Intermediate workspace: $DIST_DIR"
echo "[build-node] Publishable package: $DIST_DIR/bin"
echo ""
echo "Useful commands:"
echo "  node $DIST_DIR/bin/mcp-erpnext.mjs --http --port=3012"
echo "  cd $DIST_DIR/bin && npm pack"
