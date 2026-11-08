# Cove 文档导航

本目录同时保存当前产品定义、执行路线和早期探索。为避免不同阶段的方案互相覆盖，后续按下表判断文档职责。

## 当前事实来源

| 文档 | 职责 | 当前状态 |
|---|---|---|
| [PRD-Monash-Agent.md](PRD-Monash-Agent.md) | 当前产品问题、用户、价值主张、AI 边界和第一版方案 | **当前产品定义** |
| [project-resume-roadmap.md](project-resume-roadmap.md) | 从产品定义到 MVP、评测、Demo 和简历证据的阶段路线 | **当前执行路线** |
| [mvp-scope-2026-10-29.md](mvp-scope-2026-10-29.md) | 第一版 P0/P1、功能评分、验收标准和明确砍掉项 | **P0 初版已锁定** |
| [webapp-design.md](webapp-design.md) | 本地 Web App 的信息架构、布局、token、组件映射和状态设计 | **设计已落地为 v0.1 骨架** |
| [../webapp/README.md](../webapp/README.md) | 本地 Web App 的运行、范围和边界 | **S1–S8 完成；三源 live；Moodle 论坛当前无内容** |
| [../local-service/README.md](../local-service/README.md) | 本地 Node/SQLite/API 服务、运行方式、安全边界 | **S1–S8 完成；三源 live；Moodle 论坛当前无内容** |
| [ui-component-audit-2026-10-30.md](ui-component-audit-2026-10-30.md) | 前端组件现状、第三方 UI 仓库索引、替换表和本次小幅改造 | **Command palette 已落地** |
| [plan/real-path/plan.md](plan/real-path/plan.md) | Agent 执行计划：S1–S8、连续执行规则、阶段验收和阻塞处理 | **S1 ready；未开始实现** |
| [information-triage-labeling-guide.md](information-triage-labeling-guide.md) | 真实样本的匿名化、人工标注口径与第一版评测指标 | **当前评测规范** |
| [value-replay-2026-10-28.md](value-replay-2026-10-28.md) | 第一轮真实数据统计、价值判断及继续/停止标准 | **当前验证记录** |
| [gold-set-human-review-2026-10-28.md](gold-set-human-review-2026-10-28.md) | 给项目所有者直接勾选和填写的 55 条人工复核表 | **人工操作入口** |
| [gold-set-samples-2026-10-28.json](gold-set-samples-2026-10-28.json) / [gold-set-adjudication-2026-10-28.json](gold-set-adjudication-2026-10-28.json) | 55 条匿名改写样本、两轮独立标注与裁决 manifest | **prototype 机器审计资产；真实脱敏样本待完成** |
| [evaluation-harness.md](evaluation-harness.md) | 最小离线分诊回放器：规则边界、指标口径、失效模式归类和 Bad Case 清单的生成方式 | **最小版本已完成** |
| [model-eval-gpt-5.6-luna-2026-10-29.md](model-eval-gpt-5.6-luna-2026-10-29.md) | 当前模型的单次真实回放、规则 baseline 对比和限制 | **一次回放；完整矩阵后置** |
| [../demo/README.md](../demo/README.md) | 匿名可操作浏览器 Demo：简报、筛选、详情、纠错和本地状态 | **匿名原型；非桌面壳** |
| [development-log.md](development-log.md) | 当前开发记录、分支提交状态、验证结果和按日期排列的开发日志 | **当前开发记录** |
| [productization-and-resume-plan-draft.md](productization-and-resume-plan-draft.md) | 产品化与求职项目建设的完整分析和备选项 | 背景分析，可继续修改 |
| [ecosystem.md](ecosystem.md) | GitHub 竞品、开源生态与许可证调查 | 调研依据 |
| [stack.md](stack.md) | 已安装工具、真实接入状态和技术约束 | 技术事实记录 |

## 历史与参考材料

| 文档 | 用途 | 使用边界 |
|---|---|---|
| [product-plan.md](product-plan.md) | “Monash 私人秘书”的长期愿景与可信度原则 | 不是当前 MVP 范围 |
| [business-plan.md](business-plan.md) | Windows 工具包、定价与分发假设 | 当前暂不执行运营和商业化部分 |
| [curriculum.md](curriculum.md) | 早期八周学习与构建课程 | 不是当前开发顺序 |
| [learning/agents-101.md](learning/agents-101.md) | Agent 基础知识学习材料 | 不决定产品范围 |

## 维护规则

- 产品定位或 MVP 改变时，优先更新 PRD。
- 阶段顺序、完成标准或简历证据改变时，更新路线图。
- 已验证的接入、版本和限制写入 `stack.md`，不写入 PRD。
- 竞品和许可证变化写入 `ecosystem.md`。
- 历史方案保留用于解释决策背景，但不得覆盖当前 PRD。
- 所有用户、指标和结果必须区分“计划目标”和“已经实现”。
