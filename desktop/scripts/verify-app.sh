#!/usr/bin/env bash
# Fail when the macOS bundle is not the same build as the workspace.
#
# Usage: desktop/scripts/verify-app.sh [path/to/Bark.app]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP="${1:-$ROOT/desktop/target/release/bundle/macos/Bark.app}"
SIDECAR="$APP/Contents/MacOS/barkcli"
BUNDLED_DIST="$APP/Contents/Resources/web/dist"
BUNDLED_JS="$BUNDLED_DIST/assets/index.js"
FRESH_JS="$ROOT/web/dist/assets/index.js"
RELEASE_BIN="$ROOT/target/release/barkcli"

failures=0
ok() { printf '  ok  %s\n' "$*"; }
bad() { printf 'FAIL  %s\n' "$*" >&2; failures=$((failures + 1)); }

echo "verify: $APP"

if [[ ! -d "$APP" ]]; then
  echo "missing app bundle: $APP" >&2
  exit 1
fi

if [[ -x "$SIDECAR" ]]; then
  ok "sidecar exists"
else
  bad "sidecar missing or not executable: $SIDECAR"
fi

if [[ -x "$RELEASE_BIN" ]]; then
  ok "workspace release binary exists"
else
  bad "missing $RELEASE_BIN (run: cargo build --release -p barkcli)"
fi

if [[ -f "$FRESH_JS" ]]; then
  ok "web/dist build exists"
else
  bad "missing $FRESH_JS (run: bash desktop/scripts/build-web.sh)"
fi

if [[ -x "$SIDECAR" && -x "$RELEASE_BIN" ]]; then
  bundled_version="$("$SIDECAR" --version 2>/dev/null | head -1)"
  release_version="$("$RELEASE_BIN" --version 2>/dev/null | head -1)"
  if [[ "$bundled_version" == "$release_version" ]]; then
    ok "sidecar matches workspace: $bundled_version"
  else
    bad "stale sidecar: bundled '$bundled_version' vs workspace '$release_version'"
  fi
fi

if [[ -f "$BUNDLED_JS" && -f "$FRESH_JS" ]]; then
  bundled_hash="$(shasum -a 256 "$BUNDLED_JS" | awk '{print $1}')"
  fresh_hash="$(shasum -a 256 "$FRESH_JS" | awk '{print $1}')"
  if [[ "$bundled_hash" == "$fresh_hash" ]]; then
    ok "bundled UI matches web/dist ($bundled_hash)"
  else
    bad "stale UI: bundled $bundled_hash vs web/dist $fresh_hash"
  fi

  if grep -q 'review/queue' "$BUNDLED_JS" && grep -q 'receipts' "$BUNDLED_JS"; then
    ok "trust-layer UI markers present"
  else
    bad "bundled UI is missing trust-layer markers (receipts / review/queue)"
  fi
else
  bad "missing bundled or fresh assets/index.js"
fi

if [[ -f "$BUNDLED_DIST/index.html" ]]; then
  if grep -q 'assets/index.js' "$BUNDLED_DIST/index.html"; then
    ok "index.html references assets/index.js"
  else
    bad "bundled index.html does not reference assets/index.js"
  fi
else
  bad "missing bundled index.html"
fi

if [[ -x "$SIDECAR" ]]; then
  if "$SIDECAR" receipt --help 2>&1 | grep -q 'Usage: barkcli receipt'; then
    ok "bundled sidecar supports receipt"
  else
    bad "bundled sidecar does not support receipt"
  fi

  if "$SIDECAR" --help 2>&1 | grep -qE '^[[:space:]]+guard[[:space:]]'; then
    ok "bundled sidecar supports guard"
  else
    bad "bundled sidecar does not support guard"
  fi
fi

if [[ -f "$APP/Contents/Info.plist" ]]; then
  expected_version="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$ROOT/desktop/tauri.conf.json")"
  actual_version="$(plutil -extract CFBundleShortVersionString raw "$APP/Contents/Info.plist" 2>/dev/null || true)"
  if [[ "$actual_version" == "$expected_version" ]]; then
    ok "Info.plist version $actual_version"
  else
    bad "Info.plist version '$actual_version' != tauri.conf.json '$expected_version'"
  fi
else
  bad "missing Contents/Info.plist"
fi

if codesign --verify --deep --strict "$APP" >/dev/null 2>&1; then
  ok "codesign --verify --deep --strict"
else
  bad "bundle signature is not valid/sealed"
fi

if codesign -dv "$APP" 2>&1 | grep -q 'Signature=adhoc'; then
  ok "ad-hoc signature present"
fi

echo
if (( failures > 0 )); then
  echo "verify: $failures check(s) failed" >&2
  exit 1
fi
echo "verify: all checks passed"
