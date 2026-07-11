# StandForge

StandForge is a small macOS/Tauri app that runs a background sitting timer and pops up a reminder when you have used the screen for too long.

## Features

- Configurable screen-use and standing durations
- Background timer that keeps running after the settings window is closed
- Always-on-top reminder popup when it is time to stand
- Pause, resume, stop, snooze, and manual phase switching
- Local persistence for cycle settings, active timers, and completed stand sessions
- Today view with completed sessions, standing time, snooze count, and completion rate

## Development

This repository now has two app implementations:

- **Tauri/React**: the current cross-platform shell with CSS glass styling and SQLite storage.
- **Native macOS**: a SwiftUI/AppKit floating window that uses system Liquid Glass on macOS 26+ and stores its state in `UserDefaults`.

```bash
npm install
npm run dev
```

Run the macOS desktop app with:

```bash
npm run tauri dev
```

The settings window can be closed; StandForge hides it and keeps the reminder timer alive in the app process.

Build the web assets with:

```bash
npm run build
```

Run the native macOS Liquid Glass version with:

```bash
npm run mac:native:run
```

Build the native macOS `.app` bundle with:

```bash
npm run mac:native:build
```

The native app bundle is written to `native-macos/.build/app/StandForge Native.app`.

Run the backend and native unit tests with:

```bash
cargo test --locked --manifest-path src-tauri/Cargo.toml
swift test --package-path native-macos
```
