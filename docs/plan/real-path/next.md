# Next Execution Pointer

> 执行 Agent 每次开始工作先读这个文件。不要跳过阶段，不要等待阶段间确认。

- **current_stage:** S8
- **status:** partial（Gmail live；Ed/Moodle 待凭据）
- **stage_name:** 真实账号验证
- **next_action:** Gmail 已完成真实 OAuth/同步；继续获取 Ed token 和 Moodle session，完成三源 smoke
- **stage_file:** [plan.md](plan.md) §12
- **last_verified:** 2026-10-30 S8：Gmail 真实 OAuth；backfill 20；history 0；fixture Gmail 移除；service 22 tests
- **blocked:** ed-live / moodle-live / real-holdout（Gmail 已 live；Ed token、Moodle session、真实 holdout 待用户）
- **next_stage:** none（S8 等待用户凭据）

## 完成 S8 前必须做

1. ~~Google OAuth client / Gmail 授权~~ 已完成；
2. 在 `webapp` 数据源页录入 Ed token 和 Moodle session；
3. 分别同步 Ed/Moodle，确认真实条目、原文链接、论坛帖子；
4. 重启后验证纠错/已读持久，清除数据后无残留；
5. 补 10 条真实 holdout；在 [execution-log.md](execution-log.md) 追加结果；
6. 记录结果后把 `status` 改为 done。

## 硬阻塞时

记录到 `blocked`，继续做不依赖它的阶段；最后一次性列出需要用户做的事。不能把 mock 通过写成“真实账号已接通”。
