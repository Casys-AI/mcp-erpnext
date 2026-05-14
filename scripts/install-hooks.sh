#!/usr/bin/env bash
# Install git hooks via symlinks so they stay in sync with scripts/.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

chmod +x scripts/pre-commit.sh
ln -sf ../../scripts/pre-commit.sh .git/hooks/pre-commit

echo "[install-hooks] pre-commit hook installed"
