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
| `COVE_SEED_FIXTURE` | 默认关闭；`1` 仅为未使用的数据库一次初始化匿名示例 |
| `COVE_FIXTURE_PATH` | 可选示例 JSON 路径；不隐式开启示例模式 |
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
- `GET /api/brief?since=&source=&q=`（条目包含独立的 `firstSeenAt` 首次入库时间；Moodle 条目含 `dueAt` / `deadlineKind`）
- `GET /api/items/:id`
- `GET /api/items/:id/detail`（来源原文、作者、老师/学生回复）
- `GET /api/moodle/grades[?refresh=1]`（`{courses,cache}`，课程明细、独立 Overview 原文、结构新鲜度及变化事件；字段与边界见下文）
- `GET /api/moodle/courses` / `POST /api/moodle/content-sync` / `GET /api/moodle/content?courseId=`
- `GET/PATCH /api/moodle/course-preferences`（完整对象 `{activeSemester:null|"2026-S2",hiddenCourseIds:[],pinnedCourseIds:[]}`；课程 ID 为数字字符串）
- `GET /api/pack?courseId=`（Moodle 作业资料：只导出与 Grades 评分项关联的本地 Moodle 作业／测验及变更，只读；每项带 gradeItemId，未能核验时返回 verificationWarning；不返回 Ed 帖子或 OnTrack 文件）
- `GET /api/moodle/download?url=`（仅 `mod/resource`，服务端用本机 session 代理文件）
- `POST /api/moodle/download-batch`（1–100 个 resource，返回 ZIP）
- `POST /api/sync/full` / `GET /api/sync/status`（Gmail/Ed/Moodle/OnTrack 全量后台任务与进度；未配置来源跳过，OnTrack 范围为账号当前可访问的项目及历史反馈）
- `GET /api/attendance/status` / `GET /api/attendance/codes` / `POST /api/attendance/fill`
- `POST /api/attendance/submit`（真正提交；1–50 条串行、整批 90 秒、逐条结果、失败不重试）
- `POST /api/attendance/connect/start` / `GET /api/attendance/connect/status`
- `GET /api/ontrack/account` / `GET /api/ontrack/overview` / `GET /api/ontrack/tasks`（只读账号与任务目录；任务 `id` 是真实实例 ID 或 `null`，`taskDefinitionId` 始终为定义 ID）
- `GET /api/ontrack/comments?project=&task=`（`task` 为任务定义 ID）
- `GET /api/ontrack/artifact?project=&task=&kind=task|resources|submission`（只读下载；项目/定义 ID 必须为正整数）
- `GET /api/runtime/status`（Node/Chrome/OAuth/凭据存储检查）
- `GET /api/setup/status` / `POST /api/setup/moodle/start` / `GET /api/setup/moodle/status`（首次设置与 Moodle 登录助手）
- `GET /api/sources`
- `POST /api/check`
- `PATCH /api/items/:id/correction`
- `POST /api/sync`（`{source:"gmail"|"ed"|"moodle"|"ontrack"}`）
- `POST /api/sources/:source/credentials`
- `POST /api/sources/:source/disconnect`
- `GET /api/oauth/google/start`
- `GET /oauth/google/callback`
- `DELETE /api/data`

## 读取缓存

Moodle 课程、成绩，Ed 课程/lesson，以及 OnTrack 概览/任务的 GET 会读取账号隔离的 SQLite `resource_snapshots`。新鲜快照直接返回；过期数据先返回并后台刷新；首次无快照才等待上游。同一资源的并发请求共用刷新任务，OnTrack 概览与列表共用一次抓取。前端切页时保留共享内存查询结果。

上述响应保留原字段，增加 `cache`：`identity`（不透明连接标识）、`fetchedAt`、`checkedAt`、`refreshing`、`stale`、`error`；成绩还包含 `coverage`（各课程最后成功时间）和 `failedIds`。`?refresh=1` 主动等待刷新并加入已有任务；失败时有旧数据便返回旧数据及错误，没有快照则沿用原 API 错误响应。失败不会更新最后成功时间；失败后普通读取至少退避 30 秒，手动刷新可立即重试。

新鲜期默认值定义在 `src/resource-cache.ts` 的 `RESOURCE_TTL`：课程目录 6 小时、成绩 5 分钟、Ed 内容 15 分钟、OnTrack 2 分钟。这些是后台检查间隔，过期不删除成功数据；页面显示实际成功时间。个别成绩课程失败时保留其旧成绩及原覆盖时间。

