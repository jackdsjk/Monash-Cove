# Next Execution Pointer

> 执行 Agent 每次开始工作先读这个文件。不要跳过阶段，不要等待阶段间确认。

- **current_stage:** S8
- **status:** ready
- **stage_name:** 真实账号验证
- **next_action:** 用户提供 Google OAuth client、Ed token、Moodle session；然后在本机完成真实三源 smoke
- **stage_file:** [plan.md](plan.md) §12
- **last_verified:** 2026-10-30 S7：service 21 tests pass；webapp check；production E2E pass（mock/凭据缺失）
- **blocked:** gmail-live / ed-live / moodle-live / real-holdout（需用户本人 OAuth、Ed token、Moodle session、真实样本；代码路径 S1–S7 已完成）
- **next_stage:** none（S8 等待用户凭据）

## 完成 S8 前必须做

1. 在 `local-service` 配置 `GOOGLE_CLIENT_ID/SECRET`；
2. 在 `webapp` 数据源页录入 Ed token 和 Moodle session；
3. 运行 `curl http://127.0.0.1:4317/api/health`，按三条来源分别点“连接/立即同步”；
4. 验证真实条目、原文链接、纠错重启持久；
5. 在 [execution-log.md](execution-log.md) 追加真实结果；
4. 立即继续，不向用户总结。

## 硬阻塞时

记录到 `blocked`，继续做不依赖它的阶段；最后一次性列出需要用户做的事。不能把 mock 通过写成“真实账号已接通”。
