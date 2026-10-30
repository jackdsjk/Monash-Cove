# Cove 开发记录与开发日志

> 最后更新：2026-10-29
>
> 本文记录当前项目的可核验开发状态、已完成工作、验证结果和后续边界。详细产品定义、评测规范和实现方案仍以对应专题文档为准。

## 一、当前开发记录

### 项目定位

Cove 是面向 Monash 学生的跨来源信息分诊产品：把 Gmail、Ed 和 Moodle 中需要关注的内容整理成可解释的注意力层级，并保留原始来源和证据。当前重点不是扩大连接器数量，而是先证明“重要信息能被可靠识别、低价值内容能被安全压缩”。

### 当前阶段

项目处于“价值回放完成最小闭环，准备进入 MVP 取舍”的阶段。

已经完成：

- 产品定义、AI 边界和项目路线图初版；
- Gmail、Ed、Moodle 等接入能力的前期验证记录；
- 55 条匿名改写 prototype Gold Set：Gmail 25 条、Ed 25 条、Moodle 5 条；
- 两轮 agent-assisted 标注及裁决 manifest；
- 无模型、无网络、无新增依赖的最小离线 replay/evaluation harness；
- 确定性分诊规则 baseline、测试和 Markdown/JSON 报告输出；
- 全部分歧输出、失效模式归类和高/中/低优先级 Bad Case 清单；
- 规则修复：否定作用域、行政优先级、行动要求线索和 Moodle 关闭时间档位；
- 当前规则版本的 baseline 指标记录；
- 匿名可操作浏览器 Demo：简报分组、来源/搜索筛选、详情与证据高亮、纠错反馈、本地状态和模拟同步；
- MVP P0 范围初版：五个能力域、ICE 评分、验收标准和明确砍掉项；
- 本地 Web App 设计规范：Ant Design v6 参考、布局、token、组件映射和状态设计；
- 本地 Web App v0.1 骨架：Vite + React + Ant Design，简报、Drawer、纠错、数据源和设置页面。

当前未完成：

- 真实脱敏用户样本替换 prototype 集；
- 完整语义去重评测；
- 摘要忠实度的严格评测；
- 未参与调参的 holdout 模型回放与完整模型/提示词矩阵；
- CI 评测门禁；
- S8 真实账号验证：Gmail OAuth、Ed token、Moodle session 和真实样本。

### 当前实现边界

本阶段代码分为三块：评测代码位于 `scripts/evaluation/`，静态原型位于 `demo/`，本地 Web App 位于 `webapp/`；输入和规范位于 `docs/`。确定性回放器本身：

1. 读取匿名样本与最终裁决标签；
2. 用确定性规则预测 `authority`、`content_type`、`importance`、`action_required` 和 `open_original`；
3. 检查证据句是否来自样本文本；
4. 输出字段准确率、重要信息召回率、重要信息精确率、关键误报率、低价值压缩率和按来源结果；
5. 输出全部分歧样本，按严重度和失效模式归类，并生成 Bad Case 清单。

评测回放器不访问 Gmail、Ed、Moodle，不读取真实账号，不调用模型或外部 API，也不向 Cove Worker、数据库或外部服务写入数据。`demo/` 是零依赖静态原型；`webapp/` 是 Vite + React + Ant Design 的本地 Web App，读取同一份匿名 fixture，并用 `localStorage` 保存纠错、已读和查看窗口。两者都不包含真实登录、同步或来源链接。

### 当前 baseline

以下结果来自 55 条匿名改写 prototype 集，只用于验证规则和回放流程，不代表真实用户效果或生产质量：

| 指标 | 结果 |
|---|---:|
| 重要信息召回率 | 89.7% |
| 重要信息精确率 | 89.7% |
| 关键误报率 | 0.0% |
| 低价值压缩率 | 88.5% |
| 证据支持率 | 100.0% |
| `authority` 准确率 | 100.0% |
| `content_type` 准确率 | 90.9% |
| `importance` 准确率 | 83.6% |
| `action_required` 准确率 | 92.7% |
| `open_original` 准确率 | 60.0% |

同一版本下有 29 条样本存在至少一个字段分歧：高 4、中 7、低 18。其中 `authority` 直接沿用样本的 `author_role`，证据句由原文切句得到，`open_original` 由 `importance` 与 `action_required` 推导，因此 100% 与 60.0% 不是独立能力指标；只有 `content_type`、`importance` 和 `action_required` 是从文本判断的字段，后两者依赖 `content_type`。这些数字是在同一批样本上调整规则得到的样本内结果，不能当作泛化能力。

