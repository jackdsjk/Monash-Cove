# Cove Desktop Build — 2026-10-30

## Artifacts

| Target | File | Size | SHA-256 |
|---|---|---:|---|
| macOS Apple Silicon | `desktop/release/Cove-0.1.0-arm64.dmg` | ~125 MB | `bf6ce2...` |
| macOS Intel | `desktop/release/Cove-0.1.0-x64.zip` | ~127 MB | `ab36ae...` |
| Windows x64 | `desktop/release/Cove-0.1.0-win-x64.zip` | ~158 MB | `03378e...` |
| macOS 快速启动器 | `desktop/release/CoveLauncher-0.1.0-arm64.dmg` / `.zip` | ~82 / ~61 MB | `见下方 Full hashes` |

Full hashes:

```text
bf6ce2eb21783749bf0ab8718ad1da67f2dbeade50f90bd7f3f15ad1cb9f5294  desktop/release/Cove-0.1.0-arm64.dmg
ab36ae6bc5bbb2f281760807a197fc25c153104e4c5ca31030c8e9c47ce3b09f  desktop/release/Cove-0.1.0-x64.zip
03378ea4d02f2bfa689e422a34e79d3c8a23ee5a7d60d61e84d58af9f85b8b9d  desktop/release/Cove-0.1.0-win-x64.zip
19a225e943ebb33c5a9b32a84b1105995e63e2d42a972369ec3eb86fb3d1019e  desktop/release/CoveLauncher-0.1.0-arm64.dmg
de4a286f99f7d0507b34cc6ae8b2f7011ec9f8e7dc7cebad97106c38123a44f5  desktop/release/CoveLauncher-0.1.0-arm64.zip
```

## Quick launcher

`desktop/release/CoveLauncher-0.1.0-arm64.dmg` / `.zip` is a non-Electron AppleScript launcher. It bundles the standalone Node 26 runtime, the production local-service, the webapp, and the local OAuth configuration. It launched successfully on the test Mac and served `/api/health` with OAuth configured.

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
