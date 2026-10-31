# Cove Desktop

Electron 外壳，把 `webapp/dist` 和本地 `local-service` 打包成一个桌面 App。

## 结构

- `main.cjs`：启动本地服务、选择本地端口、打开窗口；
- `scripts/prepare-resources.cjs`：复制后端 `dist`，只用 production dependencies 安装；
- `assets/`：macOS `.icns`、Windows `.ico` 和 PNG 图标；
- `release/`：构建产物，不提交到 Git。

## 构建

先构建两个 package：

```bash
cd webapp && npm run build
cd ../local-service && npm run build
```

再构建桌面 App：

```bash
cd ../desktop
npm ci
npm run dist:mac       # Apple Silicon arm64: dmg + zip
npm run dist:win       # Windows x64: zip
```

Windows arm64：

```bash
npm run prepare:resources
npx electron-builder --win zip --arm64
```

## 快速安装：CoveLauncher（无 Electron 签名）

macOS 26 会拒绝当前未签名的 Electron App。为了先给测试用户一个**无需 Apple Developer ID**的入口，可以构建轻量 launcher：

```bash
cd desktop
npm run build:launcher
```

产物：

```text
desktop/release/CoveLauncher-0.1.1-arm64.dmg
desktop/release/CoveLauncher-0.1.1-arm64.zip
```

用户解压后双击 `CoveLauncher.app`，它会：

1. 用包内的 Node 26 启动本地服务；
2. 打开浏览器到 `http://127.0.0.1:4317`；
3. 首次进入 `/setup`。

这是一个 AppleScript 启动器，不是 Electron 原生窗口。它仍应做小范围测试；正式分发仍建议签名的 Electron App。

## 产物

- macOS arm64：`release/Cove-0.1.1-arm64.dmg`、`release/Cove-0.1.1-arm64.zip`
- macOS Intel：`release/Cove-0.1.1-x64.zip`
- Windows x64：`release/Cove-0.1.1-win-x64.zip`

## 重要限制

### macOS 签名

当前机器没有 Apple Developer ID 证书，所以 macOS 包是**未签名**的。

macOS 26 的 AMFI 会拒绝本地 ad-hoc 签名的 App。要真正分发给别人，必须：

1. 用 Developer ID Application 证书签名；
2. 用 Apple notarization 公证；
3. 生成 DMG 后再签名。

没有这三步，用户机器可能提示 App 已损坏或无法打开。

### Windows 签名

Windows ZIP 未签名，首次运行会出现 SmartScreen 提示，需要用户选择“更多信息 → 仍要运行”。

### Google OAuth

本地构建时，`prepare-resources` 会把 `local-service/.env.local` 复制到桌面包的
`local-service/.env.local`，因此测试包可以使用 Cove 当前的 Google OAuth client。

注意：

- 该文件包含 client secret，**不要发布构建产物**；
- 正式公开分发应改为 Cove 统一 OAuth client + 服务端交换，或经过 Google 验证的公开 client；
- 桌面版默认固定使用 `4317`，以匹配 OAuth callback；`COVE_PORT=0` 仅用于自动化测试随机端口。

### Moodle 登录助手

依赖本机安装的 Google Chrome。App 没有内嵌 Chromium。

## MCP

桌面 App 也包含本地 MCP bridge。外部 Agent 建议使用 stdio：

```json
{
  "mcpServers": {
    "cove": {
      "command": "node",
      "args": ["/absolute/path/to/local-service/dist/mcp-stdio.js"],
      "env": { "COVE_API_URL": "http://127.0.0.1:4317" }
    }
  }
}
```

完整说明见 [docs/mcp.md](../docs/mcp.md)。

## 数据位置

- macOS：`~/Library/Application Support/Cove/`
- Windows：Electron 的 `userData` 目录（通常是 `%APPDATA%/Cove/`）
- 凭据：macOS Keychain；Windows 当前使用用户数据目录下 `secrets.json`（文件权限保护，不是系统 Keychain）

## 本地验证

```bash
cd desktop
npm start
```

首次打开应进入 `/setup`。设置页“运行环境”会显示 Node、Chrome、OAuth 和凭据存储状态。
