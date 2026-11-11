# Muster 成绩规则与漏接权重排查

参考用户提供的 Muster，版本 `ad2372683e0fbc4efb148af8b81840ae8dee5f39`，Copyright 2026 Poetrynan，PolyForm Noncommercial 1.0.0。保留两端 vendor 的 LICENSE/NOTICE。

## 根因与数据边界

现场匿名计数确认：Grades 有已发布分数，但七门课程的逐项 weight 全为空；前端要求所有项目权重齐全才显示汇总，默认又选中了没有评分项的第一门课程。此前只接入计算器，遗漏 Assessments 分类权重来源。

后端参照 Muster 读取课程导航指向的 Assessments（旧模板回退 section 56），保留分类及其活动链接，再通过同课程活动 ID／唯一规范名称匹配 Grades。Assessments 只提供结构和权重，不能创造分数或将普通资料列入 Grades。结构失败时仍返回原始成绩并单独提示。

## 规则核对

| 上游规则 | 本地处理 |
|---|---|
| Grades `.gradeitemheader` 才是评分项；分类小计不重复计入 | 后端成绩解析与资料关联共用此判断 |
| 比例、百分比、已知满分裸分；0 合法，字母不能猜数值 | 复用原计算器；保留原文以显示字母成绩 |
| Widget 分类权重权威，子项继承的分类权重不重复累计 | API 保留 isCategory/categoryId/categoryWeight |
| 同名分类按 ID 区分 | 不按标题合并 |
| 子项名称明确百分比先保留，其余均分剩余；矛盾时分类均分 | 原样复用 `shares` |
| 空分类（如期末考试）保留为待评分权重 | 原样复用 placeholder |
| 旧模板只用明确的项目正权重 | 不为缺失权重随意均分整门课 |
| 多套结构总和超过 100.5%，剔除重复空结构 | 原样复用计算器逻辑 |
| earned/graded/pending/hidden 分开 | 不将未出分或字母成绩当成 0 |
| 权重和距 100 小于 0.5 才算完整 | 部分权重不拉伸成 100 |
| 普通及格线 50，hurdle 不建模 | 推算明确限定，不代替课程规则 |
| 公布课程总分是独立来源 | 不用累计已得分伪装正式总评 |

未找到 Muster 的 WAM/GPA 计算实现；其链接页引导至 WES。缺少正式历史总评与学分时不推算 WAM/GPA。

## 验证边界

后端匿名 fixture 覆盖分类、重复名称、空考试、无链接替代项目、旧模板、导航、显式零权重、Grades 匹配和结构 HTTP 失败。309 项后端测试及类型构建通过。

前端将结构直接传入原计算器，明细从计算结果读取子项份额。未知权重不抹去已知贡献；均分只覆盖可用的已知评估，权重不全时不推算及格要求。字母成绩算已发布，保留原文，已发布但不可换算的权重单独标色。默认跳过空成绩册，仍允许用户手动选择。

130 项前端测试、数据检查、类型构建及隔离浏览器回归通过。浏览器覆盖首个空课程、分类权重分摊、空考试、字母成绩、未知权重仍显示原始分数、公布总评不冒充已得分。

真实接口仅检查匿名计数：七门课中三门读到分类结构，其中一门可计算已发布部分均分，另一门因存在不可换算成绩而不提供完整均分；另有一门没有已发布分数。其余四门中一门无评分项，三门尚未读到可用结构。所有真实项目仍保留原始成绩；未逐项核对教师评分与课程 hurdle，不保存成绩、反馈或凭据。

## 差异复核与实施状态

对照本地 Muster v0.5.1 的抓取、状态、计算、同步、展示、提醒和诊断后，用户授权实施除学习建议之外的成绩改进。以下为当前状态；前文真实接口计数来自首次实现前后的历史核对；后续源页面模板复核见下文，不将匿名 fixture 结果当成真实成绩验收。

`gradeBreakdown.ts` 和上游测试继续保持原样（仅类型 import 路径不同），不另写一套计算器。Node/Fastify 与 Rust/Tauri 的边界不同：纯 TypeScript 逻辑直接适配，HTML 解析规则和请求调度移植，系统通知改用应用内横幅；不引入 Tauri、Redis 或新的持久数据源。

