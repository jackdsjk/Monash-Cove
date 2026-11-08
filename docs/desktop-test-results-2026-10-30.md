# Cove Desktop Test Results — 2026-10-30

## Automated checks

| Check | Result |
|---|---|
| local-service tests | 32 passed |
| webapp `npm run check` | passed |
| webapp Playwright smoke | passed |
| desktop Electron smoke | passed |
| packaged backend health/static | passed |

Desktop smoke launches Electron in development, starts the bundled local-service path, verifies the local URL and Cove UI, then completes the setup flow via “先使用匿名样例” and confirms `/api/health` from the renderer.

The macOS quick launcher was also launched locally. It starts the bundled Node 26 runtime and local-service, serves `/api/health`, and reports OAuth configured from the bundled local `.env.local`.

## Manual user test

Not performed in this session. The available Mac cannot launch the unsigned packaged app because macOS 26 AMFI rejects the ad-hoc signature. A Windows machine was not available.

## Required before real user test

- macOS: Developer ID signing + notarization, then install the DMG on a clean Mac.
- Windows: run the x64 ZIP on a clean Windows machine and record SmartScreen behavior.
- Gmail: configure a Google OAuth client for the test install.
- Run the checklist in `docs/desktop-user-test.md`.

## What is not claimed

- The macOS DMG is not verified as launchable on a stranger Mac.
- The Windows ZIP is not verified as launchable on Windows.
- No external user has completed onboarding.
