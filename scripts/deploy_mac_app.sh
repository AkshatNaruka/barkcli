#!/usr/bin/env bash
set -euo pipefail

# Build and package barkcli native desktop client on macOS
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$REPO_ROOT/build"
APP_NAME="Barkcli.app"
APP_BUNDLE="$BUILD_DIR/$APP_NAME"
IOS_DIR="$REPO_ROOT/barkcli-ios"

echo "Building barkcli native client..."
swift build --package-path "$IOS_DIR" --product BarkcliApp

echo "Packaging application bundle..."
mkdir -p "$APP_BUNDLE/Contents/MacOS"
mkdir -p "$APP_BUNDLE/Contents/Resources"

cp "$IOS_DIR/.build/arm64-apple-macosx/debug/BarkcliApp" "$APP_BUNDLE/Contents/MacOS/BarkcliApp"
chmod +x "$APP_BUNDLE/Contents/MacOS/BarkcliApp"

cat << 'EOF' > "$APP_BUNDLE/Contents/Info.plist"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>BarkcliApp</string>
    <key>CFBundleIdentifier</key>
    <string>com.barkcli.desktop</string>
    <key>CFBundleName</key>
    <string>barkcli</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>LSMinimumSystemVersion</key>
    <string>14.0</string>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
EOF

echo "Applying code signature..."
codesign --force --deep --sign - "$APP_BUNDLE"

echo "Checking barkcli daemon..."
if [ -f "$REPO_ROOT/target/debug/barkcli" ]; then
    SERVER_STATUS=$("$REPO_ROOT/target/debug/barkcli" serve --status 2>&1 || true)
    echo "$SERVER_STATUS"
fi

echo "Launching $APP_NAME..."
open "$APP_BUNDLE"
echo "Launched successfully."
