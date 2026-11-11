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

## 逐项差异复核：仍未使用的部分

本次比较本项目 `b814117` 与上述 Muster v0.5.1 本地版本，范围覆盖抓取、状态、计算、同步、展示、提醒和诊断。只读取源码并运行匿名内存样例，不改变业务代码，不读取新账号数据。以下为复核结论，不表示功能已实现。

### 计算器和基础规则已接入

逐文件 diff 确认 `gradeBreakdown.ts` 及对应上游测试只有类型 import 路径不同。分类 ID、分类权重分摊、明确子项比例、空考试、重复空结构去除、0 分、字母不可换算、已评／待评／隐藏拆分、50 分普通及格线等核心算法均已复制。Grades 标记门槛、活动 ID 优先匹配、同名去歧义、支持门户排除也已接入；这些不是待办。

### 直接影响成绩完整性的缺口

| 缺口 | Muster 的实现与证据 | 本项目现状与影响 | 建议 |
|---|---|---|---|
| 分类标题补权重 | `scraper.rs:1023–1027` 在 Widget 权重缺失时对每行名称调用 `parse_weight_percent` | `assessment-structure.ts` 的 Type A 分类只读取 `.weight-content`，未回退标题。子项标题比例已由原计算器处理，遗漏的是分类头 | 最先补齐；可直接移植该回退 |
| 作业详情补分数和反馈 | `enrich_assessment_statuses`（1249）、`parse_submission_status_from_html`（1645）；详情和 Grades 相互补足；反馈实体解码并去残留标签（1844） | 成绩页仅用 Grades 的分数、反馈和满分；另一路 `MoodleClient.submissionStatus` 仅返回状态枚举，不将详情分数／反馈送入成绩模型 | 仅为同课程 Grades 已确认项目按需补全；不能拿普通活动扩充评分项 |
| 已批改但分数隐藏 | 详情解析独立保留 `graded`，识别 Grading status 和 `td.submissiongraded`；`submissionState.ts:5` 给已评分证据最高优先级 | Grades 页只根据数字或非空 gradeText 判断；没有状态证据字段。另一同步路径即使识别 graded，也没有与成绩行关联 | 保留“已评分、分数未公开”，不当成待评分或 0；字母成绩本身已支持 |
| 测验专用完成和成绩解析 | `parse_quiz_submission_from_html`（5258）、`parse_quiz_grade_from_html`（5296），处理 Finished／final grade／attempts，排除日期形似分数 | Grades 中的 quiz 已能显示和关联，但提交复核仅处理 `/mod/assign/`，没有 quiz 详情解析及补分数链路 | 移植判断与反例测试；已完成测验不再误判为待完成 |
| 跨课程总评 Overview | `fetch_grade_overview`（2766）读取 `/grade/report/overview/index.php`；`parse_grade_overview` 保留课程 ID、字母和原文 | 目前只有单课程 user report 的 total；没有独立 Overview 来源 | 增加独立原文来源，不能把裸总评臆定成满分 100，也不能用它补分类权重 |
| 增量同步复核成绩 | `recheck_assignment_statuses`（1135）即便课程指纹没变化仍复核未评分项目详情，再读一次 Grades，并仅返回差异 | `reconcileSubmissions` 只查最近 30 天有 due 的 assign 状态；成绩快照独立按 5 分钟 TTL／进入页面／手动刷新读取。一般 Moodle 同步没有同样的成绩差异合并链路 | 补 Grades 已确认项目的状态／分数复核；复用现有缓存，不用整页反复全量读取 |

匿名反例已执行：分类标题 `Exam (60%)`、`.weight-content` 为空时，本地解析 weight/categoryWeight 均为 null，计算 totalWeight 为 0；按上游补标题 weight 后 totalWeight 为 60。这个缺口可以复现，但未确认仍缺权重的真实课程是否采用该格式。

### 已算出但未充分展示，以及尚未接入的功能

