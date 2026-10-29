#!/usr/bin/env bash
# Cross-platform app build (no macOS signing). Use build-macos-app.sh on macOS
# when you want the verified, signed bundle.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

echo "==> barkcli (release)"
cargo build --release -p barkcli

if [[ ! -d "$ROOT/web/node_modules" ]]; then
  echo "==> web dependencies"
  npm --prefix "$ROOT/web" ci
fi

echo "==> web/dist"
bash "$ROOT/desktop/scripts/build-web.sh"

echo "==> sidecar staging"
bash "$ROOT/desktop/scripts/prepare-sidecar.sh" release

echo "==> Tauri bundle"
cd "$ROOT/desktop"
if cargo tauri --version >/dev/null 2>&1; then
  cargo tauri build
else
  npx --yes @tauri-apps/cli@2 build
fi

echo
echo "app: $ROOT/desktop/target/release/bundle"
