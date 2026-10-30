# Cove Desktop Build — 2026-10-30

## Artifacts

| Target | File | Size | SHA-256 |
|---|---|---:|---|
| macOS Apple Silicon | `desktop/release/Cove-0.1.0-arm64.dmg` | ~125 MB | `3a1f...` |
| macOS Intel | `desktop/release/Cove-0.1.0-x64.zip` | ~127 MB | `a8f8...` |
| Windows x64 | `desktop/release/Cove-0.1.0-win-x64.zip` | ~158 MB | `945c...` |

Full hashes:

```text
3a1f723c670ca624a0774ab33741d4e1db8dd915c5092342f3bf7f63edb392f0  desktop/release/Cove-0.1.0-arm64.dmg
a8f86ed2632264f15c760c5b7949bd601081e116e817b092b4b6859975ef79dd  desktop/release/Cove-0.1.0-x64.zip
945c97701766af554a450cbfd3604126efa3926fafd834ee8ff264a9247b9ad7  desktop/release/Cove-0.1.0-win-x64.zip
```

## Verification

- Desktop development shell launched with Electron 45.1.0 (Node 24.22.1):
  - local service health OK;
  - static webapp loaded;
  - `/api/setup/status`, `/api/brief`, `/api/sources` returned 200.
- `desktop/e2e/desktop-smoke.mjs` passed.
- Packaged backend from `Cove.app/Contents/Resources/local-service` started and served `/api/health` and `/` under Electron's Node.
- Webapp: `npm run check` and Playwright E2E passed.
- Service: 32 tests passed.

## Blocking findings

### macOS

The local machine has **no valid code signing identity**:

```text
security find-identity -v -p codesigning
0 valid identities found
```

The generated app is unsigned/ad-hoc. On macOS 26.5.2, AMFI rejects it before Electron starts:

```text
AMFI: ... is adhoc signed.
amfid: ... The file is adhoc signed or signed by an unknown certificate chain
```

The DMG is built, but it is **not runnable on this Mac** until signed with a trusted Developer ID certificate and notarized.

### Windows

The x64 ZIP was built on macOS. It was **not executed on a Windows machine** in this session. First launch will show SmartScreen because the executable is unsigned.

## Next required actions

1. Obtain Apple Developer ID Application certificate.
2. Sign and notarize macOS app; rebuild DMG.
3. Test on a real Windows x64 machine.
4. Add a desktop OAuth configuration path for Google client credentials.
5. Run the user test checklist in `docs/desktop-user-test.md`.
