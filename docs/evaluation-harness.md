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

课程字段直接沿用匿名样本中的结构化课程归属，仅作为输入保留，不把它伪装成课程识别评测结果。

当前不实现：

- LLM 或外部 API；
- 真实连接器回放；
- UI 或桌面应用；
- DeepEval、Promptfoo、LlamaIndex 等新依赖；
- 多模型比较和 CI 门禁；
- 语义重复自动聚类；
- 自动生成摘要的忠实度评测；
- 生产数据写入。

## 4. 规则边界

规则集中在 `scripts/evaluation/replay-triage.mjs`，并保持可解释：

1. Moodle assessment 先识别为 `assessment_fact`；明确 override 或要求变化时识别为 `requirement_change`；
2. 学生提问且没有权威答复时识别为 `peer_question`，行动标记为 `uncertain`；
3. 教师回复学生问题时识别为 `staff_answer`；
4. 录播、幻灯片、练习题等识别为 `learning_material`；
5. 缴费、图书馆、账户和考试行政内容识别为 `administrative`；
6. 调查、招募、活动和抽奖识别为 `promotion`；
7. 截止时间、提交要求、考试地点、资格或账户安全变化提高重要性；
8. 摘要证据采用样本文本中的抽取句，不凭空生成事实。

规则 baseline 的目的不是证明最终产品已经可靠，而是先提供一个透明、可重复的最低基线。

## 5. 运行方式

在父仓库根目录运行：

```bash
node scripts/evaluation/replay-triage.mjs
node scripts/evaluation/replay-triage.mjs --json
node scripts/evaluation/replay-triage.test.mjs
```

默认输出 Markdown 报告；`--json` 输出包含逐条分歧的机器可读 JSON 报告。报告不写入 Git，避免把生成结果混入源文件。

## 6. 当前结果

## 6.1 当前 baseline 结果

在当前规则版本和 55 条匿名改写 prototype 集上运行：

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

这些结果只用于验证规则 baseline 和回放流程，不代表真实用户效果，也不代表生产质量。

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
- 指标定义和隐私边界写入本文档；
- 测试覆盖输入完整性、规则关键路径和指标计算；
- 不修改 Cove Worker、账号数据或外部服务。
