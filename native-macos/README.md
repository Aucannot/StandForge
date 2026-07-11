# StandForge Native macOS

This is the macOS-only SwiftUI implementation of the StandForge floating timer.
It lives next to the Tauri app so the project can keep two frontends:

- `../src` + `../src-tauri`: Tauri/React version with CSS glass fallback.
- `native-macos`: SwiftUI/AppKit version using the system Liquid Glass APIs on macOS 26+.

## Run

```bash
swift run --package-path native-macos StandForgeMac
```

## Build a `.app`

```bash
native-macos/scripts/build-app.sh
```

The app bundle is written to:

```text
native-macos/.build/app/StandForge Native.app
```

Local builds use an ad-hoc signature. For a distributable Developer ID build,
provide a signing identity and an optional notarytool keychain profile:

```bash
CODESIGN_IDENTITY="Developer ID Application: Example Corp (TEAMID)" \
NOTARY_PROFILE="standforge-notary" \
native-macos/scripts/build-app.sh
```

## Liquid Glass behavior

The SwiftUI version uses `GlassEffectContainer`, `glassEffect(_:in:)`, and the
native `.glass` / `.glassProminent` button styles when built with the macOS 26
SDK and run on macOS 26 or newer. On older macOS versions it falls back to
`ultraThinMaterial` so the code still builds and runs.
