# Agent 执行计划：Cove 真实数据

> 这是给执行 Agent 自己看的计划，不是给项目所有者做审批的计划。
>
> 执行入口：[next.md](next.md)。每完成一个阶段，先更新 `next.md`，再继续，不向用户请求阶段间确认。
>
> 当前状态：S1–S8 完成；Gmail 20、Ed 91、Moodle 6，重启后三源仍 connected。

## 1. 执行模式

用户说“开始”后，按 S1 → S8 连续执行：

1. 读 [next.md](next.md)，确认当前阶段和下一动作；
2. 完成当前阶段的全部任务；
3. 运行该阶段的验证命令；
4. 通过后更新 [next.md](next.md) 到下一阶段，并在 [execution-log.md](execution-log.md) 追加一行；
5. 立即继续，不总结、不等待确认；
6. 只有遇到 **硬阻塞** 才停下，其余情况用 fixture、mock 或已有数据继续。

硬阻塞只有四类：

- 需要用户本人完成的 OAuth/Ed token/Moodle 登录；
- 需要用户提供模型 API key 且该阶段必须真实调用；
- 不可逆或生产环境操作；
- 连续两次同一原因失败，且无法用 mock 推进。

遇到硬阻塞时：记录到 `next.md` 的 `Blocked`，继续做不依赖它的阶段；最后一次性列出用户要做的事。不能伪造“已接通真实账号”。

## 2. 固定假设

不再向用户确认这些：

- 产品形态：本地 Web App；Node 服务绑定 `127.0.0.1`，生产时同源提供 UI 和 API；
- 数据：SQLite，本地保存；不上云；
- 凭据：macOS Keychain（`security` CLI 封装成 `SecretStore`）；浏览器不接触 token/session；
- Gmail：官方 Gmail API + `gmail.readonly` + desktop OAuth loopback；
- Ed：API token，按 active course 拉最新 30 个主题；
- Moodle：已登录 `MoodleSession`，不保存密码；课程/assessment 复用现有逻辑；
- Moodle 论坛帖子：包含在计划内（S5），不能因为“可能难”跳过；
- 分诊：规则优先，模型可选；模型不可用时必须回退规则；
- 前端：保留现有 `webapp/`，替换数据层，不重写 UI；
- 桌面壳、云同步、多用户、提醒、问答、MCP 不做。

## 3. 完成定义

全部阶段完成后应满足：

- `local-service/` 能在干净目录启动，创建 SQLite，提供 `/api/*`；
- `webapp/` 不再 import fixture，所有真实条目通过本地 API；
- 真实 Gmail/Ed/Moodle 至少各完成一次同步（S8 用户凭据验证）；
- Moodle 论坛帖子可增量进入简报；
- 每个重要条目有来源 URL、时间、作者和原文证据；
- 已读、置顶、不重要、反馈在重启后保留；
- 来源失败、授权过期、空数据都有 UI 状态；
- 规则/模型版本可追溯，证据句必须是原文子串；
- Playwright E2E 覆盖连接（或 mock 连接）、同步、简报、详情、纠错、清除；
- 构建后的本地服务同源提供 UI，一条命令/启动器可运行；
- 文档、运行手册、隐私说明、已知限制同步。

不以“代码写完”代替“真实账号验证”。如果 S8 没有凭据，最终状态只能是 **代码完成，真实账号待验证**。

## 4. 阶段总览

| 阶段 | 交付状态 | 关键证据 | 依赖 |
|---|---|---|---|
| S1 本地运行时 + fixture API | Web App 通过本地 HTTP 取到 fixture | `local-service` 启动、API contract、webapp 不再 import fixture | 无 |
| S2 SQLite + 持久状态 | 数据、已读、纠错在重启后仍存在 | schema、migration、API、重启测试 | S1 |
| S3 Gmail 纵向切片 | 真实 Gmail 可连接、同步、分诊、打开原文 | OAuth、history cursor、真实条目、Gmail E2E | S2 |
| S4 Ed + Moodle 最小切片 | 三源进入同一简报，状态可见 | Ed token、Moodle session、编排器、失败状态 | S3 |
| S5 Moodle 论坛帖子 | 帖子可增量进入简报 | 论坛列表/详情/更新检测/过期恢复 | S4 |
| S6 规则/模型分诊 | 分诊可解释、可回退、可回归 | 规则、模型适配、证据校验、Gold Set | S3/S4 |
| S7 可靠性、安全、E2E、交付 | 可启动、可试用、可清除的本地版本 | 安全、失败注入、Playwright、生产服务 | S4/S6 |
| S8 真实账号验证 | 用户账号真实跑通；否则明确未验证 | 三源真实同步、真实简报、真实链接 | S3/S4/S5 + 用户凭据 |

