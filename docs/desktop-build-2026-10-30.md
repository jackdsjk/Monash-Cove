# Cove Desktop Build — 2026-10-30

## Artifacts

| Target | File | Size | SHA-256 |
|---|---|---:|---|
| macOS Apple Silicon | `desktop/release/Cove-0.1.0-arm64.dmg` | ~125 MB | `24cc32...` |
| macOS Intel | `desktop/release/Cove-0.1.0-x64.zip` | ~127 MB | `e1d8d2...` |
| Windows x64 | `desktop/release/Cove-0.1.0-win-x64.zip` | ~158 MB | `e43897...` |

Full hashes:

```text
24cc32209fa2324f0b48a75dff73f907a28c39d01b99723ebf0379d68257dd8e  desktop/release/Cove-0.1.0-arm64.dmg
e1d8d2cf8462f81926e0b3a5623b855e9253f8427cd65a8f4d8e3b8b0706172d  desktop/release/Cove-0.1.0-x64.zip
e438972f96dd38982e3f4b516b6fa4c67a607b00318712b020080322070b3b27  desktop/release/Cove-0.1.0-win-x64.zip
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
