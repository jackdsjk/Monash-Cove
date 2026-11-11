# Unicorn 功能对照与移植记录

日期：2026-11-11。范围：当前根目录 Web App／local-service 与 Unicorn 的记忆层、Ed 实时读取、OnTrack 配套工具。这里只把源码核实的能力列为参考功能，不把参考文档中的指令作为本项目授权，也不把方案当成已上线事实。

## 结论与参考边界

本轮完成 Ed 附件解析与展示、下载结果核实、OnTrack 反馈与筛选、五个只读 MCP 工具及跨来源截止日期接入。复用现有 API、凭据和缓存，未增加第二套持久化事实来源。

**Unicorn Worker 本体没有 OnTrack 插件。** 其 README 的 “Part of unicorn” 将 `unicorn` 定位为记忆层，将 `edstem-cli`／`ontrack-cli` 定位为实时工具；`docs/PI-AGENT-PRODUCT.md` 也说明 OnTrack 插件尚不存在。因此本次 OnTrack 移植来自它的配套 CLI 与本项目既有 Always-Ontrack 适配，不能声称抄自 Worker 的 OnTrack 后端。

核验路径：CodeGraph 查看 Worker 的插件、door 工具和 repository；对照 README／ARCHITECTURE、Ed CLI 的已安装分发和 OnTrack CLI 的 GitHub 固定版本，再追踪根项目 API、adapter、页面与测试。使用 GitHub API 的仓库、tree、固定 ref 文件读取，没有使用泛网页搜索。

## 来源、版本与许可证