快照单项上限 8 MiB，每个来源最多 1,000 项及 96 MiB。显式连接、断开或替换凭据使对应快照和在途写回失效；无法确认同账号的更新按新连接处理。Moodle 内部 Set-Cookie 轮换保留连接标识及快照，主动重连则生成新标识。清空本地数据也清空快照。Moodle 资料正文和考试表继续使用原有本地数据表，不重复建立快照。OnTrack 显式断开会禁止全局 CLI 会话回退，重新保存凭据可连接。

每周资料页的“同步范围”按当前 Moodle 连接隔离保存：默认全部学期，支持显式学期、隐藏与置顶。未知学期保留，隐藏优先，置顶覆盖学期筛选。范围只影响批量资料同步和成绩抓取，不过滤已保存的资料浏览，也不改变简报 assessment/forum 拉取；单课手动同步可绕过范围。成绩快照包含范围版本，设置变更不会误用旧范围的缓存或删除课程目录。内部 Cookie 轮换保留范围；显式重连后需重新设置。

成绩快照现为 `grades:v7:<range>`，避免沿用旧解析结果。成绩抓取先复用 Muster 的门户名称判断，跳过 Academic Success、Student Portal、Student Hub 等学习支持入口；课程目录和资料浏览仍保留这些入口。真实教学课程的 HTTP 失败继续报告具体安全原因，不将 404 一概当成空成绩。按 Muster 的 `.gradeitemheader` 条件识别实际评分项并去重，保留未出分和手工录入项目；普通数值行和分类小计不计入。成绩列优先按 Moodle 类名读取，忽略缩进和操作菜单；支持百分比及分数范围，分类相对权重仅在祖先归属可确认时折算。未公布课程总分时保留 null；网络/503 与明确登录失效分别报告。参考和测试边界见 [资料页与成绩修复记录](../docs/learning-pages-and-grades-2026-11-11.md)。

作业资料与成绩页共用当前账号／同步范围的 `grades:v7` 快照和单次刷新；首次无缓存时读取 Grades，后续复用。按课程隔离后，优先匹配活动 ID，再对去权重文字后的唯一名称匹配；冲突 ID、外站和歧义名称不通过。Grades 读取失败时保留同账号旧快照已确认的资料并提示；无可用快照或未连接则不列出未确认作业。仅有提交入口不代表参与评分，未出分的 Grades 项仍可关联。


### 成绩补全与同步

成绩结构补充读取同课程 Assessments 的分类、权重和活动链接；空权重栏按 Muster 回退分类标题，显式 0 优先。结构刷新失败时沿用同账号／范围旧结构并重新匹配当前 Grades，保留 `assessmentFetchedAt`，标记 `assessmentStale`；首次无旧结构仍显示原始分数并提示。分区失败而主页有结构时回退主页。详见 [Muster 规则核对](../docs/muster-grading-rules-2026-11-11.md)。

仅对 Grades 已确认的同源 assign/quiz 补详情，Grades 分数优先；已公开且未变的详情复用现有快照 30 分钟（`RESOURCE_TTL.gradeDetails`），分数变化或过期后重读，待评分／隐藏分数每轮继续复核。item 的 `gradingState` 独立保留已评分但隐藏状态，`gradeSource` 标明 gradebook/activity。course 的 `overviewGrade` 保留 Overview 原文，不猜满分；`overviewWarning`／`detailWarning` 标明局部不可用。Overview 有值但明细为空的课程仍返回。普通／定时／全量 Moodle 同步均更新同一成绩快照，Grades 已确认的旧或无 due 测验也会复核；submitted/graded 写入既有本地完成事实，未知不擦除，用户显式决定优先。同步后的前端只非 force 重读本地快照；局部失败以 `gradeWarning`／快照错误提示，不伪装内容全失败。

`gradeChanges` 仅在同课程／同项目有基线后比较发布值；首次读取或新发现项目不提醒。事件 `{id,kind,itemName,detectedAt}` 不包含成绩值，最多保留 30 天／20 条。前端横幅关闭只保存内存中的事件 ID，浏览器重启后重置。没有原生系统通知或学习建议集成。

`moodle-page-reader.ts` 在一次成绩读取内合并并复用成功 HTML，每次 pull 重置，最多 800 条／96 MiB、单页 8 MiB，超时 20 秒；失败、登录页不缓存，调用方取消互不影响，连接变化拒绝旧页。transport 的 429/503 共享 Retry-After 冷却（默认 5 秒、最多 60 秒），可延长／取消，不自动重试。现有认证、资料与论坛 adapter 尚未共同使用该 reader。

