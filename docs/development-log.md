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
- 当前规则版本的 baseline 指标记录。

当前未完成：

- 真实脱敏用户样本替换 prototype 集；
- 完整语义去重评测；
- 多模型或提示词矩阵；
- 摘要忠实度的严格评测；
- CI 评测门禁；
- MVP 功能取舍及可操作产品界面。

### 当前实现边界

本阶段的代码只位于根仓库的 `scripts/evaluation/`，输入和规范位于 `docs/`。回放器：

1. 读取匿名样本与最终裁决标签；
2. 用确定性规则预测 `authority`、`content_type`、`importance`、`action_required` 和 `open_original`；
3. 检查证据句是否来自样本文本；
4. 输出字段准确率、重要信息召回率、重要信息精确率、关键误报率、低价值压缩率和按来源结果；
5. 输出全部分歧样本，按严重度和失效模式归类，并生成 Bad Case 清单。

它不访问 Gmail、Ed、Moodle，不读取真实账号，不调用模型或外部 API，也不向 Cove Worker、数据库或外部服务写入数据。

### 当前 baseline

以下结果来自 55 条匿名改写 prototype 集，只用于验证规则和回放流程，不代表真实用户效果或生产质量：

| 指标 | 结果 |
|---|---:|
| 重要信息召回率 | 86.2% |
| 重要信息精确率 | 80.6% |
| 关键误报率 | 29.4% |
| 低价值压缩率 | 76.9% |
| 证据支持率 | 100.0% |
| `authority` 准确率 | 100.0% |
| `content_type` 准确率 | 78.2% |
| `importance` 准确率 | 72.7% |
| `action_required` 准确率 | 74.5% |
| `open_original` 准确率 | 58.2% |

同一版本下有 36 条样本存在至少一个字段分歧：高 15、中 7、低 14。其中 `authority` 直接沿用样本的 `author_role`，证据句由原文切句得到，`open_original` 由 `importance` 与 `action_required` 推导，因此 100% 与 58.2% 不是独立能力指标；只有 `content_type`、`importance` 和 `action_required` 是从文本判断的字段，后两者依赖 `content_type`。

### 分支与提交状态

- 工作分支：`codex/triage-evaluation-harness`；
- 基线：`master` 的 `159006f`；
- 本阶段提交（均未 push）：`1099491` harness、`7dec247` 状态文档、`Expand triage replay output with failure taxonomy and bad cases`、`Sync evaluation docs and clarify repo boundaries`；
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

## 三、下一步开发顺序

1. 基于当前 baseline 和 Bad Case 清单完成 MVP 功能取舍，明确 P0、延后项和非目标；
2. 按 Bad Case 优先级修复规则：先处理误报 `critical` 和漏判行动要求，再看漏判高价值；
3. 设计匿名 Demo 的 Today / Since Last Check 核心流程；
4. 只有在 MVP 边界稳定后，再评估真实脱敏样本、模型评测和语义去重是否值得引入；
5. 产品界面可以运行后，再安装并使用对应的 UI 和端到端测试技能。

## 四、相关文档

- [项目路线图](project-resume-roadmap.md)
- [最小评测 harness 方案](evaluation-harness.md)
- [信息分诊标注规范](information-triage-labeling-guide.md)
- [价值回放记录](value-replay-2026-10-28.md)
- [文档导航](README.md)
