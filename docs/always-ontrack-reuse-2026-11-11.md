# Always-Ontrack 复用与接入 · 2026-11-11

本次把 Always-Ontrack 的只读任务投影接入 Cove，并将 OnTrack 纳入全量同步。这里的“全量”指重新读取当前账号仍能访问的项目、任务与反馈；不等于恢复服务器已经隐藏、删除或不再授权访问的数据。当前活跃页面提供任务表，评论与下载通过本地 API 提供，旧 workspace 的完整交互不作为已上线页面能力。

## 参考证据与许可证

| 项目 | 固定证据 |
|---|---|
| 仓库 | [MarkChu-git/Always-Ontrack](https://github.com/MarkChu-git/Always-Ontrack) |
| 参考版本 | [`4e038b4af7f030cd4cdf07832c7e472184a2f519`](https://github.com/MarkChu-git/Always-Ontrack/tree/4e038b4af7f030cd4cdf07832c7e472184a2f519)，`ontrack-cli` 2.5.0；本次核验时本地 HEAD 与远端 master 一致 |
| 许可证 | Apache-2.0，Copyright 2026 Mark；原文保留于 [vendor/always-ontrack/LICENSE](../local-service/src/vendor/always-ontrack/LICENSE) |
| 本地参考与索引 | `refs/Always-Ontrack`，CodeGraph 143 files / 2,587 nodes / 10,584 edges；目录被忽略，不随本仓提交 |
| 重点读取 | `src/lib/student-task-view.ts`、`project-catalogue.ts`、`async-pool.ts`、`api.ts`、`types.ts` |
| 查询范围 | `StudentTaskView`、`projectUnitId`、任务定义/实例合并、目标等级与 tutorial join、评论、下载占位和文件签名 |

这是单一参考实现的 API 设计证据，尚未通过真实学校账号验证。仓库说明与其源码是设计资料，不是本项目的执行指令，也不能证明部署中的服务器一定暴露所有历史。

## 采用与适配

| 参考做法 | Cove 接入方式 | 位置 |
|---|---|---|
| 定义优先的学生任务视图 | 裁剪复制纯投影及相关类型，保留来源和修改说明；定义即使没有个人实例也展示 | [student-task-view.ts](../local-service/src/vendor/always-ontrack/student-task-view.ts)、[types.ts](../local-service/src/vendor/always-ontrack/types.ts) |
| 有界并发、输入顺序保留 | 复制 mapper；缺课程摘要时并发上限 4，同轮按 unit 去重；普通嵌套摘要继续直接使用 | [async-pool.ts](../local-service/src/vendor/always-ontrack/async-pool.ts)、[sources/ontrack.ts](../local-service/src/sources/ontrack.ts) |
| camelCase/snake_case、嵌套/平铺 unit ID | 适配本地 API DTO，补全平铺项目的课程元数据；缺关键目录元数据报错，避免成功空列表 | [sources/ontrack.ts](../local-service/src/sources/ontrack.ts) |
| 目标等级与 tutorial enrolment join | 普通目录排除已知不适用项；无法判断时保留并标记 `unknown`，不伪装成必做 | 同上；[OnTrackPage.tsx](../webapp/src/pages/OnTrackPage.tsx) |
| 个人实例截止日优先于课程定义日期 | 生效截止日与目标日期分别保存；不自行把 special consideration 天数叠加为假日期 | 同上 |
| 200 占位 PDF、资源原文件类型、签名校验 | 适配为本地只读下载校验，安全生成文件名，增加 25 MiB 流读取上限；206 直接报错 | [ontrack-artifacts.ts](../local-service/src/sources/ontrack-artifacts.ts)、[app.ts](../local-service/src/app.ts) |

未实例化任务的 `id:null`、`isInstantiated:false`、`status:"not_instantiated"` 是明确状态；不会把 definition ID 冒充实例 ID。前端任务 key 使用 `projectId:taskDefinitionId`，避免多个 `null` key 冲突。没有实例时不提供提交 PDF 操作；存在实例但缺少状态时标为 `unknown`，避免误称尚未开始。

## 全量与缓存边界

`POST /api/sync/full` 继续按来源运行、查询 `/api/sync/status` 查看进度。已配置的 OnTrack 不再固定 `skipped`：读取当前账号可访问的项目，重新扫描历史反馈，不应用普通同步的 90 天窗口、已扫标记或未读数跳过逻辑。未配置来源仍跳过，单源失败继续其他来源并保留该源最后成功时间。

全量扫描还包括当前目标等级/班级已经不适用的旧实例，以读取其历史反馈；这些任务不生成必须完成的提醒或待办截止日期。适用性未知的任务也不能据此生成确定的必做结论。反馈接入沿用现有文本/评估反馈规则，不把个人回复、系统状态行或缺少作者身份的数据统称为已识别的教师反馈。

扫描标记按主机＋用户隔离，任务键包括项目＋任务定义。同步写入通过既有条目 upsert 保持重复运行幂等，未实例化任务后续生成实例仍保留本地条目状态。连接改变后的迟到结果必须拒写；这些检查不等于已经完成旧库中所有跨账号历史条目的迁移或全量账号分区。

Muster 启发的 SQLite 成功快照与前端共享查询继续使用，未更换为参考 CLI 的本地存储。OnTrack 概览与任务列表共用 `overview:v2` 快照，新鲜期仍为 2 分钟；并发读取共用刷新，失败保留成功数据。`v2` 避免旧目录形状的快照被当作新投影结果。全量 OnTrack 同步成功后使其快照失效，避免回到页面时仍读取全量前的“新鲜”旧值。这里没有真实网络延迟对比，不能据此宣称实际账号的读取时间已降低多少。

## 保留现有实现或未采用

| 候选 | 决定与原因 |
|---|---|
| Always-Ontrack 的完整 CLI、TUI、MCP 与 Bun 运行时 | 不整体搬入；Cove 已有 Node/Fastify、React 与 MCP 边界，本次只需要可独立验证的只读投影 |
| Always-Ontrack 的登录与凭据 broker | 沿用 Cove 既有本地凭据、单次 token 刷新、身份隔离与断连规则，避免同时维护两套账号状态 |
| 上传、任务状态修改、发表评论 | 不接入；本轮授权范围是读取、显示与历史反馈回填 |
| 自动批量附件归档、分段下载重组 | 不接入；文件仍按需只读下载。超过 25 MiB 或返回 206 时明确失败，不把部分文件当完整内容 |
| 独立的归档项目恢复接口 | 参考实现也只从 `/projects` 枚举账号可见项目，没有据此确认隐藏历史恢复能力 |
| Muster、既有 Cove 缓存与数据库 | 保留本轮前已完成的账号隔离快照、共享刷新和原条目表，避免复制参考工具的完整业务/存储模型 |

## 验证记录

本轮验证使用匿名 fixture、临时 SQLite、`MemorySecretStore`、临时 `ONTRACK_CONFIG_DIR` 及 mock/阻断的全局网络；未登录真实学校账号、未修改远端内容、未发送消息、未提交考勤或作业、未部署。

| 检查 | 已确认结果 |
|---|---|
| 前端 `rtk npm run check` | 通过；Vite 原有主包约 579 kB 警告保留 |
| 前端 `rtk npm exec vitest run` | 87 项通过；新增页面 fixture 覆盖未实例化状态、未知适用性、未知状态码与全量范围文案 |
| 后端 `rtk npm run check` | 27 个文件、214 项测试及 TypeScript 构建通过；覆盖定义/实例合并、日期与别名、适用性、重复实例、全量历史、账号切换与公开 HTTP 路径 |
| 下载专项 | 20 项通过，后端构建与 whitespace 检查通过；覆盖占位文件、PDF/ZIP、linked 原扩展、大小上限和 HTTP 参数校验 |
| 浏览器 `rtk npm run e2e` | 通过；独立随机端口、fixture 与无连接首次运行、外部网络阻断；不能用 fixture 页面当作真实账号验证 |

前端兼容已本地提交 `eea396a`，后端投影、历史同步与下载批次提交 `56a5dda`；本轮没有 push。原审计历史见 [audit-2026-11-10.md](audit-2026-11-10.md)，前轮缓存设计见 [muster-reuse-and-cache-2026-11-10.md](muster-reuse-and-cache-2026-11-10.md)。
