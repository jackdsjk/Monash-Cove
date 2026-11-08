# 发布分发与代码签名方案（参照 Muster）

> 状态：**方案草案，未实施**。本文只写判断、配置草案和验收标准，不改 `desktop/package.json`、不加 workflow、不改代码。
> 写作日期：2026-11-08。参照对象：[Poetrynan/Muster](https://github.com/Poetrynan/Muster) v0.5.0（Tauri 2）。

## 0. 一句话结论

Muster 解决的从来不是"怎么拿到证书"，而是三个别的问题：**不签名怎么发版、签名坏了怎么补、以及怎么用签名把更新包锁死**。这三件事我们现在都没做，而它们才是卡住分发的真原因。

可以直接抄的是它的**决策结构**：把"未签名"从默认失败改成明示策略 + 拉一条独立的更新包签名链 + 在 CI 里对产物做断言。**不能抄的是配置层**——它是 Tauri 2 的 `signingIdentity` / `TAURI_SIGNING_*`，我们是 electron-builder，等价物是 `mac.identity` / `CSC_LINK` / `mac.notarize`。

顺带一个纠正：它证明我们 `desktop/README.md` 里那句"macOS 26 的 AMFI 会拒绝本地 ad-hoc 签名的 App"**是错的**。AMFI 拒绝的不是 ad-hoc，是**被我们自己的打包步骤破坏了 seal 的 ad-hoc 签名**。这个判断错误直接导致我们多做了一个 AppleScript launcher，第 2.1 节有证据。

## 1. 范围

本文覆盖：

- macOS 与 Windows 产物的**代码签名**（Developer ID / Authenticode）；
- 产物的**完整性校验**（校验和、provenance、更新包签名）；
- 签名缺失时的**用户侧说明与兜底**；
- 支撑上述三点的 **CI 结构**。

本文不覆盖：应用内凭据存储（见 `local-service/README.md`）、Google OAuth 分发模型（问题更紧，见 2.3）、上架任何应用商店。

## 2. 我们现在的事实

以下都是核对过代码或实测的，不是推测。

| 项 | 现状 | 证据 |
|---|---|---|
| macOS Electron 包签名 | **完全跳过签名** | `desktop/package.json` 里 `"mac": { "identity": null }`；electron-builder schema 原文：`null` = skip signing entirely |
| 是否自动 ad-hoc 兜底 | **不会** | schema 原文：identity 未设置时若钥匙串无证书，"signing is skipped for all architectures — there is no automatic ad-hoc fallback" |
| macOS launcher 签名 | ad-hoc，且 seal 已损坏 | `codesign -dv` → `Signature=adhoc`、`flags=0x2(adhoc)`、`Sealed Resources version=2`；`spctl -a` → `a sealed resource is missing or invalid` |
| 本地 Electron 包能否启动 | 不能（已记录） | `docs/desktop-build-2026-10-30.md`：`AMFI: ... is adhoc signed` / `The file is adhoc signed or signed by an unknown certificate chain` |
| Windows 包签名 | 无 Authenticode | `dist:win` 只出 zip，没有任何证书配置 |
| Windows 真机验证 | **从未做过** | `desktop/README.md`、`docs/desktop-install.md` 都自认未在真实 Windows 上验证 |
| 自动更新 | 无 | 没有 electron-updater，没有 latest.yml |
| CI | 无 | 仓库没有 `.github/` 目录 |
| 完整性校验 | 手写 SHA-256 | `docs/desktop-build-2026-10-30.md` 里逐条抄的哈希，无脚本、无校验命令 |
| 安全说明文档 | 无 `SECURITY.md` | 只有零散写在 `desktop/README.md` 的"重要限制"里 |

### 2.1 关键纠正：AMFI 拒绝的不是 ad-hoc

`desktop/README.md` 写"macOS 26 的 AMFI 会拒绝本地 ad-hoc 签名的 App"，并据此做了 AppleScript launcher 绕过。实测与上游 schema 都指向另一个结论：

1. **Electron 官方分发的二进制本来就是 ad-hoc 签名**，且只有链接器签名（`flags=0x20002(adhoc,linker-signed)`、`Sealed Resources=none`）。
2. electron-builder 打包时会改 Info.plist、塞 `app.asar`、重命名二进制——**这一步就把那个最小签名弄失效了**，于是 AMFI 报 "adhoc signed or signed by an unknown certificate chain"。它报的是"签名无效"，不是"不许 ad-hoc"。
3. electron-builder 的 schema 自己写明了正确做法：把 `identity` 设成 `"-"` 才是"显式选择 ad-hoc 签名"。注意配套约束：`hardenedRuntime` 默认 `true`，**ad-hoc + hardenedRuntime 同时开启时，必须加 `com.apple.security.cs.disable-library-validation` entitlement，否则会启动失败**；不加就把 `hardenedRuntime` 关掉。

Muster 在 macOS 上做的正是这件事，一行配置 `"signingIdentity": "-"`，然后它的包在 macOS 26 上能跑（Gatekeeper 会拦，但那是另一层，见 3.3）。

**结论**：我们该补的是"打包后重新 ad-hoc 签整包"，而不是绕开 Electron。launcher 可以保留（体积小、无 Electron 依赖），但它是**产品选择**，不是签名失败的兜底。

> 待验证（S0 第一个任务）：把 `identity` 改 `"-"` + `hardenedRuntime: false`，重新 `npm run dist:mac`，在本机双击启动。预期能起来。若仍被 AMFI 拒绝，再回退到 launcher 方案，并把日志记进 `docs/desktop-build-*.md`。

### 2.2 现状里最坏的一点：静默跳过

`identity: null` 的意思是"我不要签名"，而 electron-builder 不会报警。这导致：**同一份配置在本机（无证书）和未来的 CI（有证书）行为不同，但构建日志都不说**。Muster 至少在 `tauri.conf.json` 里明写了 `"-"`，并在 RELEASE_NOTES 里明写"仍是 ad-hoc"。我们把"没签"藏进了一个 `null`。

这是 S0 就要改的：**签名状态必须是显式配置，且在 CI 里被断言**。

### 2.3 比签名更紧的问题（顺带记录，不在本文范围）

`desktop/README.md` 承认 `prepare-resources` 会把 `local-service/.env.local`（含 Google OAuth client secret）复制进构建产物，公开 Release 的 launcher 已经剥离了它。这比"有没有签名"严重得多：签名解决的是"用户敢不敢运行"，secret 泄露解决的是"别人能不能冒充我们的 OAuth client"。分发方案定稿前必须先定 secret 模型（服务端中转 / 统一 client / 只走用户自填）。

## 3. Muster 到底怎么做的

### 3.1 配置层

- macOS：`src-tauri/tauri.conf.json` → `bundle.macOS.signingIdentity: "-"`。就是 ad-hoc，没有 Developer ID。
- Windows：`bundle.windows` 里只有 `webviewInstallMode: embedBootstrapper`，**没有任何证书字段**。
- 没有 `entitlements.plist`，没有 provisioning profile。

### 3.2 流水线层

`.github/workflows/release.yml` 的环境变量只有三个：`GITHUB_TOKEN`、`TAURI_SIGNING_PRIVATE_KEY`、`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。**没有 `APPLE_*`，没有 `WINDOWS_CERTIFICATE`**，也没有 `notarytool` 步骤。

真正做对的是三处断言：

1. macOS 必须 `--bundles app,dmg`，只给 `dmg` 会没有 `.app.tar.gz`，而他们为此专门加了一个"断言更新包存在"的 step；
2. 独立 job `verify-updater-manifest` 检查 `latest.json` 里 `darwin-aarch64 / darwin-x86_64 / windows-x86_64 / linux-x86_64` 四个 key 齐全；
3. 那个 job 没有 checkout，所以 `gh release download` 必须显式 `--repo`——这条注释写的是"曾经上线过一次错误"。

### 3.3 用户侧

- v0.5.0 release notes 直接写 "you will need to allow the app on first launch (**it is not notarised**)"；
- 官网 FAQ 有专门一问，中英日韩四语："没有购买昂贵的商业代码签名证书……Windows 点更多信息→仍要运行；macOS 在系统设置→隐私与安全性允许打开"；
- `SECURITY.md` 把"发布二进制没有代码签名"列进 **out of scope**，理由是成本而不是缺陷。

### 3.4 他们真正签的东西

不是 OS 代码签名，是**更新包签名**：minisign（Ed25519）。`createUpdaterArtifacts: true` + 私钥在 CI secret + 公钥硬编码进 `plugins.updater.pubkey`，每个产物出 `.sig`（v0.5.0 的 15 个资产里 5 个 `.sig`），更新器先验签再解压。

这层只防投毒和中间人，**不会减少任何一个系统弹窗**。两件事必须分开记。

### 3.5 我实测的结果（v0.5.0，本机 macOS 26.5.2）

```text
codesign -dv  → Signature=adhoc, TeamIdentifier=not set, Internal requirements count=0
spctl -a -vvv -t install → rejected
xcrun stapler validate   → does not have a ticket stapled to it
PE Certificate Table     → size = 0（Windows setup.exe 无 Authenticode）
MSI \x05DigitalSignature → 不存在
```

即：macOS 是"自洽但无人担保"，Windows 是"裸的"。

## 4. 抄什么、不抄什么

| Muster 的做法 | 我们的对应做法 | 抄? | 理由 |
|---|---|---|---|
| `signingIdentity: "-"`（ad-hoc） | `mac.identity: "-"` + `hardenedRuntime: false` | **抄** | 修掉 2.1 的真 bug，去掉对 launcher 的依赖 |
| 无证书也不隐藏 | CI preflight：缺证书/缺 secret 直接 fail，输出"这是未签名构建" | **抄并加强** | 我们现在的 `null` 是静默跳过，最坏 |
| 用户侧绕过文档 | 安装页统一口径 + 一条可复制的命令 | **抄** | 但必须按 macOS 15+ 的路径写（右键打开已失效） |
| 更新包独立签名（minisign） | 自建 minisign 或复用 electron-updater 的 sha512 + 额外签名 | **抄思路** | electron-updater 只校验 sha512，latest.yml 本身无签名，不够 |
| CI 产物断言 + manifest 完整性检查 | 结构化断言脚本 + 平台 key 检查 | **抄** | 这是他们最值钱的工程资产 |
| 注释里写踩坑原因 | 同 | **抄** | 他们的注释比代码有用 |
| `--bundles app,dmg` | 无对应物 | 不抄 | Tauri 特有 |
| `updaterJsonPreferNsis` | 无对应物（我们出 zip） | 不抄 | 但同类坑存在：若将来上 NSIS，`perMachine` 会和 per-user 安装打架 |
| 每次自动更新后重新授权 | 更新包装完清 quarantine | **改进** | 他们自己的 release notes 承认"the same applies after an auto update"，且代码里没有任何清 quarantine 的逻辑 |

差异清单（决定配置不能照搬）：

| 维度 | Muster | 我们 |
|---|---|---|
| 框架 | Tauri 2（Rust + 系统 WebView） | Electron 45（自带 Chromium） |
| 体积 | DMG 9.5 MB | DMG 125 MB |
| 敏感数据 | 会话 cookie（Keychain） | 会话 + **OAuth client secret** + 本地 SQLite |
| 更新机制 | tauri-plugin-updater + minisign | 无（要新建） |
| 构建环境 | 三个原生 runner | 目前只在 macOS 上跨编 Windows zip（不可靠） |

## 5. 分阶段方案

原则：**先做零成本、能立刻验证的；花钱的（证书）放在后面，并为它预留配置位，避免二次返工。**

### S0 — 修掉静默未签名（0 成本，半天到一天）

改动点（均为 `desktop/`）：

1. `package.json`：`"identity": null` → `"identity": "-"`，并加 `"hardenedRuntime": false`（S3 再打开并配最小 entitlement）。
2. `build-launcher.cjs`：在往 `Contents/Resources` 塞完 node/runtime/service/webapp **之后**，执行一次整包 ad-hoc 重签，修复现在 seal 损坏的问题。顺序不能反。
3. 新增 `scripts/checksums.mjs`：对 `release/` 下最终产物生成 `SHA256SUMS.txt`，一行一个文件。
4. 安装文档加一条校验命令，并把 macOS 绕过路径改成 macOS 15+ 的正确路径（`系统设置 → 隐私与安全性 → 仍要打开`，或 `xattr -dr com.apple.quarantine`），删掉已经失效的"右键→打开"。

验收：

```bash
# 1. 签名存在且有效
codesign --verify --deep --strict "desktop/release/Monash Cove.app"   # 期望通过
codesign -dv "desktop/release/Monash Cove.app"                        # 期望 Signature=adhoc
# 2. 本机能启动（双击或 open）
open "desktop/release/mac-arm64/Monash Cove.app"
# 3. 校验和可验证
cd desktop/release && shasum -a 256 -c SHA256SUMS.txt
```

出口条件：Electron 包在本机能启动；`spctl` 仍会 rejected（这是预期的，ad-hoc 就是 rejected），文档里写清这一点。

> 注意：`spctl` 显示 rejected **不代表失败**。S0 的目标是"自洽且可启动"，不是"通过 Gatekeeper"。这个区分必须写进文档，否则下一个人会以为 S0 没做成。

### S1 — 可验证分发（0 成本，一天）

1. 新建 `.github/workflows/release.yml`，矩阵用**原生 runner**：`macos-15`（arm64）、`macos-15-intel`、`windows-latest`。不再在 macOS 上跨编 Windows 包。
2. 断言 step（照抄 Muster 的思路，换成我们的产物）：
   - `release/*.dmg`、`*.zip`、Windows `*.zip` 必须存在且大于尺寸下限（防"空壳包"）；
   - `SHA256SUMS.txt` 每行对应的文件都存在；
   - 三个平台产物齐全（含 `win-x64`），缺一个就红。
3. `actions/attest-build-provenance` 给每个产物生成 provenance——**不需要证书**，GitHub 会显示"这个文件由哪个 workflow、哪个 commit 构建"。
4. preflight：检查签名所需的 secret 是否存在，缺失时**明确输出"本次为未签名构建"**并继续（S1 阶段）或直接失败（S3 之后）。

验收：故意删掉一个平台产物，workflow 必须红；恢复后必须绿。

### S2 — 签名更新通道（1–2 天）

前提：先决定要不要自动更新。要，则需要 NSIS（Windows）和 zip（macOS），因为 electron-updater 依赖它们。

1. 引入 `electron-updater`，产物同时出 `latest-mac.yml` / `latest.yml`。
2. **在 sha512 之上加一层自己的签名**：私钥在 CI secret（`COVE_UPDATE_SIGNING_KEY`），公钥编译进主进程；下载后、安装前验签。理由：`latest.yml` 从 GitHub 拉，本身没有签名，只校验 sha512 等于只校验"有没有传坏"，不校验"是不是我发的"。
3. CI 加 manifest 断言：`latest.yml` 与 `latest-mac.yml` 的 `files[].sha512` 与同目录产物一致；三平台 key 齐全。这是 Muster `verify-updater-manifest` 的等价物。
4. 更新安装完成后清 `com.apple.quarantine`，避免"每次更新都要重新授权"。

验收：装 v0.1.3，改一个可见字符串发 v0.1.4，应用内更新能装上且不弹第二次 Gatekeeper；篡改 `latest.yml` 后更新必须被拒绝。

### S3 — 真签名（花钱，按需）

macOS：

- 前提：Apple Developer Program，**$99/年**（个人可申请；Developer ID 证书只有 Account Holder 能创建；免费账号签了也不能公证）。
- 配置：`mac.identity` 移除（让 electron-builder 从钥匙串取），`mac.notarize: true`，`hardenedRuntime: true` + 最小 `entitlements`。
- 验收三条，全过才算：

```bash
codesign --verify --deep --strict --verbose=2 "Monash Cove.app"  # valid
spctl -a -vvv -t install "Monash Cove.app"                      # accepted, source=Notarized Developer ID
xcrun stapler validate "Monash Cove.app"                        # The validate action worked
```

Windows（三选一）：

| 路线 | 配置入口 | 适合 |
|---|---|---|
| Azure Artifact Signing（原 Trusted Signing） | `win.azureSignOptions` | 能过主体审核、想长期做 |
| OV 证书（pfx） | `WIN_CSC_LINK` + `WIN_CSC_KEY_PASSWORD` | 个人开发者最常见 |
| 自签 signtool 流程 | `win.signtoolOptions` / 自定义签名命令 | 已有企业设施 |

两个必须写进文档的事实：2024 年起 **EV 证书不再给 SmartScreen 即时信誉**，EV 和 OV 一样要持续签多版累积；Windows 11 开启 **Smart App Control** 的机器会直接阻止未签名应用且无法单独放行，只能关掉整个 SAC。

## 6. 配置草案（未落地）

macOS，S0：

```json
"mac": {
  "identity": "-",
  "hardenedRuntime": false,
  "category": "public.app-category.education"
}
```

macOS，S3（S0 的对应行整体替换）：

```json
"mac": {
  "hardenedRuntime": true,
  "entitlements": "assets/entitlements.mac.plist",
  "entitlementsInherit": "assets/entitlements.mac.plist",
  "notarize": true
}
```

`mac.notarize: true` 由环境变量驱动，electron-builder 支持三组（推荐第一组，API Key 比 Apple ID + 专用密码更适合 CI）：

| 组 | 变量 |
|---|---|
| API Key（推荐） | `APPLE_API_KEY`、`APPLE_API_KEY_ID`、`APPLE_API_ISSUER` |
| Apple ID | `APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID` |
| 钥匙串 profile | `APPLE_KEYCHAIN`、`APPLE_KEYCHAIN_PROFILE` |

签名证书（S3）走 `CSC_LINK`（base64 的 .p12）+ `CSC_KEY_PASSWORD`，不写进仓库。

Windows（S3）：

```json
"win": {
  "azureSignOptions": {
    "publisherName": "<证书主体>",
    "endpoint": "<区域 endpoint>",
    "certificateProfileName": "<profile>",
    "codeSigningAccountName": "<account>"
  }
}
```

CI 结构（S1 起）：

```
preflight（检查 secrets / 决定是否未签名构建）
  → build（matrix: macos-15 / macos-15-intel / windows-latest）
  → assert-artifacts（存在性 + 尺寸 + SHA256SUMS 完整）
  → sign/notarize（仅 S3，mac 与 win 各自）
  → verify-manifest（latest*.yml 平台 key 与 sha512）
  → provenance attestation
  → publish（draft release）
```

关键：**verify-manifest 必须独立成 job 且不受单个平台失败影响**（Muster 用 `if: always()`），因为"某个平台缺失"恰恰是需要在别的平台都成功时才看得见的问题。

## 7. 风险与代价

| 项 | 代价 | 说明 |
|---|---|---|
| S0 改 ad-hoc | 半天 | 无外部依赖，可当天验证 |
| S1 CI | 一天 | 首次跑通原生 runner 的依赖安装是主要耗时 |
| S2 更新器 | 1–2 天 | 引入 electron-updater 会带来 NSIS 打包差异，需重测安装/卸载 |
| Apple 证书 | $99/年 + 审核时间 | 个人可申请；**不买也能发版**，只是用户要过一道提示 |
| Windows 证书 | OV 年费或 Azure 订阅 | 无证书的后果是 SmartScreen 提示 + SAC 机器不可用 |
| 维护成本 | 每次发版多 3 条验收命令 | 可脚本化为 `npm run verify:release` |

**不做签名的真实代价**（这是要不要花的判断依据）：首次安装多一道系统弹窗、企业/校园 MDM 机器基本装不上、每次更新后可能重新授权、无法上架任何商店。如果目标只是"我和几个同学用"，S0 + S1 足够；一旦要公开发布，S3 是唯一解。

## 8. 待拍板（按优先级）

1. **OAuth secret 的分发模型**先定，它比签名更紧（2.3）。三个选项：服务端中转 / 统一公开 client + Google 验证 / 只让用户自填。这一项决定 S0 的包能不能公开。
2. **发布面**是"自己 + 同学"还是"公开发布"？前者 S0+S1 收工，后者排 S3 预算。
3. **Electron 壳保留吗**？保留 → S0–S3 全走；只留 launcher → 只需 S0 的第 3、4 项 + S1。
4. **Windows 有没有真机**？没有真机之前，Windows 的任何"已修复"都只能是"未验证"（这符合仓库现有口径）。
5. 预算上限：$99/年（Apple）是否可接受，Windows 证书是否今年就上。

## 9. 附录：证据

Muster 侧（本机实测 + 仓库原文）：

- `src-tauri/tauri.conf.json#L57` → `"signingIdentity": "-"`
- `.github/workflows/release.yml` → 仅 `TAURI_SIGNING_PRIVATE_KEY(_PASSWORD)`；`--bundles app,dmg`；`verify-updater-manifest` job
- `SECURITY.md` → "The absence of code signing on release binaries … is a cost constraint, not a defect"
- 官网 FAQ（`docs/index.html`、`landing-page/index.html`）→ 四语的 SmartScreen / Gatekeeper 绕过说明
- 本机对 v0.5.0 产物的验证输出见 3.5

我们这一侧（本机实测）：

```text
desktop/package.json            → mac.identity = null
electron-builder schema         → identity null = skip signing；不自动 ad-hoc；
                                  ad-hoc + hardenedRuntime 需 disable-library-validation
node_modules/electron/dist      → Signature=adhoc, flags=0x20002(adhoc,linker-signed),
                                  Sealed Resources=none
CoveLauncher-0.1.2-arm64.app    → Signature=adhoc；spctl: a sealed resource is missing or invalid
release/mac-arm64/              → 空（0.1.2 的 Electron .app 未保留）
.github/                        → 不存在
```
