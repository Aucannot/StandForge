#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$PROJECT_DIR/.build"
APP_DIR="$BUILD_DIR/app/StandForge Native.app"
EXECUTABLE="$BUILD_DIR/release/StandForgeMac"

swift build --package-path "$PROJECT_DIR" -c release

rm -rf "$APP_DIR"
mkdir -p "$APP_DIR/Contents/MacOS"

cp "$EXECUTABLE" "$APP_DIR/Contents/MacOS/StandForgeMac"
chmod +x "$APP_DIR/Contents/MacOS/StandForgeMac"

cat > "$APP_DIR/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>StandForgeMac</string>
  <key>CFBundleIdentifier</key>
  <string>com.standforge.native</string>
  <key>CFBundleName</key>
  <string>StandForge Native</string>
  <key>CFBundleDisplayName</key>
  <string>StandForge Native</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>0.1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>15.0</string>
  <key>LSUIElement</key>
  <true/>
</dict>
</plist>
PLIST

echo "$APP_DIR"