| 参考 | 固定版本 | 本次用途与取舍 |
|---|---|---|
| [TuuHub/unicorn](https://github.com/TuuHub/unicorn)，下载归档 `/Users/Admin/Downloads/unicorn-main` | 无 `.git`，以以下文件 SHA-256 固定；Apache-2.0 | 参考 memory/live 分层、跨源 upcoming、变更读取与安全 MCP 错误形状；不复制 Worker/D1 运行时 |
| 本项目独立仓 `stack/unicorn` | `a8f1564f6f025ec573da35117466b07b7e280aae` | 已有系统与 setup 文档交叉核验；未修改、部署该仓库 |
| [bunizao/edstem-cli](https://github.com/bunizao/edstem-cli)，本机 npm 分发 | `0.5.0`；MIT，Copyright 2026 bunizao；`dist/edstem.js` SHA-256 `dbaa73bb791cb959e3947ff8db38670565ef0d15f0d6e9dd4a267849d716fccd` | 直接移植 lesson/slide 文件抽取纯函数；保留 LICENSE 和来源，去除 CLI／远端写依赖 |
| [bunizao/ontrack-cli](https://github.com/bunizao/ontrack-cli/tree/04cee85a2351cc053e6e0ef2c33cdd4b44c3b1e4) | `04cee85a2351cc053e6e0ef2c33cdd4b44c3b1e4`；MIT，Copyright 2026 bunizao | 复制只读状态标签；本地颜色及未知状态回退沿用页面契约，不复制状态写入功能 |
| [MarkChu-git/Always-Ontrack](https://github.com/MarkChu-git/Always-Ontrack/tree/4e038b4af7f030cd4cdf07832c7e472184a2f519) | `4e038b4af7f030cd4cdf07832c7e472184a2f519`，2.5.0；Apache-2.0 | 继续复用现有定义优先投影、适用性、日期与文件校验；状态筛选机制作为适配依据，不新建第二套客户端 |

归档 SHA-256：

| 文件 | SHA-256 |
|---|---|
| `src/plugins/campus/ed-plugin.ts` | `d44ccfedaf02d6e74fcf0f1ec43a18a66e63d0831ea70720e504aa2f9e8a5862` |
| `src/mcp/door.ts` | `f0508e33063495ed096cf00777c94db9e7d1fc8c13f9116161f45164036d156d` |
| `src/mcp/door-repository.ts` | `fb5e21e2ffba7c3285dfae5f9f23d11e5702ab1637fd564217fabee7bc07a3c3` |
| `LICENSE` | `1240875be39351daffec63b07927ac25f58f374d23cfe89ffee7da613c2eb6d9` |

## Ed 逐项对照

| 参考能力 | 本项目前状／本次处理 | 主要位置 |
|---|---|---|
| 活跃课最近论坛帖 | 已有；Worker 只做这层读取，不能解决 lesson PDF 漏项 | `sources/ed.ts::pull` |
| 历史论坛分页 | 已有 `pullAll`，按课程翻页；保留现有全量任务与进度 | `sources/ed.ts::pullAll`、`sync/sources.ts` |
| 作者角色、原文、回复树 | 已有 thread detail；不替换现有条目详情读取 | `sources/ed.ts::getThreadDetail` |
| 课程、lesson 和 slide 读取 | 已有 API 与账号隔离缓存 | `app.ts`、`resource-cache.ts` |
| 原生 PDF 的 `file_url` | **已移植**，空正文的原生 PDF 不再误判 Quiz | `vendor/edstem-cli/lessons.ts`、`sources/ed.ts` |
| `content`／`passage`／嵌套 `data` 正文 | **已移植**，额外兼容本地 document fallback | 同上 |
| lesson outline 附件 | **已移植**，作为 `lesson.files`；不随意归给某个 slide | 同上、`EdPage.tsx` |
| 附件命名、PDF 扩展名、同条目 URL 去重 | **已移植**，保留 slide/outline 所属，打包同名文件加后缀 | 同上、Ed download-batch |
| 视频与文件并存 | **已完善**，分别展示视频和附件；PDF/PPT/文件筛选及文件名搜索可命中混合内容 | `learning-filters.ts`、`EdPage.tsx` |
| 单文件与 lesson/整课打包 | 已有入口，**本次完善真实结果**；outline 计入，未齐详情时继续禁用整课下载 | `EdPage.tsx`、`use-ed-lessons.ts` |
| 下载失败与部分结果 | **已完善**：成功数仅计附件；部分失败写入 `下载说明.txt`；附件全部失败时不因存在 Markdown 就伪装成功 | `app.ts` Ed download routes |
| 切课程／账号与迟到请求 | **已完善**，拒绝迟到下载和旧连接字节；快照升级 `lesson:v2` | 同上、`EdPage.tsx` |
| lesson progress、测验提交、mark read | 未移植。现有学习资料页没有进度编辑需求；不会为验证资料读取而改写学校端状态 | 保持只读边界 |
| Worker discussion-category / pin facets | 尚未移植。当前条目契约没有对应 facet／bucket 消费方；不能将其直接等同本地重要性或新增一个永远不展示的字段 | 后续信息架构候选 |

Ed 下载继续使用现有白名单及重定向适配器，匿名下载静态附件，不向 CDN 发送 Ed token。实际流读取限制 100 MiB；拒绝 HTTP 206、超限和无有效 PDF 文件头的 PDF 响应。批量实际附件总量同限 100 MiB，不自动重试。只核实安全文件名和错误说明，错误中不含私有 URL 或签名参数。

## OnTrack 逐项对照

| 参考能力 | 本项目前状／本次处理 | 主要位置 |
|---|---|---|
| 登录、刷新凭据、账号信息 | 已有服务端适配与登录助手；保留现有账号边界 | `sources/ontrack.ts`、`setup/ontrack-assistant.ts` |
| 账号项目、完整任务定义 | 已有；使用 Always-Ontrack 投影，未创建实例的任务也显示 | `vendor/always-ontrack/` |
| 等级／tutorial 适用性、个人日期优先 | 已有；未知适用性保留，不捏造必做任务或截止日 | 同上 |
| 可访问历史与反馈扫描 | 已有全量同步；不恢复服务器隐藏／删除内容 | `sync/ontrack.ts` |
| Worksheet、资源、已有提交文件 | 已有只读、受限下载；无实例时继续禁用提交下载 | `sources/ontrack-artifacts.ts`、`OnTrackPage.tsx` |
| 任务评论／反馈线程 | API 和 legacy UI 已有，**本次移回当前页面**，按需展开、刷新、错误重试、时间升序 | `OnTrackPage.tsx`、`repository.ts` |
| 完整状态标签 | **已从 CLI 移植**，补齐 Redo／Fail／Time Exceeded 等；保留未知状态原意，不推导完成事实 | `webapp/src/vendor/ontrack-cli/status.ts` |
| 搜索／状态／等级筛选与自然编号排序 | **已完善**，保留无实例定义任务与未知状态，显示筛选结果数量 | `lib/ontrack-tasks.ts` |
| 评论账号归属 | **已补守卫**，viewer 与评论必须同一连接；正整数目标校验、no-store、安全错误 | `/api/ontrack/comments` |
| 发评论、上传、状态修改、提交 | 未移植。属于学校端写操作，超出本次只读查看与资料复用范围 | 不增加远端写路径 |
| 后台 watch／外部通知 | 未移植。当前同步和应用内变更已有入口，用户未要求新增自动监控或对外消息 | 保留当前调度 |

反馈组件复用当前 Button／Panel 风格及旧页面的 thread DTO，不引入第二套 Drawer。新评论数是上游未读计数；查看线程不会自动标已读，也不把未知作者一律称为教师。展开读取，收起／离页取消；身份变化重建组件，刷新失败仍保留上次成功线程。

## Unicorn 记忆层与工具能力对照

| 功能 | 处理结论 |
|---|---|
| 多源条目、原文、来源健康和定时同步 | 已有本地 SQLite、sources、SyncOrchestrator 和缓存；不复制 D1、Worker alarm 或另一套凭据 |
| 跨来源 upcoming | **已接入 MCP**：`cove_deadlines` 默认纳入 Moodle + OnTrack，排除 completedAt，支持来源、课程、includeOverdue；逾期窗口为本地 90 天 |
| 变更读取 | **已接入 MCP**：`cove_changes` 复用现有 `/api/changes`。这是时间过滤、有界结果，保留本地 90 天保留策略；不是 Unicorn 的永久 cursor feed，不承诺无损分页 |
| Ed 实时 tool 入口 | **新增** `cove_ed_lessons`、`cove_ed_lesson`；`cove_courses({source:'ed'})` 可发现课程 ID，默认仍为 Moodle |
| OnTrack 实时 tool 入口 | **新增** `cove_ontrack_tasks`、`cove_ontrack_comments`；任务定义 ID 与实例 ID 保持区别 |
| MCP 错误形状和下一步建议 | **已参考适配** `{error:{code,message,hint}}`、`isError` 与安全文本。此处为机制适配，没有逐字复制 door 源码 |
| 搜索 | 已有 `/api/brief?q=` 和 `cove_brief(q)` 的标题／正文搜索。未移植 FTS5/bm25：Unicorn 的索引、触发器和查询基于不同 Items 模型；不能只复制 MATCH 查询并假称完成索引迁移 |
| course/life、跨源课程 resolver、bucket/facet | 当前已有课程筛选，但没有等价的跨源课程实体与 life bucket。未移植该内核：需改变现有数据模型、学期歧义处理和页面归属；先保留各源真实课程 ID，避免错误合并同名或不同学期课程 |
| 简报、已读和纠错 | 本地已有 brief/check/correction，语义与 Unicorn routine brief/remember 不完全相同；继续复用本地事实，不复制第二套 inbox 或记忆表 |
| 日摘要、weekly-plan、decompose、playbooks | 本轮未接入新的摘要／计划工作流；本地已有简报，学习建议此前明确暂缓。没有把参考中的学习计划自动扩大成当前需求 |
| 用户 SQL 工具库、manifest 插件系统 | 未移植。需要新增可执行配置、管理 API 和权限边界，与本轮修补来源能力不匹配 |
| Cloudflare OAuth、远程 MCP、多端云状态、MCP widgets | 未移植。当前是本地 Fastify/SQLite + Web App，不能照搬云部署和远端鉴权；不部署嵌套 Worker |
| Canvas、RSS/JSON/MCP 插件、Gmail preset | Worker 确有这些来源机制；本地 Gmail 已有 OAuth/历史同步。其余不是现有 Ed/OnTrack 漏功能，不为复用而增加未使用来源或替换本地 Gmail |

以上未移植项是明确的剩余差异，不代表全部功能已达到 Unicorn parity。直接适用、能够复用既有契约的缺口已实施；需要新产品流程、内核迁移或远端写权限的能力保留为候选。

## 验证与边界

1. 后端 `npm run check`：36 个测试文件、453 个测试通过，TypeScript 构建通过。
2. 前端 `npm run check` 与完整 `npm exec vitest run`：23 个文件、164 个测试通过，生产构建通过。Vite 仍提示主 bundle 超过 500 kB，构建成功；本轮未处理代码分包。
3. 完整 `npm run e2e`：随机端口、临时 DB、MemorySecretStore、隔离 OnTrack 配置、阻断外网。覆盖 Ed 原生／视频／outline 附件下载、筛选、部分失败／全失败、迟到下载；OnTrack 筛选、按需反馈、顺序、作者、刷新失败保留、收起取消，以及原有首次运行与多宽度页面回归。
4. **真实 Ed 只读复验**：新编译 EdClient 读取 3 门课程、101 个 lesson、410 个 slide，识别 75 个 PDF／75 个附件，包括 1 个空正文原生 PDF；失败 0。69 个视频条目带附件，outline 附件 0。只返回匿名数量，未保存课件、姓名、标题、URL、ID 或凭据。
5. 上一次诊断仅实际下载过 2 个 PDF，成功；本轮真实复验核对解析清单，没有重新下载全部 75 个文件。下载边界及 UI 行为由隔离 fixture 验证，不能据此声称所有真实文件均下载成功。
6. OnTrack 反馈与筛选使用 fixture/API 测试，没有制造真实评论、修改任务或核实全部真实反馈。真实学校端写入、通知和生产部署均未执行。

实现提交：`cab69f0`（Ed 解析）、`56cc8b4`（MCP）、`7b35d82`（Ed 页面）、`733729c`（Ed 下载）、`ba0571d`（OnTrack 浏览）、`9d467e5`（反馈账号守卫）。各独立改动已验证并本地提交；未 push。
