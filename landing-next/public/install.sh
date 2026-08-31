#!/bin/sh
set -e

# barkcli — Install script
# Usage: curl -fsSL https://barkcli.vercel.app/install.sh | sh
#        curl -fsSL https://github.com/AkshatNaruka/barkcli/releases/latest/download/install.sh | sh
# Env vars:
#   BARKCLI_VERSION=v0.2.0   # pin to a specific version (default: latest)
#   BARKCLI_INSTALL_DIR=~/.local/bin
#   GITHUB_REPO=AkshatNaruka/barkcli

REPO="${GITHUB_REPO:-AkshatNaruka/barkcli}"
INSTALL_DIR="${BARKCLI_INSTALL_DIR:-${HOME}/.local/bin}"
VERSION="${BARKCLI_VERSION:-}"

# Allow BARKCLI_VERSION without leading 'v'
if [ -n "$VERSION" ] && [ "${VERSION#v}" = "$VERSION" ]; then
  VERSION="v$VERSION"
fi

# Detect OS and arch
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin)  OS_TARGET="apple-darwin" ;;
  Linux)   OS_TARGET="unknown-linux-gnu" ;;
  MINGW*|MSYS*|CYGWIN*)
    echo "Windows detected. Use PowerShell instead:" >&2
    echo "  irm https://barkcli.vercel.app/install.ps1 | iex" >&2
    echo "Or download .zip from https://github.com/${REPO}/releases" >&2
    exit 1
    ;;
  *)       echo "Unsupported OS: $OS. For Windows, use install.ps1" >&2; exit 1 ;;
esac

case "$ARCH" in
  x86_64|amd64) ARCH_TARGET="x86_64" ;;
  aarch64|arm64|arm64e) ARCH_TARGET="aarch64" ;;
  *)       echo "Unsupported arch: $ARCH." >&2; exit 1 ;;
esac

TARGET="${ARCH_TARGET}-${OS_TARGET}"
ARCHIVE="barkcli-${TARGET}.tar.gz"

# Build URL list: GitHub primary, Vercel mirror
if [ -n "$VERSION" ]; then
  GITHUB_URL="https://github.com/${REPO}/releases/download/${VERSION}/${ARCHIVE}"
  VERCEL_URL="https://barkcli.vercel.app/downloads/${ARCHIVE}"
else
  GITHUB_URL="https://github.com/${REPO}/releases/latest/download/${ARCHIVE}"
  VERCEL_URL="https://barkcli.vercel.app/downloads/${ARCHIVE}"
fi

# Check for required tools
for cmd in curl tar; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Missing $cmd. Install it first." >&2; exit 1; }
done

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

echo "Detected: ${TARGET} (OS=${OS} ARCH=${ARCH})"
if [ -n "$VERSION" ]; then
  echo "Version: ${VERSION}"
else
  echo "Version: latest"
fi
echo "Downloading barkcli for ${TARGET}..."

# Try GitHub first, fallback to Vercel
download() {
  _url="$1"
  _out="$2"
  echo "  → $_url"
  if curl -fsSL --retry 2 --retry-delay 1 "$_url" -o "$_out"; then
    return 0
  fi
  return 1
}

if ! download "$GITHUB_URL" "$TMPDIR/barkcli.tar.gz"; then
  echo "GitHub download failed, trying Vercel mirror..."
  if ! download "$VERCEL_URL" "$TMPDIR/barkcli.tar.gz"; then
    echo "" >&2
    echo "No pre-built binary available for ${TARGET}." >&2
    echo "Tried:" >&2
    echo "  $GITHUB_URL" >&2
    echo "  $VERCEL_URL" >&2
    echo "" >&2
    echo "Alternatives:" >&2
    echo "  cargo install barkcli" >&2
    echo "  brew install AkshatNaruka/barkcli/barkcli" >&2
    echo "  https://github.com/${REPO}/releases" >&2
    exit 1
  fi
fi

# Optional SHA256 verification (if SHA256SUMS available)
verify_checksum() {
  _archive="$1"
  _tmp="$2"
  _sha_url=""
  if [ -n "$VERSION" ]; then
    _sha_url="https://github.com/${REPO}/releases/download/${VERSION}/SHA256SUMS"
  else
    _sha_url="https://github.com/${REPO}/releases/latest/download/SHA256SUMS"
  fi
  if curl -fsSL "$_sha_url" -o "$_tmp/SHA256SUMS" 2>/dev/null; then
    if command -v shasum >/dev/null 2>&1; then
      (cd "$_tmp" && shasum -a 256 -c SHA256SUMS --ignore-missing 2>/dev/null) && echo "Checksum verified." || echo "Checksum warning: could not verify (non-fatal)"
    elif command -v sha256sum >/dev/null 2>&1; then
      (cd "$_tmp" && sha256sum -c SHA256SUMS --ignore-missing 2>/dev/null) && echo "Checksum verified." || echo "Checksum warning: could not verify (non-fatal)"
    fi
  fi
}

# Verify if possible (non-fatal on failure)
verify_checksum "$TMPDIR/barkcli.tar.gz" "$TMPDIR" || true

# Extract
if ! tar -xzf "$TMPDIR/barkcli.tar.gz" -C "$TMPDIR" 2>/dev/null; then
  echo "Extraction failed. File may be corrupted." >&2
  exit 1
fi

# Find binary (handles both tar containing barkcli at root or nested)
BIN_SRC=""
if [ -f "$TMPDIR/barkcli" ]; then
  BIN_SRC="$TMPDIR/barkcli"
else
  BIN_SRC="$(find "$TMPDIR" -name "barkcli" -type f | head -1)"
fi

if [ -z "$BIN_SRC" ] || [ ! -f "$BIN_SRC" ]; then
  echo "barkcli binary not found in archive." >&2
  exit 1
fi

mkdir -p "$INSTALL_DIR"
cp "$BIN_SRC" "$INSTALL_DIR/barkcli"
chmod +x "$INSTALL_DIR/barkcli"

echo "barkcli installed to $INSTALL_DIR/barkcli"

# Check if install dir is on PATH
case ":$PATH:" in
  *:"$INSTALL_DIR":*) ;;
  *)
    echo ""
    echo "Note: $INSTALL_DIR is not on your PATH."
    echo "Add this to your shell config (~/.zshrc or ~/.bashrc):"
    echo "  export PATH=\"$INSTALL_DIR:\$PATH\""
    echo ""
    echo "Or run directly: $INSTALL_DIR/barkcli --version"
    ;;
esac

if "$INSTALL_DIR/barkcli" --version 2>/dev/null; then
  echo ""
  echo "Done. Run 'barkcli init' in any project to get started."
  echo ""
  echo "For VS Code users: run 'barkcli vscode-install' to install the kanban editor."
else
  echo "Install completed but binary check failed." >&2
  exit 1
fi
