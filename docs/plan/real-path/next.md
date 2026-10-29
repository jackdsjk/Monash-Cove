# Next Execution Pointer

> 执行 Agent 每次开始工作先读这个文件。不要跳过阶段，不要等待阶段间确认。

- **current_stage:** S1
- **status:** ready（尚未开始）
- **stage_name:** 本地运行时 + fixture API
- **next_action:** 建 `local-service/` 骨架，Node 26 + TypeScript + Fastify，`GET /health` 返回 `{ok:true}`
- **stage_file:** [plan.md](plan.md) §5
- **last_verified:** —
- **blocked:** none
- **next_stage:** S2（SQLite + 持久状态）

## 完成 S1 后必须做

1. 运行 `cd local-service && npm test` 和 `cd webapp && npm run check`；
2. 在 [execution-log.md](execution-log.md) 追加一行；
3. 把本文件的 `current_stage` 改为 `S2`，`status` 改为 `ready`，`next_action` 改成 S2 第一项；
4. 立即继续，不向用户总结。

## 硬阻塞时

记录到 `blocked`，继续做不依赖它的阶段；最后一次性列出需要用户做的事。不能把 mock 通过写成“真实账号已接通”。
