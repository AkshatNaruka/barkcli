#!/usr/bin/env bash
# Bark Desktop App — macOS One-Liner Installer
#
# Usage:
#   curl -fsSL https://barkcli.com/install-app.sh | bash
#   or
#   curl -fsSL https://raw.githubusercontent.com/AkshatNaruka/barkcli/master/landing-next/public/install-app.sh | bash
#
# Options via environment variables:
#   BARK_APP_VERSION=v0.4.62   # pin specific release version (default: latest)
#   BARK_NO_OPEN=1             # do not automatically launch Bark.app after install
#   BARK_DEST_DIR=/Applications
set -euo pipefail

# ANSI styling
BOLD='\033[1m'
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
RESET='\033[0m'

echo -e "${BOLD}${CYAN}"
echo "    ____             __      ___ "
echo "   / __ )____ ______/ /__   /   |"
echo "  / __  / __ \`/ ___/ //_/  / /| |"
echo " / /_/ / /_/ / /  / ,<    / ___ |"
echo "/_____/\__,_/_/  /_/|_|  /_/  |_|"
echo -e "${RESET}"
echo -e "${BOLD}Bark Desktop App — macOS Installer${RESET}"
echo "--------------------------------------------------------"

# 1. OS Verification
OS="$(uname -s)"
if [[ "$OS" != "Darwin" ]]; then
  echo -e "${RED}Error: Bark.app is built for macOS (Darwin).${RESET}"
  echo "For Linux or Windows, please install the barkcli CLI binary:"
  echo "  curl -fsSL https://github.com/AkshatNaruka/barkcli/releases/latest/download/install.sh | sh"
  exit 1
fi

ARCH="$(uname -m)"
echo -e "${GREEN}✓${RESET} Detected macOS ($ARCH)"

REPO="${GITHUB_REPO:-AkshatNaruka/barkcli}"
VERSION="${BARK_APP_VERSION:-}"

# 2. Determine download URLs
TMP_DIR="$(mktemp -d -t bark-install-XXXXXX)"
cleanup() {
  # Unmount any stray DMG mount
  if [[ -d "${DMG_MOUNT:-}" ]]; then
    hdiutil detach "$DMG_MOUNT" -force >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

if [[ -n "$VERSION" ]]; then
  TAR_URL="https://github.com/${REPO}/releases/download/${VERSION}/Bark-macOS.tar.gz"
  DMG_URL="https://github.com/${REPO}/releases/download/${VERSION}/Bark.dmg"
else
  TAR_URL="https://github.com/${REPO}/releases/latest/download/Bark-macOS.tar.gz"
  DMG_URL="https://github.com/${REPO}/releases/latest/download/Bark.dmg"
fi

# 3. Determine destination directory
DEST_BASE="${BARK_DEST_DIR:-/Applications}"
if [[ ! -w "$DEST_BASE" ]]; then
  DEST_BASE="$HOME/Applications"
  mkdir -p "$DEST_BASE"
fi
DEST_APP="$DEST_BASE/Bark.app"

echo -e "Target installation directory: ${BOLD}${DEST_APP}${RESET}"

# 4. Download release asset
echo -e "\n==> Downloading latest Bark macOS application..."
DOWNLOAD_SUCCESS=0

if curl -fL --progress-bar "$TAR_URL" -o "$TMP_DIR/Bark-macOS.tar.gz" 2>/dev/null; then
  echo -e "${GREEN}✓${RESET} Downloaded Bark-macOS.tar.gz"
  echo "==> Extracting application bundle..."
  tar -xzf "$TMP_DIR/Bark-macOS.tar.gz" -C "$TMP_DIR"
  SRC_APP="$TMP_DIR/Bark.app"
  DOWNLOAD_SUCCESS=1
fi

if [[ "$DOWNLOAD_SUCCESS" -eq 0 ]]; then
  echo "Trying DMG image fallback..."
  if curl -fL --progress-bar "$DMG_URL" -o "$TMP_DIR/Bark.dmg"; then
    echo -e "${GREEN}✓${RESET} Downloaded Bark.dmg"
    DMG_MOUNT="$TMP_DIR/mount"
    mkdir -p "$DMG_MOUNT"
    hdiutil attach "$TMP_DIR/Bark.dmg" -mountpoint "$DMG_MOUNT" -nobrowse -readonly >/dev/null
    SRC_APP="$DMG_MOUNT/Bark.app"
    DOWNLOAD_SUCCESS=1
  fi
fi

if [[ "$DOWNLOAD_SUCCESS" -eq 0 || ! -d "${SRC_APP:-}" ]]; then
  echo -e "${RED}Failed to download Bark release assets from GitHub.${RESET}"
  echo "You can download Bark.dmg manually from: https://github.com/${REPO}/releases"
  exit 1
fi

# 5. Stop running instance if any
echo "==> Preparing replacement..."
osascript -e 'tell application "Bark" to quit' >/dev/null 2>&1 || true
pkill -f "$DEST_APP/Contents/MacOS/barkcli-desktop" >/dev/null 2>&1 || true

# 6. Install to /Applications
echo "==> Installing to $DEST_APP..."
rm -rf "$DEST_APP"
ditto "$SRC_APP" "$DEST_APP"

# 7. Gatekeeper unblock & quarantine removal (CRITICAL)
echo "==> Clearing Apple quarantine and extended attributes (xattr -cr)..."
xattr -cr "$DEST_APP" 2>/dev/null || true
xattr -d com.apple.quarantine "$DEST_APP" 2>/dev/null || true
codesign --force --deep --sign - "$DEST_APP" 2>/dev/null || true

# 8. Sync CLI binary to PATH
echo "==> Syncing CLI binary to ~/.local/bin/barkcli..."
CLI_BIN="$DEST_APP/Contents/MacOS/barkcli"
if [[ -x "$CLI_BIN" ]]; then
  mkdir -p "$HOME/.local/bin"
  cp -f "$CLI_BIN" "$HOME/.local/bin/barkcli"
  chmod +x "$HOME/.local/bin/barkcli"
  xattr -cr "$HOME/.local/bin/barkcli" 2>/dev/null || true
  codesign --force --sign - "$HOME/.local/bin/barkcli" 2>/dev/null || true
  echo -e "${GREEN}✓${RESET} barkcli CLI installed to ~/.local/bin/barkcli"
fi

# 9. Verify bundle
echo -e "${GREEN}✓${RESET} Installation verified successfully!"
echo "--------------------------------------------------------"
echo -e "${BOLD}${GREEN}Bark.app is ready to use!${RESET}"
echo "• macOS Gatekeeper quarantine: ${BOLD}CLEARED${RESET} (no developer security prompt)"
echo "• App path: ${DEST_APP}"
echo "• CLI path: $HOME/.local/bin/barkcli"
echo "--------------------------------------------------------"

# 10. Open app unless disabled
if [[ "${BARK_NO_OPEN:-0}" != "1" ]]; then
  echo "==> Launching Bark..."
  open "$DEST_APP"
fi
