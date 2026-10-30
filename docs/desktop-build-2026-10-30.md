# Cove Desktop Build — 2026-10-30

## Artifacts

| Target | File | Size | SHA-256 |
|---|---|---:|---|
| macOS Apple Silicon | `desktop/release/Cove-0.1.0-arm64.dmg` | ~125 MB | `5845f6...` |
| macOS Intel | `desktop/release/Cove-0.1.0-x64.zip` | ~127 MB | `fd1db3...` |
| Windows x64 | `desktop/release/Cove-0.1.0-win-x64.zip` | ~158 MB | `802081...` |

Full hashes:

```text
5845f632c447a7e50f27919e7473354ff4f696b476e47ee1792b37b954ff1e8d  desktop/release/Cove-0.1.0-arm64.dmg
fd1db3d72d464e76534352f8673cd05067a74c15e6800933712811b53152ce56  desktop/release/Cove-0.1.0-x64.zip
80208175f4eda10ecd9a5924c02ca0f6ab5012f95421be21d53fbfcc813ddc6b  desktop/release/Cove-0.1.0-win-x64.zip
```

## Verification

- Desktop development shell launched with Electron 45.1.0 (Node 24.22.1):
  - local service health OK;
  - static webapp loaded;
  - `/api/setup/status`, `/api/brief`, `/api/sources` returned 200.
- `desktop/e2e/desktop-smoke.mjs` passed.
- Packaged backend from `Cove.app/Contents/Resources/local-service` started and served `/api/health` and `/` under Electron's Node.
- Webapp: `npm run check` and Playwright E2E passed.
- Service: 33 tests passed.

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