| 规则／能力 | 采用的 Muster 证据 | 本地实现与边界 |
|---|---|---|
| 分类标题权重回退 | `scraper.rs:1023–1027` post-processing | `assessment-structure.ts` 在权重栏缺失时读分类标题，显式栏值及 0 优先；子项份额仍交原计算器 |
| 详情补全及隐藏评分状态 | `enrich_assessment_statuses:1249`、submission parser:1645、feedback cleanup:1844 | `vendor/muster/grade-details.ts`；只为同课程 Grades 已确认的同源 assign/quiz 补分数、反馈和状态。未变的公开成绩详情复用既有快照 30 分钟，过期或分数变化重读；待评分／隐藏分数仍每轮复核。Grades 已有分数优先；0、字母与未知满分保留，日期原文不猜时区 |
| 测验完成与成绩 | quiz parsers:5258、5296 | Finished／final grade／attempts；排除日期形似分数和 rubric/navigation。无截止日期或较旧的 Grades 项也复核，不将普通练习加入成绩 |
| 独立 Overview | fetch/parse_grade_overview:2766、2785 | `/grade/report/overview/index.php` 原文进入 `overviewGrade`，不猜裸分满分 100；明细表为空但有 Overview 的课程仍展示。真实 HTTP 404 仍是失败 |
| 增量同步成绩复核 | `recheck_assignment_statuses:1135` | 普通、定时和全量 Moodle 同步都更新既有账号／范围成绩快照；内容未变也复核。成功后前端非 force 重读本地快照，不再发一轮上游抓取。确定 submitted/graded 才更新本地完成事实；未知不擦除，显式用户决定优先 |
| Assessments 局部失败 | 参考失败保留与按项目合并机制，本地适配 | `moodle-grade-refresh.ts` 保留同范围旧结构及成功时间并标 stale；对当前 Grades 重新匹配，不复用旧 gradeItemId。分区失败而主页有结构时回退主页；未知详情不擦除此前成功的活动结果 |
| 分类明细、风险与读屏 | `GradeBreakdown.tsx` CategoryBlock/useOutlook/GradeBar | 每类已得／总权重、子项份额、hidden 与空考试占位；进度图文字语义及图例。风险只在完整权重且分数可读时显示，不套用原组件对部分权重的过强结论 |
| 学期、隐藏与置顶 | Dashboard displayCourses:1282、1315 | 成绩页本地筛选，复用服务端短名及既有范围设置；未知学期保留，隐藏优先、置顶优先排序。切视图不访问上游 |
| 首页入口 | Dashboard course-grade summary | Brief 与 Grades 共用 query，首页最多展示三课摘要；断开来源时不请求成绩，也不展示旧账号摘要 |
| 成绩变化提醒 | Dashboard Overview diff:770 | 已有同课程／同项目基线后比较发布值；首次读取、课程／范围首次发现不提醒。事件 UUID 不含分数，随快照最多保留 30 天／20 条；关闭标记只存内存 ID、最多 500 条，浏览器重启后重置，不产生系统通知 |
| 结构诊断 | `diagnostics.ts:33,42` | 查看及复制匿名结构计数、权重、格式和 warning 布尔值；不包含课程名、ID、URL、分数、反馈、outcome 或原始错误 |
| 页面共享缓存与冷却 | `moodle/http.rs` PageFetcher:46、79；throttle | `moodle-page-reader.ts` 单轮成功 HTML 复用及请求合并；800 条／96 MiB 留存、单页 8 MiB、20 秒。每轮重置，取消独立，连接变化拒绝旧页。transport 的 429/503 共享 Retry-After 冷却，默认 5 秒、最多 60 秒，可延长和中断，不自动重试 |
| 学习建议成绩事实 | `studyGuide/facts.ts`、StudyGuidePanel | **按用户要求暂不实施**，未新增学习建议入口或模型成绩上下文 |

