#!/bin/sh
set -e

# barkcli — Install script
# Usage: curl -fsSL https://raw.githubusercontent.com/anomalyco/barkcli/main/install.sh | sh

REPO="anomalyco/barkcli"
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
    *)       echo "Unsupported OS: $OS. Try installing via cargo: cargo install barkcli" >&2; exit 1 ;;
esac

case "$ARCH" in
    x86_64|amd64) ARCH_TARGET="x86_64" ;;
    aarch64|arm64) ARCH_TARGET="aarch64" ;;
    *)       echo "Unsupported arch: $ARCH. Try installing via cargo: cargo install barkcli" >&2; exit 1 ;;
esac

TARGET="${ARCH_TARGET}-${OS_TARGET}"

# Check for required tools
for cmd in curl tar; do
    command -v "$cmd" >/dev/null 2>&1 || { echo "Missing $cmd. Install it first." >&2; exit 1; }
done

# Try cargo install first (gets the latest version from source)
if command -v cargo >/dev/null 2>&1; then
    echo "Installing barkcli via cargo (Rust toolchain detected)..."
    cargo install --git "https://github.com/${REPO}.git" barkcli
    echo "barkcli installed to $(command -v barkcli || echo "$HOME/.cargo/bin/barkcli")"
    barkcli --version
    exit 0
fi

# Otherwise, download pre-built binary from releases
echo "No Rust toolchain found. Downloading pre-built binary..."
echo "Detected: $TARGET"

LATEST_URL="https://github.com/${REPO}/releases/latest/download/barkcli-${TARGET}.tar.gz"

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

echo "Downloading from $LATEST_URL..."
if ! curl -fsSL "$LATEST_URL" -o "$TMPDIR/barkcli.tar.gz"; then
    # Fallback: try building from source
    echo "No pre-built binary available for $TARGET."
    echo "Install Rust (https://rustup.rs) then run: cargo install barkcli"
    exit 1
fi

tar -xzf "$TMPDIR/barkcli.tar.gz" -C "$TMPDIR"

# Find the barkcli binary in extracted files
find "$TMPDIR" -type f -name "barkcli" -perm +111 2>/dev/null | head -1 > /dev/null

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