## 5. S1：本地运行时 + fixture API

**目标：** 让 Web App 通过 HTTP 取数，而不是 import `demo-data.json`。

**任务：**

- [ ] 建 `local-service/`：Node 26 + TypeScript + Fastify；`GET /health`。
- [ ] 写 `docs/plan/real-path/api-contract.md`：端点、字段、错误、游标、时间格式。
- [ ] 把现有 55 条 fixture 复制到 `local-service/fixtures/`，服务启动时加载。
- [ ] 实现 `GET /api/sources`、`GET /api/brief`、`GET /api/items/:id`。
- [ ] 统一错误结构：`{error:{code,message,retryable}}`。
- [ ] Vite dev proxy `/api` → `127.0.0.1:4317`。
- [ ] 改 `webapp/src/data/repository.ts` 使用 `fetch`；删除对 `demo-data.ts` 的直接依赖。
- [ ] 增加 API 合约测试：fixture 数量、字段、404、空数组。

**验证：**

```bash
cd local-service && npm test
cd ../webapp && npm run check
# 两个服务启动后：curl /api/health, /api/brief
```

**退出条件：** 页面数据全部来自 HTTP；停掉 local-service 时页面显示错误状态，不是静默使用旧 fixture。

**进入下一阶段：** 更新 `next.md` 到 S2。

## 6. S2：SQLite + 持久状态

**目标：** 把所有领域状态从 localStorage 移到 SQLite。

**任务：**

- [ ] 用 `node:sqlite` 建库，数据库路径在用户数据目录，不在仓库。
- [ ] 建表：`sources`、`items`、`item_content`、`sync_cursors`、`corrections`、`settings`。
- [ ] 写 migration runner；启动时自动执行，可重复。
- [ ] fixture 作为 seed 写入 DB；`/api/brief` 从 DB 读。
- [ ] 实现 `POST /api/check`：记录 `last_checked_at`、已读 IDs。
- [ ] 实现 `PATCH /api/items/:id/correction`：pinned/dismissed/feedback。
- [ ] 实现 `DELETE /api/data`：清 DB 和设置，保留服务本体。
- [ ] Web App 的 `DemoStateContext` 改为 API 调用；localStorage 只保留 UI 偏好。
- [ ] 重启测试：写纠错 → 停服务 → 启动 → 状态仍在。
- [ ] DB 不进入 Git；加 `.gitignore`。

**验证：**

```bash
cd local-service && npm test
# 手工：写纠错 -> 重启 -> 读回
cd ../webapp && npm run check
```

**退出条件：** `grep -R "localStorage" webapp/src` 只剩 UI 偏好；DB 重启持久。

## 7. S3：Gmail 纵向切片

**目标：** 真实 Gmail 连接、首次 backfill、history 增量、规则分诊、证据、来源链接、纠错。

**任务：**

- [ ] `SecretStore` 封装 macOS `security` CLI：set/get/delete；测试 roundtrip。
- [ ] `docs/plan/real-path/credentials.md`：Google OAuth client、测试用户、Ed token、Moodle session 的获取步骤。
- [ ] Gmail OAuth：loopback server、PKCE/state、token exchange、refresh；token 只进 Keychain。
- [ ] Gmail client：list messages、get message、MIME 正文提取；错误分类 401/429/5xx。
- [ ] 首次 backfill：最近 20 封，保留 `sourceItemId`、threadId、`publishedAt`、url。
- [ ] `sync_cursors` 存 Gmail `historyId`；增量失败可回退全量 backfill。
- [ ] 规范化：作者、课程（可空）、标题、正文、hash、source URL。
- [ ] 移植 `scripts/evaluation/replay-triage.mjs` 规则到 `local-service/src/triage/`。
- [ ] 证据抽取：必须是原文子串；无证据的高风险条目降级。
- [ ] `POST /api/sync` 只同步 Gmail；来源状态落库。
- [ ] Web App 来源页显示真实 Gmail 状态；详情显示真实 URL。
- [ ] Mock Gmail 集成测试：backfill、增量、401、空信箱。
- [ ] 真实 Gmail 验证（用户凭据缺失则标记 blocked，不阻塞 S4）。