### 分支与提交状态

- 工作分支：`codex/triage-evaluation-harness`；
- 基线：`master` 的 `159006f`；
- 本阶段提交（均未 push）：`1099491` harness、`7dec247` 状态文档、`Expand triage replay output with failure taxonomy and bad cases`、`Sync evaluation docs and clarify repo boundaries`、`Fix false critical triage rules and missed action cues`、`Update triage baseline after rule fixes`、`Record gpt-5.6-luna model replay`、`Add anonymous interactive demo`、`Lock MVP scope and P0 acceptance criteria`、`Add webapp design spec`、`Add local webapp skeleton`；
- 提交已创建于本地，尚未 push；
- `docs/.miaoyan-conflicts/` 是既有未跟踪目录，已加入 `.gitignore`，未提交；
- `stack/unicorn/wrangler.jsonc` 的既有本地修改不属于本阶段范围，未触碰。

## 二、开发日志

### 2026-10-28：形成 prototype Gold Set

- 建立 55 条匿名改写样本，覆盖 Gmail、Ed、Moodle；
- 按统一标注规范完成两轮 agent-assisted 标注；
- 记录裁决规则、字段一致性和重复组信息；
- 明确这些数据可以用于开发和流程验证，但不能冒充真实脱敏 Gold Set 或真实用户效果。

### 2026-10-29：确定轻量实现路线

- 决定不立即引入 DeepEval、Promptfoo、LlamaIndex 或模型服务；
- 将完整 harness、多模型矩阵、复杂语义去重、CI 门禁和真实样本替换写入后续开发方案；
- 新建 `codex/triage-evaluation-harness` 分支，避免直接修改 `main`；
- 确定最小回放器采用无模型、无网络、无新增依赖的确定性规则方案。

### 2026-10-29：完成最小 replay/evaluation harness

- 新增 `scripts/evaluation/replay-triage.mjs`；
- 新增 `scripts/evaluation/replay-triage.test.mjs`；
- 新增 `docs/evaluation-harness.md`，记录目标、数据边界、规则、运行方式和后续升级方案；
- 更新 `docs/README.md` 和 `docs/project-resume-roadmap.md`，补齐入口和阶段状态；
- 修正规则后重新计算 baseline，并把最新结果同步到评测方案和本日志。

### 2026-10-29：验证与本地提交

- `node scripts/evaluation/replay-triage.test.mjs` 通过；
- 两个 `.mjs` 文件的 Node 语法检查通过；
- Markdown 与 JSON 报告输出通过；
- `git diff --check` 通过；
- 仅提交本阶段 5 个目标文件，未提交既有冲突目录。

### 2026-10-29：补齐全部分歧与 Bad Case 输出

- 回放器不再把分歧截断到 20 条，默认输出全部 36 条并标注严重度；
- 新增失效模式归类，按首要失效模式统计到高/中/低三档；
- 新增 `--badcases`，按优先级生成可直接排期的 Bad Case 清单；
- 报告内嵌指标口径说明，标出 `authority`、证据支持率和 `open_original` 的构造性来源；
- 测试增加到覆盖不截断、计数一致、Bad Case 完整性和报告章节；
- 修正 `.gitignore`，把 `docs/.miaoyan-conflicts/` 与 `build/` 排除在版本控制外；
- 澄清根 `AGENTS.md` 中 `stack/unicorn` 与根仓库分诊方向的关系。

### 2026-10-29：修复 critical 误报与行动漏判

- 否定作用域：`deadline`、`requirement` 只出现在否定分句时，不再触发 `requirement_change`、`critical` 或行动要求；
- 行政优先级：`payment`、`finance`、`extension request` 优先识别为 `administrative`；行政类重复通知降级为 `skip`；
- 行动线索：补充 `required`、`reminds students`、`check-in`、`security review`、`replacement link`；
- Moodle 档位：quiz `closing time` 归 `important`，提交截止仍为 `critical`；
- 逐条对比上一版本：15 条样本改善、0 条退化；分歧 36→29，`critical` 误报 5→0，行动要求漏判 6→1；
- 未修复：`gmail-002` 的条件式登记要求与 `gmail-005` 的 gold 口径冲突；漏判 critical 与漏判高价值不在本轮范围；
- 这些调整基于同一批样本，指标提升属于样本内结果。

### 2026-10-29：完成 gpt-5.6-luna 单模型回放