## OnTrack 读取范围

任务目录采用 Always-Ontrack 的定义优先投影：合并课程定义与个人实例，兼容 camelCase/snake_case 元数据；未实例化任务使用 `id:null` / `isInstantiated:false` / `status:"not_instantiated"`，不会伪造实例 ID。截止日期优先使用个人实例日期，目标日期单独保留。普通目录排除已知高于目标等级或不匹配班级的任务；适用性未知时保留并提示核对，不据此断言必须完成。

全量反馈扫描按主机、用户、项目与任务定义隔离；断开或换账号后的迟到结果不得写回。普通同步保留 90 天反馈窗口，全量同步重新扫描服务器仍返回的历史反馈；任务、反馈仍通过既有本地条目幂等入库。概览和任务列表继续共用账号隔离快照，目录结构版本为 `overview:v2`，新鲜期仍为 2 分钟。OnTrack 全量同步成功后使相应快照失效，避免继续显示全量前的旧值。

下载拒绝服务器返回的 `FileNotFound.pdf` / `AwaitingProcessing.pdf` 占位文件；任务书与提交文件校验 PDF 签名，资源校验 ZIP 或保留上游声明的原文件扩展，返回安全生成的本地文件名。单文件最多 25 MiB，部分响应（206）报错，尚不实现分段合并。OnTrack 任务行直接调用这些只读 API，按需提供 Worksheet、资料和已有提交文件；不自动归档全部附件，也不上传、改状态或发表评论。

参考版本、Apache-2.0 许可证及裁剪范围见 [复用记录](../docs/always-ontrack-reuse-2026-11-11.md)。

## 数据与安全

- 默认首次启动没有示例内容、来源均未连接。仅显式示例模式初始化数据；已有内容、来源错误、账号或成功时间的数据库不会重新灌入示例。清理数据保留示例初始化标记，避免重启后再次灌入。
- Gmail 增量会完整消费 history 分页并去重；在同步前记录检查点，全部消息处理成功才保存，避免跳过同步期间到达的邮件。过期游标 HTTP 404 执行完整恢复；其他失败保留旧游标并允许幂等重试。失败前写入的部分消息保留，保守检查点可能重放少量消息。协议依据：[同步规范](https://developers.google.com/workspace/gmail/api/guides/sync)、[history.list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list)。
- 全量任务逐来源报告 `pending/running/done/error/skipped`；仅执行配置了凭据的来源，失败不阻止其他来源，且保留该来源的最后成功时间。总体任务支持 `running/done/error/skipped` 与 `message`；全部跳过不写全量完成时间。OnTrack 重新扫描当前可访问项目的任务与历史反馈，不受普通同步的 90 天反馈窗口或已扫描标记限制；当前已不适用的旧实例仍读取反馈，但不生成待办截止提醒。无法恢复服务器已隐藏或删除的内容。首次连接不强制四源齐备。
- SQLite 表：`sources/items/item_content/sync_cursors/corrections/reads/settings`；
- 凭据在 macOS Keychain；真实正文和纠错只在本机；
- Moodle 登录助手保存浏览器 User-Agent 与含 domain/path/expiry 的 Cookie；后端共享持久化 CookieJar，消费站内重定向与 Set-Cookie，自动保存轮换结果。旧的静态凭据仍兼容，建议重新连接一次以捕获完整元数据。
- 生产入口在启动时及每 10 分钟访问 `/my/` 维护会话，与自动批量同步开关独立；并发检查合并，正常请求不重复写 Keychain。明确的登录页、401 或外部 SSO 跳转才标成 `degraded`（凭据保留，提示「重新登录」）；离线、429、5xx 和无法识别的响应保留旧状态及最后成功时间。损坏或空凭据清除后标成 `disconnected`。服务关闭或电脑休眠期间无法维护，学校强制到期、撤销或 MFA 仍需重新登录；详见 [修复记录](../docs/moodle-session-reliability-2026-11-11.md)。
- 服务只绑 loopback；状态变更请求检查 Origin，返回 CSP/nosniff/referrer 头；
- 真实数据不进 Git，不上云。

## 当前状态

S1–S8 完成；Gmail 20、Ed 91、Moodle 6 均已真实同步，重启后仍 connected。Moodle 当前课程无 forum 链接，论坛同步返回 0。
