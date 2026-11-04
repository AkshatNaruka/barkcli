#!/usr/bin/env bash
set -euo pipefail

# Build and package barkcli official non-Swift desktop app on macOS (Tauri v2 + web SPA)
# Note: barkcli-ios is ARCHIVED/FROZEN. All desktop development targets desktop/ and web/.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "==> Building official non-Swift Bark.app..."
bash "$REPO_ROOT/desktop/scripts/build-macos-app.sh"

echo "==> Deploying to /Applications/Bark.app..."
pkill -f "Bark.app" || true
pkill -f "barkcli serve --app" || true
rm -f "$REPO_ROOT/.board/server-app.pid" "$REPO_ROOT/.board/server-app.json"
rm -rf /Applications/Bark.app
cp -R "$REPO_ROOT/desktop/target/release/bundle/macos/Bark.app" /Applications/Bark.app

echo "==> Verifying bundle..."
bash "$REPO_ROOT/desktop/scripts/verify-app.sh" /Applications/Bark.app

echo "==> Launching Bark.app..."
open /Applications/Bark.app
echo "Bark.app launched successfully."