成绩与作业资料继续共用 `grades:v9:<range>`，刷新身份、范围、代次校验保持不变。整课失败保留旧课及原 coverage，结构／详情失败在课程字段单独提示；不把错误或登录页写成成功结果。首次无旧结构时不能宣称保留了旧权重。

### 源页面模板复核与补修

截图反馈后，通过现有本地接口及只读源页面核对结构，定位两种此前 fixture 未覆盖的版式：导航中周标题含 `assessment` 时，宽泛匹配误选该周而非专门的 `ASSESSMENTS`；部分课程只有平铺 `.assessment-item`，既无分类头，也不属于 `li.activity`，因此显式标题权重未被解析。前者改为准确名称优先并保留重复链接的多种标签，后者沿用 Muster 的行／链接选择器扩展平铺分支，读取逐项权重；括号内 `Case study 1 - 10%` 后缀也保留。SCORM/H5P 活动必须匹配 Grades，未关联项只保留待评结构，不创造成绩。

这些平铺布局未被 pinned Muster Type A/B 覆盖，属于本地适配扩展，不能声称直接复制。快照升为 v8，避免继续使用缺失结构的 v7。fixture 覆盖误选周次、重复导航标签、平铺权重、SCORM/H5P、显式 0、无链接替代行、外站、去重与端到端 Grades 匹配。

真实读取仅核对源页面版式、结构权重完整性、匹配计数和前端是否可计算；未落盘或提交真实 HTML、分数、反馈、账号与凭据。仍有来源限制：`Pass` 不证明数值百分比，不能直接按 100 换算；Moodle 仅列未出分项目时不能推断其他平台成绩。学习支持页的空表也不代表正式课程零分。没有逐项核对教师判分与课程政策。

### API 增量字段

`GET /api/moodle/grades[?refresh=1]` 仍返回 `{ courses, cache }`：

- item 增加 `gradingState`（graded/submitted/pending/unknown）、`gradeSource`（gradebook/activity）及详情成功时间 `detailFetchedAt`。
- course 增加 `courseShortName`、`overviewGrade`、`overviewWarning`、`detailWarning`、`assessmentFetchedAt`、`assessmentStale`、`gradeChanges`。
- 变化事件为 `{id,kind:released|changed,itemName,detectedAt}`；不包含前后分数。源响应中的成绩与反馈仍仅存在已有本地数据边界内。
- `POST /api/sync` 的 Moodle 成功响应可能有 `gradeWarning`：表示内容同步完成但成绩复核有局部问题，成绩页用快照错误显示原因。全量任务对应来源 message 保留此提示。

### 验证和限制

2026-11-11 最终检查：后端 `rtk npm run check` 35 文件／371 项测试及构建通过；前端 check、22 文件／152 项 Vitest 通过。既有 Vite 大于 500 kB chunk 提示保留。

隔离浏览器 smoke 覆盖 Overview 原文、隐藏评分、分类与空考试、结构诊断无敏感内容、学期切换请求数不增加、首页与成绩页共享查询、提醒关闭及路由去重、全断开首次运行不读成绩。服务使用随机端口、临时 SQLite、MemorySecretStore、临时 OnTrack 目录和阻断／mock 网络；匿名截图放在忽略的 `build/audit/browser-smoke/`。不代表真实课程的分数／教师规则已逐项核对，也未测真实延迟或长期会话。

仍不支持通用 hurdle、正式 WAM/GPA、成绩流式响应或课程主页 fingerprint；这些也不是此次可直接搬用的成熟计算规则。详情按需补全仍会增加冷启动页面请求，页缓存和并发边界用于减少重复，不宣称固定提速倍数。全部改动按完成批次本地 commit，未 push。

### Grades 量表保留（用户规则调整）

API item 的 `gradeRange` 保留 Grades Range 原文，包含 `Fail–Pass` 文本量表；原解析器只保留数值上限，无法分辨该量表与缺失满分。Pass/Fail 不使用 Percentage 栏换算，显式 Ungraded 不作为发布成绩。快照升为 v9，避免旧快照缺少 Range。未出分行仍在服务内部用于资料匹配与分类原始份额；展示过滤不得改变已出分项的权重。
