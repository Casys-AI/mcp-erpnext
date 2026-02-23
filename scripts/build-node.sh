#!/usr/bin/env bash
# Build @casys/mcp-erpnext for Node.js distribution
#
# What this does:
# 1. Copies src/ and server.ts to dist-node/
# 2. Replaces runtime.ts with runtime.node.ts (node:fs instead of Deno.*)
# 3. Remaps Deno-ecosystem imports to npm equivalents
# 4. Strips .ts extensions from relative imports (Node ESM convention)
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

# Remap Deno-ecosystem imports to npm equivalents
# @casys/mcp-server → @casys/mcp-server (same npm package name)
# @std/yaml → yaml
find "$DIST_DIR" -name "*.ts" -exec sed -i 's|from "@std/yaml"|from "yaml"|g' {} +

# Strip .ts extensions from relative imports → .js (Node ESM)
find "$DIST_DIR" -name "*.ts" -exec sed -i \
  -e 's/from "\(\.[^"]*\)\.ts"/from "\1.js"/g' \
  -e 's/import("\(\.[^"]*\)\.ts")/import("\1.js")/g' \
  {} +

# Generate package.json
cat > "$DIST_DIR/package.json" <<'PKGJSON'
{
  "name": "@casys/mcp-erpnext",
  "version": "0.1.0",
  "description": "ERPNext MCP server with analytics, KPI, and UI viewers",
  "type": "module",
  "main": "server.ts",
  "types": "server.ts",
  "bin": {
    "mcp-erpnext": "server.ts"
  },
  "scripts": {
    "start": "tsx server.ts",
    "serve": "tsx server.ts --http --port=3012"
  },
  "dependencies": {
    "@casys/mcp-server": "*",
    "@modelcontextprotocol/sdk": "*"
  },
  "devDependencies": {
    "typescript": "*",
    "tsx": "*"
  },
  "engines": {
    "node": ">=20.0.0"
  },
  "license": "MIT"
}
PKGJSON

echo "[build-node] Done! Output: $DIST_DIR"
echo ""
echo "Next steps:"
echo "  cd $DIST_DIR"
echo "  npm install"
echo "  tsx server.ts --http"
