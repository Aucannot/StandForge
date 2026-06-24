# StandForge

StandForge is a small macOS/Tauri app that runs a background sitting timer and pops up a reminder when you have used the screen for too long.

## Features

- Configurable screen-use and standing durations
- Background timer that keeps running after the settings window is closed
- Always-on-top reminder popup when it is time to stand
- Pause, resume, stop, snooze, and manual phase switching
- Local SQLite storage for cycle settings and completed stand sessions
- Today view with completed sessions, standing time, snooze count, and completion rate

## Development

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
