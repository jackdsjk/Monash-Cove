# gpt-5.6-luna 分诊模型回放记录

> 日期：2026-10-29
>
> 状态：一次真实模型回放；不是完整模型矩阵，也不是生产质量证明。

## 1. 运行边界

- 模型：`gpt-5.6-luna`；
- Provider：当前 DSH desktop profile 的 OpenAI-compatible provider；
- 样本：55 条匿名改写 prototype 集：Gmail 25、Ed 25、Moodle 5；
- 调用方式：每条样本独立调用一次，共 55 次；无工具、无网页检索、无真实账号访问；
- 输出：要求严格 JSON，字段为 `authority`、`content_type`、`importance`、`action_required`、`open_original` 和 `evidence_quote`；
- 结构校验：55/55 个 JSON 合法，55/55 个 `evidence_quote` 是原文连续子串；
- 重试：没有自动重试；本次 55 次均成功。

模型使用与人工 Gold Set 相同的字段定义，但没有看到 Gold Set 标签，也没有看到规则 baseline 输出。

## 2. 模型结果

| 指标 | gpt-5.6-luna |
|---|---:|
| 重要信息召回率 | 100.0% |
| 重要信息精确率 | 90.6% |
| 关键误报率 | 22.2% |
| 低价值压缩率 | 88.5% |
| 证据支持率（原文子串校验） | 100.0% |
| `authority` 准确率 | 100.0% |
| `content_type` 准确率 | 80.0% |
| `importance` 准确率 | 81.8% |
| `action_required` 准确率 | 89.1% |
| `open_original` 准确率 | 70.9% |
| 至少一个字段分歧的样本 | 29/55 |

### 按来源

| 来源 | 样本数 | `importance` 准确率 | `action_required` 准确率 | 有分歧样本 |
|---|---:|---:|---:|---:|
| Gmail | 25 | 84.0% | 92.0% | 12 |
| Ed | 25 | 80.0% | 84.0% | 14 |
| Moodle | 5 | 80.0% | 100.0% | 3 |

## 3. 与当前规则 baseline 对比

| 指标 | 规则 baseline | gpt-5.6-luna | 观察 |
|---|---:|---:|---|
| 重要信息召回率 | 89.7% | **100.0%** | 模型没有漏掉 Gold Set 中的高价值样本 |
| 重要信息精确率 | 89.7% | **90.6%** | 模型略高 |
| 关键误报率 | **0.0%** | 22.2% | 模型仍会把低价值内容置为 `critical` |
| 低价值压缩率 | 88.5% | 88.5% | 相同 |
| `content_type` 准确率 | **90.9%** | 80.0% | 规则更稳定 |
| `importance` 准确率 | **83.6%** | 81.8% | 规则略高 |
| `action_required` 准确率 | **92.7%** | 89.1% | 规则略高 |
| `open_original` 准确率 | 60.0% | **70.9%** | 模型更能理解是否需要核对原文 |

逐条比较四个字段（`content_type`、`importance`、`action_required`、`open_original`）：

- 模型与规则都完全正确：16 条；
- 只有模型完全正确：10 条；
- 只有规则完全正确：10 条；
- 两者都没有完全正确：19 条。

这说明两者存在互补性，但不能仅凭这 55 条样本决定生产架构。

## 4. 主要模型错误

- `content_type` 最常见错误是把 `required_action` 归为 `staff_announcement`（5 条）或 `requirement_change`（2 条）；
- `importance` 有 4 条把 `critical` 压成 `important`，也有 1 条把 `important` 提升为 `critical`；
- `action_required` 有 2 条漏判、2 条误报、2 条把 `uncertain` 判成 `yes`；
- `open_original` 最常见错误是把 gold `optional` 提升为 `required`（10 条）；
- 关键误报率为 22.2%，因此不能让模型独立决定高风险置顶或后续行动。

## 5. 当前判断

这次回放支持一个**混合架构候选**：

1. 用确定性代码保护来源、时间、权限、重复通知和高风险规则；
2. 让模型辅助课程归属、摘要、内容类型、重要性建议、原文打开建议和语义重复候选；
3. 对 `critical` 和行动要求保留证据约束，并在必要时让用户确认；
4. 用规则 baseline 和同一 Gold Set 做回归，不把一次模型运行当作最终结论。

本次结果是同一批样本上的一次模型回放，且 Gold Set 仍是 prototype 集；没有第二个模型或真人对模型输出做复核，也没有 holdout 样本。因此不能据此声称模型已经泛化或产品已经可靠。