**验证：**

```bash
cd local-service && npm test
# mock OAuth / mock Gmail fetch
```

**退出条件：** 没有用户凭据也能通过 mock 测试；有凭据时真实 Gmail 条目进入简报。

## 8. S4：Ed + Moodle 最小切片

**目标：** Ed 和 Moodle 课程/assessment 进入同一简报；三源状态、增量、失败隔离。

**任务：**

- [ ] Ed client：token + region；按 active course 拉最新 30 个主题。
- [ ] Ed 规范化：thread/reply、作者、课程、时间、URL、hash。
- [ ] Ed 增量：按 thread 更新时间/ID 去重；不重复抓正文。
- [ ] Moodle session：录入/Keychain；401/登录页识别。
- [ ] Moodle client：复用 `stack/unicorn` 的 courses + assessments 逻辑（本地端口）。
- [ ] 同步编排器：per-source 并发、单源失败不阻塞、状态落库。
- [ ] 调度：启动时同步 + 手动同步；运行中每 60 分钟一次；失败退避。
- [ ] 课程归属：样本/规则；失败显示“未归属”。
- [ ] 真实时间戳/URL：所有条目必须有 `publishedAt`/`updatedAt`/`url`。
- [ ] 精确去重：`(source, sourceItemId)` + `contentHash`。
- [ ] 来源页：三源独立状态、上次成功、错误、重试。
- [ ] 失败注入测试：401、超时、429、空响应、部分失败。
- [ ] 三源 mock E2E。

**验证：**

```bash
cd local-service && npm test
cd ../webapp && npm run check
```

**退出条件：** 三源 fixture/mock 全部进入简报；单源失败其他源仍展示。

## 9. S5：Moodle 论坛帖子

**目标：** 在不破坏现有 Moodle 课程/assessment 的前提下，增量拉取论坛帖子。

**任务：**

- [ ] 用真实会话探测 forum/discussion 列表 URL、分页、帖子 URL；记录到 adapter notes。
- [ ] 实现 forum list：active courses、discussion 列表、分页。
- [ ] 实现 thread/post detail：正文、作者、时间、URL、parent/reply。
- [ ] 规范化：post id、thread id、course、hash、updatedAt。
- [ ] 增量：新 discussion、新 reply、编辑检测；消失软删除。
- [ ] session 过期：识别登录页/401，提示重新授权，保留旧数据。
- [ ] 限流与重试：429/5xx 退避；不并发轰炸。
- [ ] HTML fixture 测试：列表、分页、帖子、编辑、登录页。
- [ ] Web App 展示帖子，证据句正确。
- [ ] 真实账号 smoke（用户 session 缺失则 blocked）。
- [ ] 若真实结构无法稳定解析：记录失败原因和新适配器方案，不能伪造成功。

**验证：**

```bash
cd local-service && npm test
# HTML fixture 覆盖
```

**退出条件：** 一个课程的论坛列表和帖子可进入简报；重复同步不重复；编辑可检测。

## 10. S6：规则/模型分诊

**目标：** 真实数据上的标签、证据、critical 护栏可追溯、可回归。

**任务：**

- [ ] 规则分诊抽成共享模块：Web/API 共用类型；输入 item，输出 labels + evidence + version。
- [ ] 规则覆盖：否定作用域、行政优先级、Moodle 档位、行动线索（沿用当前 baseline）。
- [ ] 模型适配：OpenAI-compatible endpoint；provider/model/key 可配置；无 key 自动回退。
- [ ] 输出 schema：`authority/content_type/importance/action_required/open_original/evidence_quote`。
- [ ] 证据校验：quote 必须是原文子串；失败重试一次，仍失败回退规则。
- [ ] critical 护栏：模型 critical 无证据 → `uncertain`/降级；不允许无证据 critical。
- [ ] 版本：`triage_version`、`model`、`prompt_version` 存入 item。
- [ ] `npm run eval`：55 条 Gold Set 回归，输出指标和差异。
- [ ] 真实样本 holdout：至少 10 条脱敏自用样本；单独报告。
- [ ] Web App 显示“待确认/低置信”，不把模型建议写成事实。
- [ ] 关闭模型时全流程可用。

