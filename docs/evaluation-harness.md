# Cove 分诊回放与评测方案

> 状态：最小离线版本已完成；完整 harness 后置
>
> 当前 branch：`codex/triage-evaluation-harness`

## 1. 目标

本模块用于快速验证 Cove 的第一版信息分诊规则是否能把匿名样本分成合理的注意力层级。它是离线实验工具，不是 Worker 功能，不访问 Gmail、Ed、Moodle，不调用模型，也不修改外部数据。

当前只实现一个小而可运行的回放器：

```text
匿名样本 + 已确认的 prototype Gold Set
→ 确定性规则 baseline
→ 字段比较与基础指标
→ 失效模式归类与 Bad Case 清单
→ Markdown/JSON 报告
```

## 2. 数据边界

- 样本输入：`docs/gold-set-samples-2026-10-28.json`；
- 当前标签：`docs/gold-set-adjudication-2026-10-28.json`；
- 人工操作入口：`docs/gold-set-human-review-2026-10-28.md`；
- 样本共 55 条：Gmail 25、Ed 25、Moodle 5；
- 当前 Gold Set 是项目所有者已复核的匿名改写 prototype 集，不等同于真实脱敏用户数据；
- 报告不得被解释为真实用户节省时间、遗漏规避或生产质量证明。

## 3. 当前实现范围

当前 baseline 只输出并评估：

- `authority`；
- `content_type`；
- `importance`；
- `action_required`；
- `open_original`；
- `evidence_quote` 是否来自样本文本；
- 重要信息召回率、重要信息精确率、关键误报率、低价值压缩率和字段准确率。

报告同时包含：

- 全部分歧样本（不截断），按严重度和 `sample_id` 排序；
- 失效模式归类，以及按模式、严重度的计数（JSON 报告另含按来源计数）；
- `--badcases` 生成的 Bad Case 清单，按高/中/低优先级分组；
- 指标口径说明，标出哪些指标是构造性结果而非独立判断能力。

课程字段直接沿用匿名样本中的结构化课程归属，仅作为输入保留，不把它伪装成课程识别评测结果。

确定性回放器当前不实现：

- LLM 或外部 API；
- 真实连接器回放；
- UI 或桌面应用；
- DeepEval、Promptfoo、LlamaIndex 等新依赖；
- 多模型比较和 CI 门禁；
- 语义重复自动聚类；
- 自动生成摘要的忠实度评测；
- 生产数据写入。

另有一次独立的 `gpt-5.6-luna` 真实模型回放，结果记录在 [模型回放记录](model-eval-gpt-5.6-luna-2026-10-29.md)；它不属于确定性回放器的一键离线路径，也没有改变规则 baseline 的输入边界。

## 4. 规则边界

规则集中在 `scripts/evaluation/replay-triage.mjs`，并保持可解释：

1. Moodle assessment 先识别为 `assessment_fact`；明确 override 或要求变化时识别为 `requirement_change`；提交截止为 `critical`，quiz 关闭时间等其他事实为 `important`；
2. 学生提问且没有权威答复时识别为 `peer_question`，行动标记为 `uncertain`；
3. 教师回复学生问题时识别为 `staff_answer`；
4. 录播、幻灯片、练习题、learning task 等识别为 `learning_material`；
5. 缴费、财务、延期申请、图书馆、账户和考试行政内容优先识别为 `administrative`；行政类重复通知降级为 `skip`；
6. 调查、招募、活动和抽奖识别为 `promotion`；
7. 截止时间、提交要求、考试地点、资格或账户安全变化提高重要性；
8. 被否定的截止或要求表述不触发 `requirement_change`，也不触发行动要求；否定作用域按分句判断，避免把 "not ... and reminds students to ..." 误判成否定；
9. 摘要证据采用样本文本中的抽取句，不凭空生成事实。

规则 baseline 的目的不是证明最终产品已经可靠，而是先提供一个透明、可重复的最低基线。

## 5. 运行方式

在父仓库根目录运行：

```bash
node scripts/evaluation/replay-triage.mjs             # 汇总报告（含全部分歧与失效模式）
node scripts/evaluation/replay-triage.mjs --json      # 机器可读报告
node scripts/evaluation/replay-triage.mjs --badcases  # 按优先级分组的 Bad Case 清单
node scripts/evaluation/replay-triage.test.mjs        # 自检
```

默认输出 Markdown 报告；`--json` 输出包含全部逐条分歧、失效模式统计和指标口径的机器可读 JSON；`--badcases` 输出可直接用于规则修复排期的 Bad Case 清单。需要留档时重定向到 `build/`，该目录已被忽略。报告不写入 Git，避免把生成结果混入源文件。

