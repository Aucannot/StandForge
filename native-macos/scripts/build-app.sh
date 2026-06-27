#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_DIR="$(cd "$PROJECT_DIR/.." && pwd)"
BUILD_DIR="$PROJECT_DIR/.build"
APP_NAME="StandForge Native"
BUNDLE_ID="com.standforge.native"
VERSION="0.1.0"
APP_DIR="$BUILD_DIR/app/StandForge Native.app"
EXECUTABLE="$BUILD_DIR/release/StandForgeMac"
DMG_DIR="$BUILD_DIR/dmg"
DMG_STAGING_DIR="$BUILD_DIR/dmg-staging"
DMG_PATH="$DMG_DIR/StandForge-Native-$VERSION-arm64.dmg"
SIGN_IDENTITY="${CODESIGN_IDENTITY:--}"
RELEASE="${RELEASE:-0}"
NOTARIZE="${NOTARIZE:-0}"

if [[ "$RELEASE" == "1" && "$SIGN_IDENTITY" == "-" ]]; then
  echo "RELEASE=1 requires CODESIGN_IDENTITY to be a Developer ID Application certificate." >&2
  exit 1
fi

swift build --package-path "$PROJECT_DIR" -c release

rm -rf "$APP_DIR"
mkdir -p "$APP_DIR/Contents/MacOS" "$APP_DIR/Contents/Resources"

cp "$EXECUTABLE" "$APP_DIR/Contents/MacOS/StandForgeMac"
chmod +x "$APP_DIR/Contents/MacOS/StandForgeMac"

if [[ -f "$REPO_DIR/src-tauri/icons/icon.icns" ]]; then
  cp "$REPO_DIR/src-tauri/icons/icon.icns" "$APP_DIR/Contents/Resources/icon.icns"
fi

cat > "$APP_DIR/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>StandForgeMac</string>
  <key>CFBundleIdentifier</key>
  <string>$BUNDLE_ID</string>
  <key>CFBundleIconFile</key>
  <string>icon.icns</string>
  <key>CFBundleName</key>
  <string>$APP_NAME</string>
  <key>CFBundleDisplayName</key>
  <string>$APP_NAME</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>$VERSION</string>
  <key>CFBundleVersion</key>
  <string>$VERSION</string>
  <key>LSMinimumSystemVersion</key>
  <string>15.0</string>
  <key>LSUIElement</key>
  <true/>
</dict>
</plist>
PLIST

if [[ "$SIGN_IDENTITY" == "-" ]]; then
  codesign --force --deep --options runtime --timestamp=none --sign "$SIGN_IDENTITY" "$APP_DIR"
else
  codesign --force --deep --options runtime --timestamp --sign "$SIGN_IDENTITY" "$APP_DIR"
fi

codesign --verify --deep --strict --verbose=4 "$APP_DIR"

rm -rf "$DMG_STAGING_DIR" "$DMG_PATH"
mkdir -p "$DMG_STAGING_DIR" "$DMG_DIR"
cp -R "$APP_DIR" "$DMG_STAGING_DIR/$APP_NAME.app"
ln -s /Applications "$DMG_STAGING_DIR/Applications"
hdiutil create -volname "$APP_NAME" -srcfolder "$DMG_STAGING_DIR" -ov -format UDZO "$DMG_PATH"
hdiutil verify "$DMG_PATH"

if [[ "$RELEASE" == "1" ]]; then
  codesign --force --timestamp --sign "$SIGN_IDENTITY" "$DMG_PATH"
  codesign --verify --verbose=4 "$DMG_PATH"
fi

if [[ "$NOTARIZE" == "1" ]]; then
  if [[ -n "${NOTARY_KEYCHAIN_PROFILE:-}" ]]; then
    xcrun notarytool submit "$DMG_PATH" --keychain-profile "$NOTARY_KEYCHAIN_PROFILE" --wait
  else
    : "${APPLE_ID:?APPLE_ID is required when NOTARIZE=1 without NOTARY_KEYCHAIN_PROFILE}"
    : "${APPLE_TEAM_ID:?APPLE_TEAM_ID is required when NOTARIZE=1 without NOTARY_KEYCHAIN_PROFILE}"
    : "${APPLE_APP_SPECIFIC_PASSWORD:?APPLE_APP_SPECIFIC_PASSWORD is required when NOTARIZE=1 without NOTARY_KEYCHAIN_PROFILE}"
    xcrun notarytool submit "$DMG_PATH" \
      --apple-id "$APPLE_ID" \
      --team-id "$APPLE_TEAM_ID" \
      --password "$APPLE_APP_SPECIFIC_PASSWORD" \
      --wait
  fi
  xcrun stapler staple "$DMG_PATH"
  spctl -a -vvv -t open "$DMG_PATH"
fi

echo "$APP_DIR"
echo "$DMG_PATH"