- 使用当前 DSH desktop profile 的 `gpt-5.6-luna`，对 55 条样本逐条独立调用一次，共 55 次；
- 55/55 个 JSON 合法，55/55 个 `evidence_quote` 是原文连续子串；没有自动重试；
- 模型结果：重要信息召回率 100.0%、精确率 90.6%、关键误报率 22.2%、`open_original` 准确率 70.9%；
- 与规则 baseline 相比，模型召回率和原文打开建议更高，但关键误报、内容类型和行动要求仍需代码约束；
- 逐条比较四个主要判断字段：模型与规则都全对 16 条，只有模型全对 10 条，只有规则全对 10 条，两者都不是全对 19 条；
- 这是同一 prototype 集上的一次模型运行，没有 holdout、第二个模型或真人复核，不能当作泛化或生产质量证据。

### 2026-10-29：完成匿名可操作浏览器 Demo

- 新增 `demo/`：零依赖静态页面，覆盖自上次查看 / 全部内容、来源筛选、搜索、只看需要行动；
- 卡片支持查看原文、证据高亮、标为重要 / 不重要和分类反馈，状态保存在本机 `localStorage`；
- 空状态支持「模拟同步」，用于演示一次巡检结束后新内容如何出现；
- 数据来自 55 条匿名样本和 2026-10-29 的 `gpt-5.6-luna` 预录快照，没有真实账号、链接或实时模型调用；
- `node demo/test/core.test.mjs` 通过；浏览器桌面和 390px 移动视口检查通过，axe 自动检查 0 violations，控制台无报错。

### 2026-10-29：锁定 MVP P0 范围

- 新增 `docs/mvp-scope-2026-10-29.md`，用 ICE 对功能池评分；
- P0 锁定五个能力域：本地 Web 入口与首次连接、三源只读同步与状态、Since Last Check 简报、证据与原文、纠错与本地数据控制；
- 明确把语义去重、教师结论提炼、课程自动归属、OnTrack、提醒、问答和 MCP 放到 P1/P2；
- 验收标准按“用户能完成什么”定义，不以模型指标代替产品可用性；
- Demo 保留为匿名原型，不纳入 P0 交付验收。

### 2026-10-29：完成本地 Web App 设计规范

- 克隆 `ant-design/ant-design` 到 `refs/ant-design`（浅克隆，仓库已忽略）作为设计参考；
- 仓库没有 Web 设计 skill；`.agents/skills` 是维护类技能，实际使用 `DESIGN.md` 和 `docs/spec/*`；
- 新增 `docs/webapp-design.md`：信息架构、1440 画板、232px 侧栏、单列 feed、详情 Drawer、反馈 Modal；
- 采用 Ant Design v6 的 4px 网格、14px 正文、400/600 字重、6/8px 圆角、扁平卡片和状态语义；
- 不照搬 Ant 默认蓝和后台表格：主色改为深绿 `#1F5A46`，critical 用状态徽标而不是小号彩色 tag；
- 明确先做本地 Vite + React + Ant Design Web App，桌面壳和安装包后置。

### 2026-10-29：完成本地 Web App v0.1 骨架

- 新建 `webapp/`：Vite 8 + React 19 + TypeScript 7 + Ant Design 6；
- 实现简报页、注意力分组、来源筛选、搜索、只看行动、详情 Drawer、反馈 Modal；
- 实现数据源页、设置页和 localStorage 纠错/已读/查看窗口；
- 使用 Ant Design token 和自定义深绿主色，桌面 1280 与移动 390 检查通过；
- axe 自动检查 0 violations；控制台无应用错误；
- `npm run check` 通过：fixture 完整性 + TypeScript 构建；
- 真实 OAuth、同步和本地 Node 服务仍未接入。

### 2026-10-29：建立 Agent 执行计划

- 把原来的“给人看的计划”改为 Agent 自用的执行计划：S1 本地运行时 → S2 SQLite → S3 Gmail → S4 Ed/Moodle → S5 Moodle 帖子 → S6 分诊 → S7 交付 → S8 真实账号验证；
- 新增 `next.md` 作为跨会话执行指针，`execution-log.md` 记录每阶段验证；
- 规则改为：每阶段验收后更新 `next.md` 并立即继续，不请求阶段间确认；
- 只在用户凭据、不可逆操作或反复硬阻塞时停；mock 通过不能写成真实账号已接通；
- 初始状态为 S1 ready，尚未开始实现。

### 2026-10-30：完成 S1–S8 真实链路