## 6. 当前结果

### 6.1 当前 baseline 结果

在当前规则版本和 55 条匿名改写 prototype 集上运行：

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

这些结果只用于验证规则 baseline 和回放流程，不代表真实用户效果，也不代表生产质量。本轮规则修复是在同一批样本上完成的，指标提升属于样本内结果；泛化能力需要用未参与调参的样本验证。

### 6.2 指标口径

- `authority` 直接沿用样本的 `author_role`（`staff_answer` 例外），100% 不代表识别能力；
- `evidence_quote` 由样本文本切句得到，`summary` 是 `title + evidence_quote`，证据支持率 100% 是构造结果；
- `open_original` 由 `importance` 与 `action_required` 推导，其准确率反映上游误差传导，不是独立能力；
- 当前只有 `content_type`、`importance` 和 `action_required` 是从文本判断的字段；后两者以 `content_type` 为中间结果，误差会向下传导；课程字段是输入，不是识别结果。

### 6.3 失效模式（当前规则版本）

55 条样本中有 29 条存在至少一个字段分歧，其中高 4、中 7、低 18。按首要失效模式统计：

| 失效模式 | 严重度 | 条数 |
|---|---|---:|
| 漏判高价值 | 高 | 2 |
| 漏判 critical | 高 | 1 |
| 漏判行动要求 | 高 | 1 |
| 误报高价值 | 中 | 3 |
| 重要性相邻档混淆 | 中 | 3 |
| 误报行动要求 | 中 | 1 |
| 原文跳转不符 | 低 | 15 |
| 行动确定性不符 | 低 | 2 |
| 内容类型不符 | 低 | 1 |

高优先级只剩 4 条：3 条是高价值内容被压到 `reference`，1 条是条件式行动要求没有被识别。上一版的 5 条 `critical` 误报已全部消除；`open_original` 类的 15 条低优先级分歧来自推导公式，暂不优先处理。

### 6.4 真实模型单次回放

2026-10-29 使用当前 DSH desktop profile 的 `gpt-5.6-luna`，对同一批 55 条样本逐条独立调用一次，共 55 次。模型没有工具、没有 Gold Set 标签，也没有看到规则 baseline；55/55 个 JSON 合法，55/55 个 `evidence_quote` 通过原文子串校验。

| 指标 | 规则 baseline | `gpt-5.6-luna` |
|---|---:|---:|
| 重要信息召回率 | 89.7% | **100.0%** |
| 重要信息精确率 | 89.7% | **90.6%** |
| 关键误报率 | **0.0%** | 22.2% |
| 低价值压缩率 | 88.5% | 88.5% |
| `content_type` 准确率 | **90.9%** | 80.0% |
| `importance` 准确率 | **83.6%** | 81.8% |
| `action_required` 准确率 | **92.7%** | 89.1% |
| `open_original` 准确率 | 60.0% | **70.9%** |

四个主要判断字段逐条比较：模型与规则都完全正确 16 条，只有模型完全正确 10 条，只有规则完全正确 10 条，两者都没有完全正确 19 条。模型提升了重要信息召回和原文打开建议，但仍有 22.2% 的关键误报；当前更适合作为有证据约束的辅助层，而不是独立的 `critical` 决策器。

详细记录见 [gpt-5.6-luna 分诊模型回放记录](model-eval-gpt-5.6-luna-2026-10-29.md)。这只是同一 prototype 集上的一次模型运行，不代表泛化能力；完整模型矩阵、holdout 样本和真人复核仍未完成。

## 7. 后续升级方案

完整评测 harness 暂时只作为后续方案记录，不阻塞 MVP：

1. 固定版本的 case schema、provenance 和难度轴；
2. 规则、提示词和模型矩阵；
3. 摘要忠实度与来源支持的更严格判定；
4. 语义重复的 pairwise precision/recall/F1；
5. 失败类型和回归报告；
6. DeepEval/Promptfoo 的可选接入；
7. CI 回归门禁；
8. 真实受控脱敏样本替换 prototype 集。

这些升级必须在最小版本证明有价值后再做，避免评测基础设施超过产品本身的开发规模。

## 8. 完成标准

- 一条命令可离线运行；
- 55 条样本全部参与；
- 输出结果确定且可复现；
- 全部分歧完整输出，不截断；
- 失效模式计数与分歧总数一致，Bad Case 清单可单独生成；
- 指标定义、口径说明和隐私边界写入本文档；
- 测试覆盖输入完整性、规则关键路径、指标计算和输出完整性；
- 不修改 Cove Worker、账号数据或外部服务。
