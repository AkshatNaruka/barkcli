#!/usr/bin/env bash
# Tauri expects external binaries named <name>-<target-triple>.
# Copy the freshly built barkcli next to the desktop crate before bundling.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TRIPLE="$(rustc -vV | sed -n 's/^host: //p')"
PROFILE="${1:-debug}"

BIN="$ROOT/target/$PROFILE/barkcli"
OUT="$ROOT/desktop/binaries/barkcli-$TRIPLE"

if [[ ! -f "$BIN" ]]; then
  echo "missing $BIN — run: cargo build -p barkcli" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUT")"
cp "$BIN" "$OUT"
chmod +x "$OUT"
echo "sidecar: $OUT"