- 新增 `local-service/`：Node 26 + Fastify + `node:sqlite`，API、SQLite、fixture seed、迁移和状态持久化；
- 新增 `SecretStore`（macOS Keychain）、Gmail OAuth loopback、Gmail client/history 同步；
- 新增 Ed、Moodle courses/assessments、Moodle forum HTML 适配器；所有真实来源用 mock/HTML fixture 测试；
- 新增规则分诊、可选 OpenAI-compatible 模型适配、证据子串校验和 critical 回退；
- Web App 改走本地 API，来源页可连接 Gmail/Ed/Moodle，纠错/已读写 API；
- 生产模式由本地服务同源提供 `webapp/dist`；`start-cove.sh` 可启动；
- 验证：service 22 tests；webapp check；Playwright 生产 E2E 通过；
- S8 真实账号完成：Gmail 20、Ed 91、Moodle 6，共 117 条；重启后三源仍 connected；
- Gmail 使用 OAuth + history；Ed 使用 token；Moodle 使用 `MoodleSession`；凭据只在 Keychain；
- Moodle 作业页当前没有可下载附件；论坛公告在课程页存在，但正文接口不可用；不是把 mock 当真实；
- 简报页“模拟一次同步”已改为真实 `POST /api/sync` ×3，浏览器网络面板均 200；
- 新增“过去的内容”折叠区：默认不打扰当前简报，展开后每次加载 20 条历史条目。
- 2026-10-30 真实数据校准：critical 20 → 7，action yes 67 → 9；旧 deadline 降级、学生提问不再 critical、低价值内容不再要求行动。
- 新增 Moodle `dueAt` / `deadlineKind` 结构化字段和独立的“倒计时”侧栏页面；按已截止、24 小时内、7 天内、更晚自动分组。
- Moodle 作业/资料下载检查：当前没有实现；只支持打开原始 Moodle 页面。
- 新增独立“每周资料”页面：按课程板块列出资料、作业/考核、公告/讨论和 label 说明；课程页抓取缓存到 SQLite；
- 公告正文通过 `mod_forum_get_discussion_posts` 抽取；Moodle resource 文件可通过本地服务代理下载（限 50 MB，仅 `mod/resource`）；
- 每周资料页增加搜索、类型和板块筛选，避免长列表只能滚动。
- 资料支持单选、全选筛选结果、批量 ZIP 下载（1–100 个 resource/url，总上限 100 MB）。
- ASSESSMENTS 板块里的 resource 归入“作业/考核”筛选，避免作业 specification/reflection template 被“资料”筛选隐藏。
- UI 组件审计：克隆并 CodeGraph 索引 shadcn、Nuxt UI、MUI；新增 shadcn command 风格的全局跳转面板，保留 AntD/Nuxt 不混用。
- 重做截止倒计时：深绿 hero 卡 + 紧凑分组行，精确到秒并每秒更新；修复 390px 下的横向溢出。
- 简报页增加类型、课程、只看未读筛选，和来源/搜索/只看行动/清除筛选组合。
- 设置页集中个人称呼/地区、全量同步、本地数据清理和边界；数据源页移除全量同步卡，只保留连接与增量同步；
- 首次设置根据课程名推断可能校区，显示确认提示但不静默锁定；每周资料增加地区筛选（马来西亚/澳大利亚/印度尼西亚），按课程和校区标注过滤；下载文件改用 Moodle 资料标题与真实扩展名，ZIP 使用课程/板块名；
- 新增 `/setup` 首次设置向导和自动跳转；Moodle 本地 headed-Chrome 登录助手捕获 `MoodleSession`，Gmail OAuth / Ed token 接入向导；
- 新增 Cove 品牌动态 loader：双轨道旋转、呼吸核心和三段节奏条，用于简报/倒计时/每周资料/数据源加载；
- 增加首次全量同步：Gmail 全部分页、Ed 全部分页、Moodle 全部课程资料；后台任务 + 来源进度 + 完成标记；App 打开时做限流增量。

## 三、下一步开发顺序

1. 真实三源已接通；后续按需补 Moodle 论坛有内容的课程；
2. 观察 Gmail Testing token 7 天过期并重新连接；
3. 评估桌面壳、云同步和完整评测矩阵；
4. 不再把 fixture/mock 结果写成真实账号结果。

## 四、相关文档

- [项目路线图](project-resume-roadmap.md)
- [最小评测 harness 方案](evaluation-harness.md)
- [信息分诊标注规范](information-triage-labeling-guide.md)
- [价值回放记录](value-replay-2026-10-28.md)
- [匿名可操作 Demo](../demo/README.md)
- [MVP 范围与优先级决策](mvp-scope-2026-10-29.md)
- [本地 Web App 设计规范](webapp-design.md)
- [本地 Web App 代码](../webapp/README.md)
- [真实数据长线计划](plan/real-path/plan.md)
- [文档导航](README.md)
