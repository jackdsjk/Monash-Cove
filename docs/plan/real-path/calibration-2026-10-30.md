# 真实数据分诊校准（2026-10-30）

## 结果

同一批真实数据，在规则校准前后：

| 指标 | 校准前 | 校准后 |
|---|---:|---:|
| 条目总数 | 116 | 117 |
| critical | 20 | 7 |
| important | 8 | 8 |
| reference | 85 | 99 |
| actionRequired = yes | 67 | 9 |

校准后仍然 critical 的条目：

1. Moodle Portfolio Submission
2. Moodle Assignment 4 Part 1
3. Moodle Assignment 4 Part 2
4. Moodle Assignment 4 Part 3 Override
5. Moodle Assignment 4 Part 4 Override
6. Moodle Self-Reflective Question closes
7. Ed Week 14 test sitting details

## 改了什么

- 超过 7 天、且没有未来 ISO 日期的旧内容：
  - `critical` / `important` 降为 `reference`；
  - `actionRequired = yes` 降为 `no`；
  - 仍然保留在“过去的内容”里，不删除。
- 学生提问不再仅因为出现 “pass the unit” 就变 critical；
- 学生提问默认不需要用户行动；没有教师答复时标为 `uncertain`；
- `reference` / `skip` 不再出现 `actionRequired = yes`；
- 规则版本从 `rules-v1` 升到 `rules-v2`，旧内容会带 `rules-v2-stale`。

## 典型修复

- `Unit Hurdle failed can I still pass the unit`：学生提问，不再 critical；
- `Assignment 1 is available on Moodle`（约 90 天前）：不再 critical/action；
- `More reminder for Assignment 2`（约 55 天前）：不再 critical/action；
- 未来 Moodle deadline：仍保持 critical；
- 当前教师 deadline：仍保持 critical。

## 已知边界

- Ed 的日期文本不是 ISO（如 “2nd October”），旧的 Ed deadline 主要靠“发布时间超过 7 天”降级，而不是精确判断截止日期；
- 真实 holdout 还没有独立标注，当前是同一批数据的校准，不是泛化指标；
- 模型仍未启用；当前结果全部来自规则；
- 下次真实同步会按 `rules-v2` 重新分类新条目；已有条目用 `npm run retriage` 重跑。
