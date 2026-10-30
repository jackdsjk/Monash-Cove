# Cove Local Service

Cove 的本地 Node 服务：提供 `/api/*`、SQLite、来源凭据和（生产模式下的）Web UI 静态文件。它绑定 `127.0.0.1`，不暴露公网。

## 运行

```bash
cd local-service
npm install
npm run dev
```

默认 API：<http://127.0.0.1:4317/api/health>。数据目录：`~/Library/Application Support/Cove`（可用 `COVE_DATA_DIR` 覆盖）。

生产模式：

```bash
cd webapp && npm run build
cd ../local-service && npm run build
COVE_STATIC_DIR=../webapp/dist npm start
```

或从仓库根目录执行 `./start-cove.sh`。

## 环境变量

| 变量 | 作用 |
|---|---|
| `COVE_PORT` | 本地端口，默认 4317 |
| `COVE_DATA_DIR` | SQLite 目录 |
| `COVE_DB_PATH` | SQLite 文件路径 |
| `COVE_STATIC_DIR` | 生产 UI 目录 |
| `COVE_AUTO_SYNC` | `0` 关闭每小时同步 |
| `COVE_SECRET_STORE` | `memory` 仅测试；默认 macOS Keychain |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Gmail OAuth |
| `GOOGLE_REDIRECT_URI` | 默认 `http://127.0.0.1:4317/oauth/google/callback` |
| `COVE_MODEL_*` | 可选模型 endpoint/model/key |

## 校准

```bash
npm run retriage
```

按当前 `rules-v2` 重跑 SQLite 里已有条目的分诊，不重新抓取来源。

## API

- `POST/GET/DELETE /mcp`（Streamable HTTP MCP；只读）
- `npm run mcp`（stdio MCP bridge，需要本地服务已启动）
- `GET /api/health`
- `GET /api/brief?since=&source=&q=`（Moodle 条目包含 `dueAt` / `deadlineKind`）
- `GET /api/items/:id`
- `GET /api/moodle/courses` / `POST /api/moodle/content-sync` / `GET /api/moodle/content?courseId=`
- `GET /api/moodle/download?url=`（仅 `mod/resource`，服务端用本机 session 代理文件）
- `POST /api/moodle/download-batch`（1–100 个 resource，返回 ZIP）
- `POST /api/sync/full` / `GET /api/sync/status`（首次全量后台任务与进度）
- `GET /api/attendance/status` / `GET /api/attendance/codes` / `POST /api/attendance/fill`
- `POST /api/attendance/connect/start` / `GET /api/attendance/connect/status`
- `GET /api/runtime/status`（Node/Chrome/OAuth/凭据存储检查）
- `GET /api/setup/status` / `POST /api/setup/moodle/start` / `GET /api/setup/moodle/status`（首次设置与 Moodle 登录助手）
- `GET /api/sources`
- `POST /api/check`
- `PATCH /api/items/:id/correction`
- `POST /api/sync`（`{source:"gmail"|"ed"|"moodle"}`）
- `POST /api/sources/:source/credentials`
- `POST /api/sources/:source/disconnect`
- `GET /api/oauth/google/start`
- `GET /oauth/google/callback`
- `DELETE /api/data`

## 数据与安全

- SQLite 表：`sources/items/item_content/sync_cursors/corrections/reads/settings`；
- 凭据在 macOS Keychain；真实正文和纠错只在本机；
- 服务只绑 loopback；状态变更请求检查 Origin，返回 CSP/nosniff/referrer 头；
- 真实数据不进 Git，不上云。

## 当前状态

S1–S8 完成；Gmail 20、Ed 91、Moodle 6 均已真实同步，重启后仍 connected。Moodle 当前课程无 forum 链接，论坛同步返回 0。
