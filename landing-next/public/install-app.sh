#!/usr/bin/env bash
# Bark — macOS app installer
#
# Usage:
#   curl -fsSL https://github.com/AkshatNaruka/barkcli/releases/latest/download/install-app.sh | sh
#
# Installs Bark.app into /Applications and removes the Gatekeeper quarantine
# flag from the ad-hoc signed build. Set BARKCLI_VERSION=vX.Y.Z to pin.

set -euo pipefail

REPO="${GITHUB_REPO:-AkshatNaruka/barkcli}"
APP_NAME="Bark"
INSTALL_DIR="/Applications"
VERSION="${BARKCLI_VERSION:-}"

if [ "$(uname -s)" != "Darwin" ]; then
  echo "This installer is for macOS only." >&2
  exit 1
fi

ARCH="$(uname -m)"
case "$ARCH" in
  arm64|aarch64) ASSET_ARCH="arm64" ;;
  x86_64|amd64)  ASSET_ARCH="x64" ;;
  *) echo "Unsupported architecture: $ARCH" >&2; exit 1 ;;
esac

if [ -n "$VERSION" ] && [ "${VERSION#v}" = "$VERSION" ]; then
  VERSION="v$VERSION"
fi

if [ -n "$VERSION" ]; then
  URL="https://github.com/${REPO}/releases/download/${VERSION}/Bark-macos-${ASSET_ARCH}.zip"
else
  URL="https://github.com/${REPO}/releases/latest/download/Bark-macos-${ASSET_ARCH}.zip"
fi

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

echo "Downloading Bark for macOS (${ASSET_ARCH})..."
echo "  → $URL"
if ! curl -fsSL --retry 2 --retry-delay 1 "$URL" -o "$TMPDIR/Bark.zip"; then
  echo "Download failed. Check the release exists at:" >&2
  echo "  https://github.com/${REPO}/releases" >&2
  exit 1
fi

echo "Unpacking…"
unzip -q "$TMPDIR/Bark.zip" -d "$TMPDIR"

if [ ! -d "$TMPDIR/Bark.app" ]; then
  echo "Archive did not contain Bark.app" >&2
  exit 1
fi

if [ -d "${INSTALL_DIR}/${APP_NAME}.app" ]; then
  echo "Replacing existing ${APP_NAME}.app…"
  rm -rf "${INSTALL_DIR}/${APP_NAME}.app"
fi

mv "$TMPDIR/Bark.app" "${INSTALL_DIR}/${APP_NAME}.app"

# Ad-hoc signed builds carry a quarantine flag that Gatekeeper refuses. The
# install script is the supported way past it; manual downloads still need
# `xattr -dr com.apple.quarantine /Applications/Bark.app`.
xattr -dr com.apple.quarantine "${INSTALL_DIR}/${APP_NAME}.app" 2>/dev/null || true

echo ""
echo "Bark installed to ${INSTALL_DIR}/${APP_NAME}.app"
echo "Open it with:  open -a Bark"
open "${INSTALL_DIR}/${APP_NAME}.app" 2>/dev/null || true
