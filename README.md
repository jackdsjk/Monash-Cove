# Cove

Cove 是一个本地优先的校园信息分诊应用：把 Gmail、Ed 和 Moodle 的只读信息整理成可核对的简报、截止倒计时和每周资料。

## 结构

- `webapp/`：Vite + React + TypeScript + Ant Design 前端；
- `local-service/`：Node + Fastify + SQLite 本地服务，负责来源凭据、同步、分诊、资料索引和下载；
- `desktop/`：Electron 桌面壳与打包配置（macOS / Windows）；
- `签到`：从 Gmail / Moodle 汇总 attendance code，Moodle 图片使用本地 OCR；
- `docs/`：安装说明、MCP 接入和 release notes；
- `demo/`：匿名静态原型。

## 桌面安装

公开版本下载与安装说明：[docs/desktop-install.md](docs/desktop-install.md)。

## 桌面构建

参见 [desktop/README.md](desktop/README.md)。

当前 Electron macOS 包未签名，正式分发需要 Developer ID 和 notarization；测试可先用 `npm run build:launcher` 生成无需 Apple 签名的 CoveLauncher。Windows 包未在真实 Windows 机器测试。

## MCP

Cove 暴露一个本地只读 MCP 接口，外部 Agent 可以通过 stdio 或 Streamable HTTP 使用简报、截止时间、来源状态和课程资料。

完整接入说明：[docs/mcp.md](docs/mcp.md)。

快速配置：

```json
{
  "mcpServers": {
    "cove": {
      "command": "node",
      "args": ["/absolute/path/to/Monash Agent/local-service/dist/mcp-stdio.js"],
      "env": { "COVE_API_URL": "http://127.0.0.1:4317" }
    }
  }
}
```

## 本地运行

```bash
cd local-service
npm install
npm run dev
```

另开一个终端：

```bash
cd webapp
npm install
npm run dev
```

打开 <http://127.0.0.1:5174/>。首次使用在“数据源”连接账号并执行全量同步；之后打开 App 会做增量同步。

## 隐私边界

- 真实凭据、SQLite、邮件正文和个人数据只保存在本机；
- 这个公开仓库不包含真实 token、cookie、数据库或账户信息；
- Gmail 使用 `gmail.readonly`，Ed/Moodle 只读；
- 不自动提交作业、发送消息或代表用户操作。

## 验证

```bash
cd local-service && npm test
cd ../webapp && npm run check
cd ../webapp && npm run e2e
```