| 模块 | Muster 已有 | 本项目差异 | 复用方式／优先级 |
|---|---|---|---|
| 分类明细 | `GradeBreakdown.tsx:116` 每类显示已得／权重、分类进度、子项状态 | 我们目前只显示分类名称／百分比标签，评分项仍是平铺列表 | 可复制 TypeScript 组件逻辑，适配现有样式和文案；优先完善可解释性 |
| 风险结论 | `useOutlook` 和 `CourseGradeRow` 展示 passed/on-track/at-risk/unreachable 等 | 计算器已返回 outcome，但页面没消费；只展示距 50 还差和剩余均分要求 | 复用状态映射，保留本地完整权重与可读分数门槛；不能直接照抄不完整结构下的风险措辞 |
| 首页与读屏 | Dashboard 显示课程成绩入口；GradeBar 有 role/aria-label，图例语义化 | 成绩集中在独立页面，进度条缺同等文字可访问描述 | 展示增强，优先级低于数据准确性 |
| 成绩学期切换 | Dashboard 默认 current，课程成绩跟随 displayCourses 的学期、隐藏及置顶排序（1282、1315） | 后端已遵循课程同步范围，但默认 activeSemester=null；成绩页没有独立学期快捷切换或置顶排序 | 属于部分接入；可参考展示层筛选，不应为切换视图强制重新读取上游 |
| 成绩发布提醒 | `Dashboard.tsx:770` 对比 Overview，首次同步不提醒，后续有新值时显示应用横幅／系统通知 | 没有成绩快照差异驱动的专用提醒；一般消息分诊不是同一功能 | 可移植 diff 和首次同步保护，通知方式适配本项目，避免重复提示 |
| 成绩结构诊断 | `diagnostics.ts:33,42` 输出 gradeShape、带满分数量、分类／活动链接数量、权重和及 outcome，不含分数或反馈 | 本次能用临时脚本输出匿名计数，但产品内没有可复用的成绩诊断入口 | 可直接复制纯 TypeScript 诊断逻辑；便于定位缺权重、缺满分、匹配失败 |
| 同步内页面缓存和节流 | `http.rs:46,79` 对同 URL 合并请求并在一次同步内缓存；`scraper.rs:192` 共享作用域；429/503 延长共享 gate 冷却 | 已有结果级 SQLite 缓存、请求合并和前端共享查询，不缺基本 cache；Moodle transport 没有同等 URL 级页面共享和全局 Retry-After 节流 | 参考 Rust 思路适配 Node；用于资料和成绩共享页面、避免并发重复读，不能替代结果快照 |
| 学习建议中的成绩事实 | `studyGuide/facts.ts:10,56` 保留已验证分数，分类权重标 estimated；单独的 buildGuideScore 对不明确规则返回 unknown。`StudyGuidePanel.tsx:73` 实际使用；Overview 还进入 priorities 上下文 | 本地分诊模型处理单条消息，不消费成绩快照或提供同等成绩事实／学习建议链路 | 后续学习规划功能再考虑；纯 TS 可复用。`aiContext.ts` 的可选 gradeEntries 字段不是独立抓取器，不应把声明当成完整已接入链路 |

### 本地额外薄弱点与不宜直接复制的部分

- Assessments 请求失败时返回空结构并提示，单课 Grades 成功仍会覆盖旧课程快照；现有整课失败回退不能保证旧权重继续保留。这是本地缓存粒度缺口，不能说 Muster 已有一份能直接复制的“保留旧 Assessments 结构”实现。可参考其失败保留状态、按课程／项目合并的思想，单独标记旧结构时间和来源。
- Muster `useOutlook` 使用原 outcome；原计算器在已知权重仅 20 时也可能给出 unreachable。我们当前对及格推断有更严格的门槛，应保留，不能把部分权重误当全部。
- Muster 也没有通用 hurdle 判定或正式 WAM/GPA 算法，不能列成“漏搬的成熟模块”。其 LinksPage 只是引导至 WES 查看正式学籍成绩。
- Rust 抓取、Tauri WebView 和系统通知不能逐字搬入 Node/Web App；可移植解析规则与测试。无需为了成绩功能引入 Tauri。参考仓库会保存部分 HTML 调试材料，不应照搬为真实学生页面自动落盘。

建议顺序：标题权重回退 → Grades 确认后的详情补全与隐藏评分状态 → quiz 解析及增量复核 → Overview 原文 → 分类明细／诊断 → 成绩提醒与页面共享缓存 → 学习建议集成。以上需要后续实施和各自回归，本轮未将待办表述为已修复。
