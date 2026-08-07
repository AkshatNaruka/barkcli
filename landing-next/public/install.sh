#!/bin/sh
set -e

# barkcli — Install script
# Usage: curl -fsSL https://barkcli.vercel.app/install.sh | sh

BASE_URL="https://barkcli.vercel.app/downloads"
BIN_NAME="barkcli"
INSTALL_DIR="${HOME}/.local/bin"

# Allow custom install dir
if [ -n "$BARKCLI_INSTALL_DIR" ]; then
    INSTALL_DIR="$BARKCLI_INSTALL_DIR"
fi

# Detect OS and arch
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
    Darwin)  OS_TARGET="apple-darwin" ;;
    Linux)   OS_TARGET="unknown-linux-gnu" ;;
    *)       echo "Unsupported OS: $OS." >&2; exit 1 ;;
esac

case "$ARCH" in
    x86_64|amd64) ARCH_TARGET="x86_64" ;;
    aarch64|arm64) ARCH_TARGET="aarch64" ;;
    *)       echo "Unsupported arch: $ARCH." >&2; exit 1 ;;
esac

TARGET="${ARCH_TARGET}-${OS_TARGET}"

# Check for required tools
for cmd in curl tar; do
    command -v "$cmd" >/dev/null 2>&1 || { echo "Missing $cmd. Install it first." >&2; exit 1; }
done

echo "Downloading barkcli for $TARGET..."
URL="${BASE_URL}/barkcli-${TARGET}.tar.gz"

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

if ! curl -fsSL "$URL" -o "$TMPDIR/barkcli.tar.gz"; then
    echo "No pre-built binary available for $TARGET." >&2
    exit 1
fi

tar -xzf "$TMPDIR/barkcli.tar.gz" -C "$TMPDIR" barkcli

mkdir -p "$INSTALL_DIR"
cp "$TMPDIR/barkcli" "$INSTALL_DIR/barkcli"
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
        ;;
esac

"$INSTALL_DIR/barkcli" --version
echo "Done. Run 'barkcli init' in any project to get started."
