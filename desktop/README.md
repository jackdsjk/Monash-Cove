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

## 产物

- macOS arm64：`release/Cove-0.1.0-arm64.dmg`、`release/Cove-0.1.0-arm64.zip`
- macOS Intel：`release/Cove-0.1.0-x64.zip`
- Windows x64：`release/Cove-0.1.0-win-x64.zip`

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

桌面包不包含 `.env.local` 或 Google OAuth client。当前桌面版需要从环境变量提供：

```bash
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://127.0.0.1:4317/oauth/google/callback
```

更完整的桌面 OAuth 配置入口尚未实现。

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
