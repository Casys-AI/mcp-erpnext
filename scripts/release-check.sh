#!/usr/bin/env bash
# Local release preflight. It validates the same surfaces that publish depends on,
# without publishing anything.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[release-check] documented install version matches deno.json"
VERSION="$(node -p "JSON.parse(require('node:fs').readFileSync('deno.json', 'utf8')).version")"
# Sur une préversion, les deux README portent un encart qui épingle la version
# exacte à installer. Rien ne le liait à deno.json, et il est resté deux
# releases en arrière : un lecteur suivant le README installait une autre
# build que celle qu'on venait de publier.
if [[ "$VERSION" == *-* ]]; then
  for readme in README.md README.zh-TW.md; do
    # Toutes les versions épinglées du README, pas seulement la présence de la
    # bonne : un README qui cite la version courante ET une ancienne passerait
    # un simple grep, alors que c'est exactement le cas qu'on veut attraper.
    STALE="$(grep -oE "@casys/mcp-erpnext@[0-9][A-Za-z0-9.-]*[A-Za-z0-9]" "$readme" |
      grep -vFx "@casys/mcp-erpnext@$VERSION" | sort -u | tr '\n' ' ' || true)"
    if [ -n "$STALE" ]; then
      echo "[release-check] $readme pins ${STALE}instead of $VERSION" >&2
      exit 1
    fi
    if ! grep -qF "@casys/mcp-erpnext@$VERSION" "$readme"; then
      echo "[release-check] $readme documents no install command for $VERSION" >&2
      exit 1
    fi
  done
fi

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
