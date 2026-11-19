#!/usr/bin/env bash
# package-dmg.sh
# Packages Bark.app into a compressed macOS DMG with /Applications symlink,
# plus a tar.gz archive and SHA256 checksums ready for GitHub release.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

APP="$ROOT/desktop/target/release/bundle/macos/Bark.app"
OUT_DIR="$ROOT/desktop/target/release/bundle/dmg"
mkdir -p "$OUT_DIR"

if [[ ! -d "$APP" ]]; then
  echo "==> Building Bark.app first..."
  bash "$ROOT/desktop/scripts/build-macos-app.sh"
fi

echo "==> Stripping quarantine and extended attributes from Bark.app"
xattr -cr "$APP" 2>/dev/null || true

echo "==> Ad-hoc signing Bark.app"
codesign --force --deep --sign - "$APP"

echo "==> Verifying Bark.app bundle"
bash "$ROOT/desktop/scripts/verify-app.sh" "$APP"

echo "==> Preparing DMG staging environment"
STAGE_DIR="$(mktemp -d -t bark-dmg-staging-XXXXXX)"
cleanup() {
  rm -rf "$STAGE_DIR"
}
trap cleanup EXIT

cp -R "$APP" "$STAGE_DIR/Bark.app"
ln -s /Applications "$STAGE_DIR/Applications"

DMG_PATH="$OUT_DIR/Bark.dmg"
rm -f "$DMG_PATH"

echo "==> Creating compressed disk image: $DMG_PATH"
hdiutil create \
  -volname "Bark" \
  -srcfolder "$STAGE_DIR" \
  -ov \
  -format UDZO \
  "$DMG_PATH"

echo "==> Creating tar.gz app archive"
TAR_PATH="$OUT_DIR/Bark-macOS.tar.gz"
tar -czf "$TAR_PATH" -C "$ROOT/desktop/target/release/bundle/macos" Bark.app

echo "==> Packaging CLI binary"
ARCH="$(uname -m)"
CLI_BIN="$ROOT/target/release/barkcli"
if [[ -f "$CLI_BIN" ]]; then
  CLI_TAR="$OUT_DIR/barkcli-${ARCH}-apple-darwin.tar.gz"
  tar -czf "$CLI_TAR" -C "$ROOT/target/release" barkcli
fi

echo "==> Generating SHA256 checksums"
cd "$OUT_DIR"
shasum -a 256 Bark.dmg Bark-macOS.tar.gz > SHA256SUMS
if [[ -f "$OUT_DIR/barkcli-${ARCH}-apple-darwin.tar.gz" ]]; then
  shasum -a 256 "barkcli-${ARCH}-apple-darwin.tar.gz" >> SHA256SUMS
fi

echo "==> Package complete!"
ls -lh "$OUT_DIR"
cat "$OUT_DIR/SHA256SUMS"
