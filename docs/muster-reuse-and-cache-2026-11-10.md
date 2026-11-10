# Muster 复用与页面读取缓存调查

日期：2026-11-10。状态：**已按用户采纳的五项优先改进实施基础版本；后端、前端及隔离浏览器回归通过。**

用户明确的慢路径是页面切换、课程和成绩读取。本报告承接 [全栈排查](audit-2026-11-10.md)，不替代其中的缺陷清单，也不调整 PRD 范围。

## 结论

已经补齐成绩、课程目录、Ed 学习内容和 OnTrack 浏览数据的 SQLite 成功快照，以及页面共享内存查询缓存。切回页面可显示已读数据；过期快照先显示再后台刷新，失败保留旧数据并提示。简报、Moodle 资料正文、考试时间表沿用原有本地读取流程。

本次采用 Muster 的成功快照、优先展示、后台刷新、请求合并、部分覆盖与账号代次隔离机制，在现有 Node/Fastify/SQLite 边界内适配；没有引入第二套 IndexedDB、Tauri/Rust 或 Redis，也没有复制参考项目业务代码。第 1–4 节保留实施前调查与取舍，第 5–6 节记录实际落地和验收。

## 证据范围与参考版本

- 当前项目：调查基线为根仓库 `2ae2cb0`，研究文档提交为 `6987bd2`；后续实施提交见第 6 节。调查使用已有 CodeGraph 索引做结构与调用关系查询，再按已定位文件读取实现。
- Muster：用户提供的 `/Users/Admin/Documents/Workspace/muster`，HEAD `ad2372683e0fbc4efb148af8b81840ae8dee5f39`；索引 121 文件、1,627 节点。没有使用 `refs/Muster` 的旧版 `c255e96` 代替它。
- unicorn：用户提供的 `/Users/Admin/Downloads/unicorn-main`，索引 108 文件、1,481 节点。该目录没有 `.git`，无法声称对应某个提交；本报告仅沿用上一轮确认的事件时间与来源隔离设计。
- unicorn 存档识别：`src/kernel/kernel.ts` SHA-256 `49c126b30596d790eb4bedcc7eec973c4b9ec816531a3075b2bd5e741c6871f0`；`src/runtime/cycle.ts` SHA-256 `d0a3b94eee3fc852065af4377e3065af2abb7038a5566d7fca4abe44944a8e0b`。
- 共分析当前项目及两个本地参考代码库；这是本地源码对比，没有进行网上功能声明收集、真实账号抓取或真实性能测量。参考仓库中的文档和指令仅作资料。
- Muster 为 PolyForm Noncommercial 1.0.0，复制时保留 `Copyright 2026 Poetrynan`、适用许可证与通知，并记录文件及版本；其品牌资产不在源码授权范围内。unicorn 为 Apache-2.0。本轮未复制业务代码。

## 1. 页面为什么慢（实施前基线）

