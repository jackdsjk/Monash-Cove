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
- `GET /api/items/:id/detail`（来源原文、作者、老师/学生回复）
- `GET /api/moodle/courses` / `POST /api/moodle/content-sync` / `GET /api/moodle/content?courseId=`
- `GET /api/pack?courseId=`（作业资料包：本机已同步的作业、变更与同课程 Ed 帖子，只读）
- `GET /api/moodle/download?url=`（仅 `mod/resource`，服务端用本机 session 代理文件）
- `POST /api/moodle/download-batch`（1–100 个 resource，返回 ZIP）
- `POST /api/sync/full` / `GET /api/sync/status`（首次全量后台任务与进度）
- `GET /api/attendance/status` / `GET /api/attendance/codes` / `POST /api/attendance/fill`
- `POST /api/attendance/submit`（真正提交；1–50 条串行、整批 90 秒、逐条结果、失败不重试）
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

## 读取缓存

Moodle 课程、成绩，Ed 课程/lesson，以及 OnTrack 概览/任务的 GET 会读取账号隔离的 SQLite `resource_snapshots`。新鲜快照直接返回；过期数据先返回并后台刷新；首次无快照才等待上游。同一资源的并发请求共用刷新任务，OnTrack 概览与列表共用一次抓取。前端切页时保留共享内存查询结果。

上述响应保留原字段，增加 `cache`：`identity`（不透明凭据指纹）、`fetchedAt`、`checkedAt`、`refreshing`、`stale`、`error`；成绩还包含 `coverage`（各课程最后成功时间）和 `failedIds`。`?refresh=1` 主动等待刷新并加入已有任务；失败时有旧数据便返回旧数据及错误，没有快照则沿用原 API 错误响应。失败不会更新最后成功时间；失败后普通读取至少退避 30 秒，手动刷新可立即重试。

新鲜期默认值定义在 `src/resource-cache.ts` 的 `RESOURCE_TTL`：课程目录 6 小时、成绩 5 分钟、Ed 内容 15 分钟、OnTrack 2 分钟。这些是后台检查间隔，过期不删除成功数据；页面显示实际成功时间。个别成绩课程失败时保留其旧成绩及原覆盖时间。

快照单项上限 8 MiB，每个来源最多 1,000 项及 96 MiB。连接、断开或替换凭据使对应快照和在途写回失效；凭据指纹变化会隔离数据，无法确认同账号的会话更新按新连接处理。清空本地数据也清空快照。Moodle 资料正文和考试表继续使用原有本地数据表，不重复建立快照。OnTrack 显式断开会禁止全局 CLI 会话回退，重新保存凭据可连接。

## 数据与安全

- SQLite 表：`sources/items/item_content/sync_cursors/corrections/reads/settings`；
- 凭据在 macOS Keychain；真实正文和纠错只在本机；
- Moodle 会话在服务启动时、以及之后每 6 小时用一次 `/my/` 轻量请求校验：会话失效只把来源标成 `degraded`（`lastError` 写明「会话已过期」，凭据保留，Web UI 显示「重新登录」）；凭据 JSON 损坏、缺字段或 Cookie 为空则删除凭据并把来源标成 `disconnected`；
- 服务只绑 loopback；状态变更请求检查 Origin，返回 CSP/nosniff/referrer 头；
- 真实数据不进 Git，不上云。

## 当前状态

S1–S8 完成；Gmail 20、Ed 91、Moodle 6 均已真实同步，重启后仍 connected。Moodle 当前课程无 forum 链接，论坛同步返回 0。
