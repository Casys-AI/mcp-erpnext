#!/usr/bin/env bash
# Build @casys/mcp-erpnext for Node.js distribution
#
# What this does:
# 1. Copies src/ and server.ts to dist-node/
# 2. Replaces runtime.ts with runtime.node.ts (node:fs instead of Deno.*)
# 3. Strips .ts extensions from relative imports (Node ESM convention)
# 4. Installs the Node build dependencies in dist-node/
# 5. Produces a publishable npm package in dist-node/bin/
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

echo "[build-node] Building Node.js distribution for @casys/mcp-erpnext..."

# Clean
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

# Copy source files (exclude tests, UI source, and runtime.node.ts)
cp -r "$ROOT_DIR/src" "$DIST_DIR/src"
cp "$ROOT_DIR/server.ts" "$DIST_DIR/server.ts"
cp "$ROOT_DIR/mod.ts" "$DIST_DIR/mod.ts" 2>/dev/null || true

# Remove test files, UI source dirs (keep dist/), and node_modules from dist
find "$DIST_DIR" -name "*_test.ts" -o -name "*.test.ts" -o -name "*.bench.ts" | xargs rm -f 2>/dev/null || true
rm -rf "$DIST_DIR/src/ui/node_modules" 2>/dev/null || true
# Keep src/ui/dist/ (built HTML) but remove source viewer folders
find "$DIST_DIR/src/ui" -maxdepth 1 -type d ! -name "ui" ! -name "dist" ! -name "shared" ! -name "node_modules" -exec rm -rf {} + 2>/dev/null || true
rm -f "$DIST_DIR/src/ui/build-all.mjs" "$DIST_DIR/src/ui/vite.single.config.mjs" "$DIST_DIR/src/ui/package.json" "$DIST_DIR/src/ui/package-lock.json" 2>/dev/null || true

# Replace runtime.ts with runtime.node.ts
if [ -f "$DIST_DIR/src/runtime.node.ts" ]; then
  cp "$DIST_DIR/src/runtime.node.ts" "$DIST_DIR/src/runtime.ts"
  rm "$DIST_DIR/src/runtime.node.ts"
fi

# Strip .ts extensions from relative imports → .js (Node ESM)
find "$DIST_DIR" -name "*.ts" -exec sed -i \
  -e 's/from "\(\.[^"]*\)\.ts"/from "\1.js"/g' \
  -e 's/import("\(\.[^"]*\)\.ts")/import("\1.js")/g' \
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
  "dependencies": {
    "@casys/mcp-server": "^0.8.0",
    "@modelcontextprotocol/sdk": "^1.15.1"
  },
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
./node_modules/.bin/esbuild server.ts \
  --bundle \
  --platform=node \
  --target=node20 \
  --format=esm \
  --outfile=bin/mcp-erpnext.mjs \
  --external:node:* \
  --banner:js='import { createRequire } from "node:module"; const require = createRequire(import.meta.url);'
sed -i '1s/^/#!\/usr\/bin\/env node\n/' bin/mcp-erpnext.mjs
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
