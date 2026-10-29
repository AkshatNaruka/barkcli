#!/usr/bin/env bash
# Build the web UI from any working directory inside the repo.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

echo "web: building $ROOT/web/dist"
npm --prefix web run build
