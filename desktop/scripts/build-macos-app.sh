#!/usr/bin/env bash
# Build the macOS app from the current workspace.
#
# Order matters: the sidecar and the web assets are bundled into the .app, so
# both must be rebuilt before Tauri packages them. The final verify step fails
# the build if either one is stale.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

APP="$ROOT/desktop/target/release/bundle/macos/Bark.app"

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
  echo "cargo-tauri not installed; using npx @tauri-apps/cli@2"
  npx --yes @tauri-apps/cli@2 build
fi

echo "==> ad-hoc signing"
xattr -cr "$APP" 2>/dev/null || true
codesign --force --deep --sign - "$APP"

echo "==> verifying bundle"
bash "$ROOT/desktop/scripts/verify-app.sh" "$APP"

echo
echo "app: $APP"