| 页面 / 数据 | 当前读取路径 | 已确认的等待或重复工作 | 证据 |
|---|---|---|---|
| 成绩 | 页面挂载 → `/api/moodle/grades` → 会话验证、课程列表、各课程成绩 HTML | 每次进入重新抓取，未保存成绩快照；失败时页面将 courses 清空。90 秒是请求超时，不是缓存 | [GradesPage.tsx](../webapp/src/pages/GradesPage.tsx#L113)、[app.ts](../local-service/src/app.ts#L1253)、[moodle-grades.ts](../local-service/src/sources/moodle-grades.ts#L72) |
| Moodle 课程 / 每周资料 | 页面挂载先远端课程列表，选课后才读本地资料 | 课程列表每次远端读取阻挡本地内容展示；切课又清空当前列表。资料正文 GET 已从 SQLite 读取，不应误判为每次抓 Moodle | [MaterialsPage.tsx](../webapp/src/pages/MaterialsPage.tsx#L88)、[app.ts](../local-service/src/app.ts#L912)、[app.ts](../local-service/src/app.ts#L1151) |
| Ed 学习内容 | 课程列表 → lesson 列表 → 所有 lesson 详情 | 三段依赖；最后一段虽用 `Promise.all` 并行，但必须等整批详情结束才显示。切课清空 lessons，返回又抓整批 | [EdPage.tsx](../webapp/src/pages/EdPage.tsx#L96)、[app.ts](../local-service/src/app.ts#L1050) |
| OnTrack | 页面并行读 overview、tasks；两个 handler 都读 projects，再逐项目读 tasks | 同页重复读取同一批 projects/tasks；每个 handler 内按项目串行。失败时未保留业务快照 | [OnTrackPage.tsx](../webapp/src/pages/OnTrackPage.tsx#L82)、[app.ts](../local-service/src/app.ts#L649)、[app.ts](../local-service/src/app.ts#L701) |
| 考试时间表 | GET 读 SQLite；POST 才抓取并保存 | 已有读和同步分离；成功为空也保存同步时间，可作为其他页面的本地模式 | [app.ts](../local-service/src/app.ts#L253) |
| 简报、资料正文、作业资料包 | 读数据库 / 全局 store | 不需要重新搭建完整缓存系统；应针对慢的远端读取补齐 | [app.ts](../local-service/src/app.ts#L1151)、[app.ts](../local-service/src/app.ts#L1164) |

路由容器使用 `key={route}`，页面切换卸载组件；全局 StoreProvider 虽然保留，但尚未承载上述课程、成绩、lesson 的查询结果：[App.tsx:47](../webapp/src/App.tsx#L47)。问题不只在动画、SQLite 查询或渲染速度。

当前已有的其他优化也应保留：成绩按课程抓取的并发上限为 **4**；全量同步 `FullSyncJobs.begin()` 会拒绝重复启动；Moodle 图片代理已有 `private, max-age=300`。这些分别是并发控制、任务防重和资产 HTTP 缓存，不能替代成绩等业务快照，也不能据此说系统完全没有缓存或防重。

### 隔离基线：成绩读取

用 Fastify `inject` 请求真实 HTTP handler，内存数据库、`seed:false`、MemorySecretStore、模拟两门课程；`ONTRACK_CONFIG_DIR` 指向空临时目录，同时阻断全局 fetch，只允许注入的 fixture fetcher。五次 API 响应均为 200，均返回两门课程，未触发全局网络。

| 场景 | 上游模拟请求数 | 说明 |
|---|---:|---|
| 读一次成绩 | 5 | `/my/` 两次、课程 AJAX 一次、成绩 HTML 两次 |
| 连续读两次 | 10 | 第二次没有命中成绩结果缓存 |
| 并发读两次 | 10 | 相同请求没有合并到同一个抓取任务 |

这验证了实施前正常路径每次约 `3 + N` 次上游请求，**没有测量真实 Moodle 耗时**。表中代码位置对应调查基线，后续修改可能使行号移动。脚本与结果位于忽略目录 `build/audit/2026-11-10/cache-baseline.mts`、`cache-baseline.json`；本机复验：

```bash
rtk proxy local-service/node_modules/.bin/tsx '/Users/Admin/Desktop/Monash Agent/build/audit/2026-11-10/cache-baseline.mts'
```

脚本是本机复现材料，不随 Git 文档分发。Moodle 成绩已有部分失败容错：个别课程失败会跳过，仅全失败时报错；未来快照必须保留失败课程上次成功的数据并标明状态，不能把缺失结果直接解释成课程删除或没有成绩。

## 2. Muster 实际怎么做

| 机制 | 源码事实 | Cove 适配方式 |
|---|---|---|
| 跨启动保存成功数据 | `src/services/idbStorage.ts:16–128` 用 IndexedDB 保存 Zustand persist 的 JSON；`src/stores/useAppStore.ts:627–720` 保存课程、资料、成绩及课程固定 tab 等最后副本 | 业务快照存现有 SQLite，前端只缓存查询结果。单页应用不直接接管学校凭据 |
| 页面优先读 Store | `src/pages/CourseDetail.tsx:82–165` 用已缓存的 dashboard、schedule、recordings 等初始化页面；缺失数据才按需抓取。后台已覆盖本课时等待它，不再启动相同抓取 | 路由重新进入读取共享缓存；冷启动读取本地 API；旧数据可见时显示后台更新状态 |
| 同步 single-flight | `src/services/backgroundSync.ts:51–112` 同一 session epoch 加入现有 Promise，onData 分批合并，成功才更新 lastAutoSyncAt | 同账号/资源的刷新共用任务；课程一批成功便更新，不必等所有来源结束 |
| 请求级去重 | `src-tauri/src/moodle/http.rs:46–156` 相同 URL 合并在途请求；单轮同步的 scoped cache 只保留成功页面 | 后端 adapter 建立账号隔离的请求合并；单轮复用 `/my/` 等页面，减少重复认证探测 |
| 有界缓存与退避 | 同文件限制条数、总字节与单页大小，FIFO 淘汰；不缓存错误或登录跳转；429/503 使用 Retry-After cooldown。`throttle.rs` 统一控制并发与请求间隔 | 请求合并和业务快照分层；限制内存、遵守退避，不以提高并发替代请求减少 |
| 课程指纹与部分覆盖 | `src-tauri/src/moodle/scraper.rs:2972–3056` 比较课程主页面 fingerprint；`useAppStore.ts:727–848` 传入 cachedWeeks、待复查状态、缺失固定 tab；coverage 区分成功为空与从未抓取 | 按课程 / 数据类型记录覆盖时间，逐步减少历史内容重复抓取；优先补缺和用户正在看的课程 |
| 账号隔离 | `backgroundSync.ts:62–80` 用 epoch 与取消控制丢弃迟到结果；persist 记录 cacheOwnerEmail，缓存不等于有效登录 | 先修复已确认的 OnTrack 账号缓存串用，再为快照与在途任务绑定账号和凭据版本 |

两个容易误抄的细节：

1. Muster 的 HTML cache 是**单轮同步缓存**，不是永久缓存，也不是全局固定五分钟 TTL；其容器是 FIFO，不能称为 LRU。课程主页指纹未变仍需复查公告、录播、提交及成绩等不一定改变主页的数据。
2. Muster 的自动同步不是每次切页抓取：默认 `syncOnLaunch:false`、`autoSyncIntervalDays:7`，Dashboard 挂载时按设置判断是否启动，不用固定定时器持续全量同步（`Dashboard.tsx:1071–1101`）。这是参考项目策略，不建议把七天直接用于 Cove 的成绩与截止日期新鲜度。

## 3. 调查时已移植的逻辑与缺口

当前 `webapp/src/lib/muster/` 已有移植代码和测试，不能把文件存在当作完整功能已接入：

| 模块 | 当前使用情况 | 值得补什么 |
|---|---|---|
| `gradeBreakdown.ts` | `GradesPage` 已调用 `buildCourseGrade` | 保留算法，优先补成绩读取快照和失败回退，无需再复制一遍算法 |
| `submissionState.ts` | `resolveSubmissionState` 目前只有测试调用 | 与后端提交证据模型统一后适配接入；保留 unknown、submitted、graded 及人工覆盖的区别 |
| `summaryFreshness.ts` | 两个 hash 函数目前只有测试调用 | 后续摘要功能用数据变更决定过期；本轮读取速度问题不需要新增 AI 生成 |
| `examSignature.ts`、`examSchedule.ts` | `examSignature`、`examErrorKey` 目前只有测试调用；考试页面走已有 Portal 路径 | 有实际条件请求 / 去重需求时再接入；现有 SQLite 考试功能已存在 |
| `utils.ts` | `getEffectiveAssignmentStatus` 未发现调用 | 先统一状态契约；不把一个前端 helper 当后端数据完整性的替代 |

以上调用判断来自 CodeGraph 调用关系。Muster 的 Tauri/Rust API 与 Cove 的 Node/Fastify 边界不同：纯函数较适合逐文件适配；抓取调度和持久化需要移植机制。另一个参考 unicorn 的首次发现时间与来源隔离机制仍值得采用，具体缺陷与证据见上一轮报告 06、12；本轮优先解决已明确的读取问题。

## 4. 用户采纳的五项优先改进（原始方案）

按本次目标的用户影响、工作量、风险和适配程度排序；没有用户规模或耗时样本，不编造 ICE/RICE 精确分数。工作量是相对估计，并非工时承诺。

| 顺序 | 改善 | 当前缺口与参考做法 | 影响 / 工作量 / 主要风险 |
|---|---|---|---|
| 1 | 页面返回直接显示，重启仍能读上次数据 | 课程、成绩、Ed、OnTrack 增加账号隔离的 SQLite 快照 + 前端共享查询缓存；参考 Muster persist 与课程页初始化 | 高 / 中 / 缓存过期与账号串用；与本次目标最直接一致 |
| 2 | 同一资源只刷新一次 | 合并成绩并发请求、OnTrack overview/tasks 的重复读取、同步与页面的相同抓取；复用 Muster single-flight 与 scoped PageFetcher 思路 | 高 / 中 / 取消和失败清理，不能让失败 Promise 永久占住刷新 |
| 3 | 逐课程展示与局部刷新，失败不清空整页 | Ed 不等全部详情才能显示；成绩成功课程逐批更新；为各课程/数据类型记录 coverage，允许重试失败部分。已有进度任务与按课程资料同步可继续复用 | 高 / 中偏高 / 部分成功与空结果语义、跨课程数据错配 |
| 4 | 当前学期与课程偏好参与同步 | 参考 Muster hidden/pinned、active semester、新课补抓、历史缓存复用；当前资料同步仍遍历所有返回课程，Drawer 仍用静态 COURSES | 中 / 中 / 误推学期造成漏数据；保留“显示全部”和强制刷新，使用真实课程 ID，不只靠课名猜测 |
| 5 | 作业提交、评分、人工完成状态一致 | 接好已有 submissionState 思路，统一后端证据和前端完成显示；Muster 对已提交未评分项继续复查，不能把已提交直接视作永远不变 | 高 / 中 / 语义错误会隐藏截止提醒；先定义证据与人工覆盖规则，参见排查 09 |

候选中暂缓：

- **统一下载中心**：Muster `DownloadCenter.tsx:41–114` 已有跨页面的下载记录、进度和速度；当前页面已有多选、整课 ZIP 与局部下载状态。后续可补全局任务记录、按课程/周归档与失败重试，但这些不解决成绩首屏等待。参考实现并非可靠断点续传的证明，不能直接宣称支持。
- **课程固定信息页**：联系人、课程概览、课表、录播的缓存与按需加载可参考 `CourseDetail`；先解决已有页面速度，不新增整组页面。
- **日历、系统通知、AI 课程总结**：属于后续产品选择；已有截止页和考试功能，不应以“参考项目有”直接扩张当前范围。
- **Tauri 全套迁移、复制品牌视觉、引入 Redis**：现有 React + 本地 Node/SQLite 足够承载目标，没有证据支持为这次问题换壳、增加网络缓存服务。

## 5. 缓存设计与实际落地

| 改进 | 已实施 | 边界与后续优化 |
|---|---|---|
| 共享查询与持久化快照 | [query-cache.ts](../webapp/src/data/query-cache.ts)、[resource-cache.ts](../local-service/src/resource-cache.ts)、SQLite `resource_snapshots`；四个页面接入缓存状态与手动刷新 | 前端缓存随进程结束；重启由后端快照承接。单项 8 MiB、每源最多 1000 项 / 96 MiB；清本地数据覆盖快照 |
| 同资源请求合并 | 同身份、资源、代次共用刷新任务；OnTrack overview/tasks 共用快照，项目读取并发最多 4 | 尚未实现跨 API 的单轮 HTML 页面缓存，仍可能重复读取认证页 |
| 分批展示与部分覆盖 | Ed 先展示索引、详情最多并发 4、逐批补齐；成绩失败课程保留旧数据及覆盖时间；资料沿用单课同步 | 成绩首次冷启动仍等待本轮结果，未做逐课程流式响应；未做课程主页 fingerprint |
| 学期与课程偏好 | Materials 同步范围面板、`GET/PATCH /api/moodle/course-preferences`，成绩快照键包含范围 hash | 默认全部学期；只识别显式学期标记，未知学期保留；隐藏优先于置顶。仅约束批量资料与成绩，单课资料可手动刷新，不删除旧资料，不改变简报抓取范围 |
| 提交与完成一致 | Drawer、Brief、Deadlines 读取后端 `completedAt`，写入失败保留原状态；后端区分提交、评分与人工覆盖 | 30 天内已提交未评分继续复查；`Not yet graded` 不当作已评分。适配状态语义，没有机械接入未使用的前端 helper |

OnTrack 另已修复账号 token 缓存隔离与主动断开后的 CLI 回退；凭据变化拒绝迟到结果，出站请求使用超时。所有凭据写入路径均推进缓存代次。当前以源、凭据 SHA-256 指纹、资源与版本隔离；无法证明同账号的凭据更新保守作为新连接处理，不跨新指纹沿用快照或课程偏好。

以下为采纳时的设计要求；具体响应字段、容量与维护契约以 [local-service/README.md](../local-service/README.md) 为准。设计中 HTML 单轮缓存、fingerprint、同账号续期保留和成绩流式展示尚未落地，不能视为已完成。

### 数据边界与查询流程

保留后端持有凭据和数据库的边界：页面 → 共享查询缓存 → 本地 API → SQLite 快照；只有刷新任务通过 source adapter 请求学校服务。

1. 页面重进立即使用同账号、同资源的内存结果；没有内存结果时读 SQLite 快照。Moodle 课程目录也必须本地可读，否则即使资料已缓存，入口仍被远端课程请求阻挡。
2. 仍在新鲜期则不抓上游；过期但已有快照时先返回旧数据并启动后台刷新。首次完全无快照才显示加载状态并等首批结果。
3. 手动刷新跳过新鲜期判断，但加入该资源已存在的刷新任务；每个成功分片事务写入，失败不覆盖成功快照。
4. 前端与后台刷新共用资源状态。Ed 首先展示 lesson 索引，详情按当前选择加载或以有界并发补齐；下载整课时另行确认所有必要详情已读取，不能把首批当全量。
5. 延用现有全量同步任务/查询约定，补足读取快照与局部刷新能力；是否新增端点、响应字段及数据库迁移应在实现阶段明确，研究报告不擅自更改现有 API。

### 缓存键、失效与时间语义

- 键至少包含 `source + instance/baseUrl/region + stable account ID + resource/course ID + schemaVersion`。账号身份未解析时使用连接代次隔离，不借用其他账号缓存；token 明文不得成为键、日志或前端字段。
- 每次连接、断开、替换凭据推进 credential generation：取消旧任务、清理相关内存结果，旧结果提交前再次核对代次。同账号合法续期可保留成功快照；账号变化不可展示旧账号数据。
- 成功空集合必须有覆盖标记；缺失、失败、空结果分别表达。部分抓取失败不代表资源被删除，只有完整成功且可证明的结果才用于删除协调。
- 状态记录成功快照的 `fetchedAt`、最近有效检查的 `checkedAt`，另有 `refreshing`、`stale`、失败信息与覆盖范围；失败检查时间不能替代最后成功时间。页面打开时间不得显示成“刚同步”。
- 凭据失效标记需要重新连接，既有同账号快照可按本地数据策略只读展示并提示；用户明确断开或切换账号时立即隐藏。清理本地数据必须覆盖新增快照表；保留/删除策略在实现时明确。
- 一般网络失败保留旧快照并退避；401/登录 HTML/错误 JSON 不得写为成功快照。请求合并按账号与连接代次隔离；一个页面卸载不能取消其他订阅者仍需要的共享任务。
- 持久化快照应有 schema 版本、容量/保留策略；HTML 只作有界的单轮缓存，不把整个校园站点永久塞入数据库或浏览器。

### 当前默认新鲜期

以下初值已经用于实现，不是 Muster 配置，也不是按真实账号耗时调优得出的最佳值。TTL 控制何时后台检查，不意味着过期就删除旧数据。网络失败保留旧值并退避 30 秒，手动刷新可立即重试。

| 数据 | 默认新鲜期 | 刷新触发 |
|---|---|---|
| 课程目录 | 6 小时 | 首次连接、手动刷新、开学期切换时优先重新发现 |
| 成绩 / 提交状态 | 5 分钟 | 过期后可见页面后台刷新；手动立即检查，已提交未评分继续纳入 |
| Ed lesson 索引 / 详情 | 15 分钟 | 课程进入或查看具体 lesson；下载前补齐未取过的详情 |
| OnTrack 项目 / 任务 | 2 分钟 | 可见页面过期刷新，概览和列表共享一次结果 |
| Moodle 资料 / 考试快照 | 沿用明确的同步流程 | 补充覆盖和新鲜度展示，暂不为已经本地读取的端点重复建设缓存 |

先采用请求计数与用户可见状态做验证，再按真实使用反馈调整 TTL 和并发；不能承诺未经测量的“秒开”或固定倍数提速。

## 6. 实施提交与验收

原定分批验收目标如下；完成状态与实际限制见本节后续结果及第 5 节：

1. **成绩 + Moodle 课程目录试点**：先定义账号/代次、快照读写与失败语义，再接共享查询缓存。两门课程的同资源并发刷新应只执行一轮抓取；新鲜期内重复读快照的上游请求数为 0；应用重启仍能读上次成功结果。
2. **扩展 Ed / OnTrack**：复用试点机制；同一次 OnTrack 刷新不重复抓 projects/tasks；Ed 首批可见后其余详情继续加载，切回已读课程不清空为等待页。
3. **增量与一致性**：按课程覆盖、课程偏好、学期、指纹减少重复抓取；接入提交证据。指纹未变仍检查动态状态；成功空、部分失败、已提交未评分、新学期新课程均有验证用例。

共同验收：错误保留旧数据与最后成功时间；账号 A → B 后 A 的迟到请求不得展示或落入 B；同账号凭据续期与真正换账号分别测试；首次无数据、成功为空、过期、离线、会话失效、手动刷新与任务取消分别覆盖。以真实页面操作复验“成绩 → 资料 → 成绩”，检查渲染首批内容的时间和上游请求数。

实现时运行 `rtk npm run check`（`local-service` 与 `webapp`）、`rtk npm exec vitest run`（`webapp`），并修复已有过时选择器后单独跑浏览器 smoke；不允许用预置 fixture 冒充首次连接验证。性能实验继续使用空 OnTrack 配置目录和全局网络隔离。

实施已按完成批次本地提交，未 push：`19dbb6a` OnTrack 身份；`17ac1de` 前端缓存；`e42aeb0` 状态一致；`648bcaf` 后端快照；`928ae81` 同步范围；`167dac1` 当前路由 smoke；`0ec2e7a` 身份异步检查竞态；`13209f7` 未评分复查。

验证结果：

- 后端 `rtk npm run check`：24 文件、162 项测试及构建通过；前端 `rtk npm run check` 通过，单独 `rtk npm exec vitest run`：11 文件、75 项测试通过。
- 更新后的 `rtk npm run e2e` 通过。隔离浏览器分别覆盖四源全断开与 seeded 状态；首次设置仍为占位页，本次没有修复 onboarding。
- HTTP 回归：模拟两门课程，两次并发成绩读取合并为 5 次上游请求；新鲜期再次读取增加 0 次。隔离浏览器一门课“成绩 → 资料 → 成绩”累计请求数为 **4 → 6 → 6**。这是 fixture 请求计数，不是真实 Moodle 耗时或提速倍数。
- 成绩强刷 503 后旧值与最后成功时间保留；详情标完成后截止页与重载一致；完成状态 PATCH 503 保留原值并显示重试提示；课程隐藏、恢复和保存失败草稿均验证。浏览器 `pageErrors=[]`，实际外网调用为 0。
- 本机材料：`build/audit/2026-11-10/cache-browser-regression.json` 及同目录匿名截图。临时服务和浏览器均已关闭；没有访问真实账号、提交考勤、发送消息或部署。

已同步包级 README、根 AGENTS、开发日志及审计处理状态。原审计 14 项中处理了 05、09、11、13，其余 10 项仍待修复，不能据本次通过的检查宣称全项目问题已解决。
