# Cove 0.1.0 桌面版安装说明

公开发布页：

```text
https://github.com/jackdsjk/Monash-Agent/releases/tag/v0.1.0
```

## 下载哪个文件

| 平台 | 文件 |
|---|---|
| Apple Silicon Mac（M1/M2/M3/M4） | `CoveLauncher-0.1.0-arm64.dmg` |
| Apple Silicon Mac，备用 | `CoveLauncher-0.1.0-arm64.zip` |
| Windows x64 | `Cove-0.1.0-win-x64.zip` |

不要下载 `Cove-0.1.0-arm64.dmg` 作为普通安装包：那是 Electron 原生包，当前没有 Developer ID 签名，macOS 26 会拒绝启动。

## macOS 安装

1. 双击 `CoveLauncher-0.1.0-arm64.dmg`
2. 把 `CoveLauncher.app` 拖进 `Applications`
3. 等复制完成
4. 在 Finder 推出 DMG
5. 去 `Applications` 双击 `CoveLauncher`
6. 它会启动本地服务并打开浏览器：

```text
http://127.0.0.1:4317
```

不要在 DMG 挂载窗口里直接运行；否则推出 DMG 后会报 disk image 错误。

### 第一次被 macOS 拦截

这是未签名 App 的 Gatekeeper 提示，不是 Cove 损坏。

尝试：

1. 右键 `CoveLauncher.app` → 打开 → 再点“打开”；
2. 或打开 **系统设置 → 隐私与安全性** → 找到 CoveLauncher → **仍要打开**；
3. 如果提示“已损坏”，在终端运行：

```bash
xattr -dr com.apple.quarantine "/Applications/CoveLauncher.app"
open "/Applications/CoveLauncher.app"
```

如果仍然被拒绝，说明当前 macOS 的安全策略不接受这个 Launcher；需要 Developer ID 签名版本。

### 启动后没有窗口

Launcher 不会创建原生窗口，它只启动本地服务并打开浏览器。
如果浏览器没有打开，查看：

```bash
cat ~/Library/Logs/CoveLauncher.log
```

并确认 Google Chrome 已安装（用于 Moodle 登录助手）。

## Google OAuth 说明

公开 Release 的 Launcher **不包含 Cove 的 Google OAuth client secret**，因此：

- Ed / Moodle 可以按设置向导连接；
- Gmail 会提示 OAuth 未配置；
- 需要使用带 OAuth 配置的私有启动包，或者先配置 `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`。

把 client secret 直接公开在 GitHub 上是不安全的。正式公开版本应使用 Cove 自己的 OAuth 服务端/授权中转，或经过 Google 验证的公开 client。

## Windows 安装

1. 解压 `Cove-0.1.0-win-x64.zip`
2. 运行 `Cove.exe`
3. 如果出现 SmartScreen，选择“更多信息 → 仍要运行”
4. 首次启动进入设置向导

Windows 包没有在真实 Windows 机器上由本项目完成验证；请记录系统版本和错误。

## 使用 MCP

外部 Agent 的接入方式和工具列表见：

[docs/mcp.md](mcp.md)

stdio 快捷配置：

```json
{
  "mcpServers": {
    "cove": {
      "command": "node",
      "args": ["/absolute/path/to/Monash-Agent/local-service/dist/mcp-stdio.js"],
      "env": { "COVE_API_URL": "http://127.0.0.1:4317" }
    }
  }
}
```

本地服务必须先启动。桌面 Launcher 默认使用 `4317`。

## 版本

```text
Cove 0.1.0
```
