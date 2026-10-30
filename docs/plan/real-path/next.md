# Next Execution Pointer

> 执行 Agent 每次开始工作先读这个文件。不要跳过阶段，不要等待阶段间确认。

- **current_stage:** done
- **status:** complete（Gmail/Ed/Moodle live；真实数据校准完成）
- **stage_name:** 真实账号验证
- **next_action:** none；三个来源已真实同步并重启验证
- **stage_file:** [plan.md](plan.md) §12
- **last_verified:** 2026-10-30 S8：Gmail 678；Ed 1586；Moodle 6 简报 + 535 资料；全量完成；service 33 tests；E2E pass；resource 下载代理；公告正文抽取
- **blocked:** none（Moodle 当前单元无论坛链接，论坛返回 0；真实 holdout 可选）
- **next_stage:** none

## 完成 S8 前必须做

1. ~~Google OAuth client / Gmail 授权~~ 已完成；
2. ~~Ed token / Moodle session~~ 已完成；
3. ~~三源同步、原文链接、重启持久~~ 已完成；
4. Moodle 当前课程无论坛链接，论坛同步返回 0；这是源内容为空，不是解析失败；
5. 真实 holdout（10 条）仍是可选后续；
6. 状态已标记 done。

## 硬阻塞时

记录到 `blocked`，继续做不依赖它的阶段；最后一次性列出需要用户做的事。不能把 mock 通过写成“真实账号已接通”。
