# StandForge Native macOS

This is the macOS-only SwiftUI implementation of the StandForge floating timer.
It lives next to the Tauri app so the project can keep two frontends:

- `../src` + `../src-tauri`: Tauri/React version with CSS glass fallback.
- `native-macos`: SwiftUI/AppKit version using the system Liquid Glass APIs on macOS 26+.

## Run

```bash
swift run --package-path native-macos StandForgeMac
```

## Build a `.app` and `.dmg`

```bash
native-macos/scripts/build-app.sh
```

The script writes a signed app bundle and a disk image to:

```text
native-macos/.build/app/StandForge Native.app
native-macos/.build/dmg/StandForge-Native-0.1.1-arm64.dmg
```

By default the app is signed with an ad hoc signature so local builds can be
verified with `codesign --verify`. Ad hoc signatures are not accepted by
Gatekeeper for downloaded GitHub release assets.

For a public GitHub release, build with a Developer ID Application certificate
and notarize the DMG:

```bash
RELEASE=1 \
CODESIGN_IDENTITY="Developer ID Application: Example Name (TEAMID)" \
NOTARIZE=1 \
NOTARY_KEYCHAIN_PROFILE="standforge-notary" \
native-macos/scripts/build-app.sh
```

Alternatively, omit `NOTARY_KEYCHAIN_PROFILE` and provide `APPLE_ID`,
`APPLE_TEAM_ID`, and `APPLE_APP_SPECIFIC_PASSWORD`.

## Liquid Glass behavior

The SwiftUI version uses `GlassEffectContainer`, `glassEffect(_:in:)`, and the
native `.glass` / `.glassProminent` button styles when built with the macOS 26
SDK and run on macOS 26 or newer. On older macOS versions it falls back to
`ultraThinMaterial` so the code still builds and runs.