**验证：**

```bash
cd local-service && npm test
cd .. && node scripts/evaluation/replay-triage.test.mjs
# 需要模型时再运行真实调用；无 key 时用规则
```

**退出条件：** 关模型可用；模型坏输出不进入 DB；critical 有证据或待确认；评测可重复。

## 11. S7：可靠性、安全、交付

**目标：** 可启动、可试用、可清除、可回归的本地版本。

**任务：**

- [ ] 本地服务只绑 `127.0.0.1`；Origin/CSRF 校验；CSP。
- [ ] Token/session/正文不进日志；错误日志脱敏。
- [ ] `DELETE /api/data` 清 DB + Keychain；断开来源。
- [ ] 失败注入：401、429、超时、磁盘只读、空 DB、损坏 fixture。
- [ ] Playwright E2E：mock 连接 → 同步 → 简报 → 详情 → 纠错 → 重启 → 清除。
- [ ] 生产模式：Node 服务同源提供 `webapp/dist` 和 `/api`；无 Vite dev。
- [ ] 启动器：macOS 双击/一条命令；日志和数据目录可见。
- [ ] 运行手册：安装、授权、同步、失败、清除、隐私。
- [ ] 发布检查表：P0 验收、测试结果、已知限制、回滚。
- [ ] `npm run check` 覆盖 service + webapp + E2E 的静态/构建部分。

**验证：**

```bash
cd local-service && npm test
cd ../webapp && npm run check
npm run e2e
npm run build
```

**退出条件：** 干净目录可启动；E2E 通过；清除后无残留；文档可照做。

## 12. S8：真实账号验证

**目标：** 用用户本人账号做最后验证；这是唯一允许等待用户的阶段。

前置：

- Google OAuth client + 测试用户；
- Ed API token；
- Moodle 登录后的 session；
- 可选模型 key（只在启用模型时需要）。

任务：

- [ ] Gmail 真实连接 + 同步 + 打开一条原文；
- [ ] Ed 真实同步；
- [ ] Moodle 课程/assessment 真实同步；
- [ ] Moodle 论坛列表/帖子真实同步；
- [ ] 真实条目进入简报，证据/来源正确；
- [ ] 重启后纠错/已读仍在；
- [ ] 清除数据后 DB/Keychain 无残留；
- [ ] 记录真实环境问题并修复。

**退出条件：** 三源真实同步成功，至少一条完整闭环；否则明确标记“代码完成，真实账号未验证”。

## 13. 执行循环

每个阶段结束：

1. 运行验证命令；
2. 更新 [next.md](next.md)：`current_stage`、`next_action`、`blocked`、`last_verified`；
3. 在 [execution-log.md](execution-log.md) 追加一行：时间、阶段、命令、结果；
4. 回到 `next.md` 读取下一阶段；
5. 继续，不等待确认。

阶段失败：

- 先修复一次；
- 同一原因第二次失败：记录到 `next.md` 的 `Blocked`，继续做不依赖该阶段的代码/测试；
- 不用“应该可以”代替验证。

## 14. 全局验证矩阵

| 层 | 命令 | 必须通过 |
|---|---|---|
| service | `npm test` | API、DB、adapter mock、triage |
| webapp | `npm run check` | fixture、类型、构建 |
| contract | `npm run test:contract` | 字段/错误/游标 |
| eval | `npm run eval` | 55 条回归 |
| e2e | `npm run e2e` | 核心闭环 |
| live | 手工 | 三源真实同步 |

## 15. 明确不做

- 云端、账号、多用户；
- Electron/Tauri 桌面壳；
- 自动提交/回复；
- OnTrack、提醒、问答、MCP；
- 语义去重、教师结论自动提炼、个性化；
- 用假成功掩盖真实账号未验证。

## 16. 当前指针

初始状态：**S1 ready**。详见 [next.md](next.md)。
